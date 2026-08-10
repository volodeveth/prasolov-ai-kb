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

const MATCH_COUNT = 20;
const RERANK_TOP_N = 5;
const MIN_RELEVANCE_SCORE = 0.1;

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

export interface RetrieveResult {
  chunks: RankedChunk[];
  timings: {
    embedding_ms: number;
    search_ms: number;
    rerank_ms: number;
  };
  empty: boolean;
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

  const chunks: RankedChunk[] = filterByRelevance(reranked, rerankRan).map((c) => {
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

  return {
    chunks,
    timings: { embedding_ms, search_ms, rerank_ms },
    empty: chunks.length === 0,
  };
}
