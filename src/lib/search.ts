import { createServiceClient } from "./supabase";
import { generateQueryEmbedding } from "./embeddings";
import { rerankChunks } from "./reranker";
import type { Role } from "./corpus";

export type { Role };

export interface RankedChunk {
  id: number;
  doc_id: number;
  content: string;
  chunk_index: number;
  title: string;
  category: string;
  relevance_score: number;
}

interface HybridSearchRow {
  id: number;
  doc_id: number;
  content: string;
  chunk_index: number;
  title: string;
  category: string;
  rrf_score: number;
}

interface KbChunkRow {
  id: number;
  doc_id: number;
  content: string;
  chunk_index: number;
}

const MATCH_COUNT = 20;
const RERANK_TOP_N = 5;
const MIN_RELEVANCE_SCORE = 0.1;
const SIBLING_RELEVANCE_DECAY = 0.98;
const CONTEXT_CAP = 8;

/**
 * MIN_RELEVANCE_SCORE is calibrated for Jina's 0-1 cross-encoder scores.
 * When the RPC returns <= RERANK_TOP_N rows, rerankChunks() short-circuits
 * (see reranker.ts) and passes through raw RRF scores instead — tiny
 * numbers like ~0.016 (0.5/61 + 0.5/61) that the 0.1 threshold would
 * wrongly treat as "not relevant enough", wiping out every chunk. This
 * hits role-restricted queries hardest, since their allowed-doc pool is
 * small enough to trip the short-circuit. Only apply the threshold when a
 * real rerank happened.
 */
export function filterByRelevance<T extends { relevance_score: number }>(
  chunks: T[],
  rerankRan: boolean
): T[] {
  if (!rerankRan) return chunks;
  return chunks.filter((c) => c.relevance_score >= MIN_RELEVANCE_SCORE);
}

export interface SiblingRow {
  id: number;
  doc_id: number;
  content: string;
  chunk_index: number;
}

/**
 * Every corpus doc is split into exactly a couple of chunks at ingest time,
 * so a fact can end up living in a chunk that survives rerank right next to
 * a sibling chunk that didn't — the answer then cites the right doc but
 * misses a detail that was one paragraph away. This merges each surviving
 * chunk's untouched siblings back in as extra context, scored just under
 * their doc's surviving chunk so they read as "same doc, slightly less
 * central" rather than competing on their own merit (they were never
 * reranked). Survivors are never dropped; when the merge would exceed
 * `cap`, siblings belonging to the lowest-relevance docs are dropped first.
 */
export function mergeSiblings(
  survivors: RankedChunk[],
  siblings: SiblingRow[],
  cap: number
): RankedChunk[] {
  const survivorIds = new Set(survivors.map((s) => s.id));

  // Per-doc metadata + "doc relevance" (its best surviving chunk's score),
  // used both to fill in sibling title/category and to order/prune by doc.
  const docInfo = new Map<number, { title: string; category: string; relevance: number }>();
  for (const s of survivors) {
    const existing = docInfo.get(s.doc_id);
    if (!existing || s.relevance_score > existing.relevance) {
      docInfo.set(s.doc_id, {
        title: s.title,
        category: s.category,
        relevance: s.relevance_score,
      });
    }
  }
  const docRelevance = (docId: number) => docInfo.get(docId)?.relevance ?? -Infinity;

  const addedSiblingIds = new Set<number>();
  const siblingChunks: RankedChunk[] = [];
  for (const row of siblings) {
    if (survivorIds.has(row.id) || addedSiblingIds.has(row.id)) continue; // dedupe
    const info = docInfo.get(row.doc_id);
    if (!info) continue; // sibling of a doc that had no surviving chunk — ignore
    addedSiblingIds.add(row.id);
    siblingChunks.push({
      id: row.id,
      doc_id: row.doc_id,
      content: row.content,
      chunk_index: row.chunk_index,
      title: info.title,
      category: info.category,
      relevance_score: info.relevance * SIBLING_RELEVANCE_DECAY,
    });
  }

  let combined = [...survivors, ...siblingChunks];
  if (combined.length > cap) {
    const excess = combined.length - cap;
    const dropCandidates = [...siblingChunks].sort(
      (a, b) => docRelevance(a.doc_id) - docRelevance(b.doc_id)
    );
    const toDrop = new Set(dropCandidates.slice(0, excess).map((c) => c.id));
    combined = combined.filter((c) => !toDrop.has(c.id));
  }

  return combined.sort((a, b) => {
    const byDocRelevance = docRelevance(b.doc_id) - docRelevance(a.doc_id);
    return byDocRelevance !== 0 ? byDocRelevance : a.chunk_index - b.chunk_index;
  });
}

export interface RetrieveResult {
  chunks: RankedChunk[];
  timings: {
    embedding_ms: number;
    search_ms: number;
    rerank_ms: number;
    expand_ms: number;
  };
  empty: boolean;
  /** Number of sibling chunks pulled in beyond the reranked survivors. */
  expanded: number;
}

/**
 * Retrieval orchestration: embed the query, run hybrid search (BM25 +
 * vector, RRF-fused) scoped to the caller's role, then rerank down to the
 * top few chunks. When a real rerank ran, chunks below MIN_RELEVANCE_SCORE
 * are dropped as noise — better to answer from fewer, more relevant chunks
 * than pad the context. See filterByRelevance() for why that threshold is
 * skipped when rerankChunks() short-circuited instead of scoring.
 */
export async function retrieve(
  query: string,
  role: Role
): Promise<RetrieveResult> {
  const embeddingStart = Date.now();
  const { embedding } = await generateQueryEmbedding(query);
  const embedding_ms = Date.now() - embeddingStart;

  const searchStart = Date.now();
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("kb_hybrid_search", {
    query_text: query,
    query_embedding: embedding,
    user_role: role,
    match_count: MATCH_COUNT,
  });
  const search_ms = Date.now() - searchStart;

  if (error) {
    throw new Error(`kb_hybrid_search failed: ${error.message}`);
  }

  const rows: HybridSearchRow[] = data ?? [];

  const rerankStart = Date.now();
  const { chunks: reranked } = await rerankChunks(
    query,
    rows.map((row) => ({
      id: row.id,
      content: row.content,
      metadata: {
        doc_id: row.doc_id,
        title: row.title,
        category: row.category,
        chunk_index: row.chunk_index,
      },
      rrf_score: row.rrf_score,
    })),
    RERANK_TOP_N
  );
  const rerank_ms = Date.now() - rerankStart;

  // reranker.ts short-circuits (raw RRF scores, no Jina call) whenever the
  // RPC returned <= RERANK_TOP_N rows — see filterByRelevance() above.
  const rerankRan = rows.length > RERANK_TOP_N;

  const survivors: RankedChunk[] = filterByRelevance(reranked, rerankRan).map((c) => {
    const metadata = c.metadata as {
      doc_id: number;
      title: string;
      category: string;
      chunk_index: number;
    };
    return {
      id: c.id,
      doc_id: metadata.doc_id,
      content: c.content,
      chunk_index: metadata.chunk_index,
      title: metadata.title,
      category: metadata.category,
      relevance_score: c.relevance_score,
    };
  });

  // Sibling-chunk expansion: pull in the surviving chunks' doc-mates so a
  // fact that landed in the *other* chunk of an already-relevant doc isn't
  // lost. See mergeSiblings() for scoring/cap/ordering.
  const expandStart = Date.now();
  const docIds = [...new Set(survivors.map((c) => c.doc_id))];
  let chunks = survivors;
  if (docIds.length > 0) {
    const { data: siblingRows, error: siblingError } = await supabase
      .from("kb_chunks")
      .select("id, doc_id, content, chunk_index")
      .in("doc_id", docIds);

    if (siblingError) {
      throw new Error(`kb_chunks sibling fetch failed: ${siblingError.message}`);
    }

    chunks = mergeSiblings(survivors, (siblingRows as KbChunkRow[]) ?? [], CONTEXT_CAP);
  }
  const expand_ms = Date.now() - expandStart;

  return {
    chunks,
    timings: { embedding_ms, search_ms, rerank_ms, expand_ms },
    empty: chunks.length === 0,
    expanded: chunks.length - survivors.length,
  };
}
