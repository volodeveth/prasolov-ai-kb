import dotenv from "dotenv";
import { readdir, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createServiceClient } from "../src/lib/supabase";
import { parseCorpusFile } from "../src/lib/corpus";
import { chunkText } from "../src/lib/chunker";
import { generateEmbeddings } from "../src/lib/embeddings";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CORPUS_DIR = path.resolve(__dirname, "..", "corpus");

dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });
const EMBED_BATCH_SIZE = 20;

interface DocSummary {
  slug: string;
  chunks: number;
  embedTokens: number;
}

async function ingestFile(
  supabase: ReturnType<typeof createServiceClient>,
  filename: string
): Promise<DocSummary> {
  const raw = await readFile(path.join(CORPUS_DIR, filename), "utf-8");
  const doc = parseCorpusFile(raw, filename);

  // Upsert document by slug
  const { data: upserted, error: upsertError } = await supabase
    .from("kb_documents")
    .upsert(
      {
        slug: doc.slug,
        title: doc.title,
        category: doc.category,
        roles: doc.roles,
        updated_at: doc.updated,
      },
      { onConflict: "slug" }
    )
    .select("id")
    .single();

  if (upsertError || !upserted) {
    throw new Error(`${filename}: upsert kb_documents failed: ${upsertError?.message}`);
  }

  const docId = upserted.id as number;

  // Delete old chunks for this doc (re-ingest is idempotent)
  const { error: deleteError } = await supabase
    .from("kb_chunks")
    .delete()
    .eq("doc_id", docId);

  if (deleteError) {
    throw new Error(`${filename}: delete old chunks failed: ${deleteError.message}`);
  }

  const chunks = chunkText(doc.body, doc.slug);
  let embedTokens = 0;

  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const { embeddings, totalTokens } = await generateEmbeddings(
      batch.map((c) => c.content),
      "retrieval.passage"
    );
    embedTokens += totalTokens;

    const rows = batch.map((chunk, idx) => ({
      doc_id: docId,
      chunk_index: chunk.metadata.chunkIndex,
      content: chunk.content,
      embedding: embeddings[idx],
    }));

    const { error: insertError } = await supabase.from("kb_chunks").insert(rows);
    if (insertError) {
      throw new Error(`${filename}: insert kb_chunks failed: ${insertError.message}`);
    }
  }

  const { error: updateError } = await supabase
    .from("kb_documents")
    .update({ chunk_count: chunks.length })
    .eq("id", docId);

  if (updateError) {
    throw new Error(`${filename}: update chunk_count failed: ${updateError.message}`);
  }

  return { slug: doc.slug, chunks: chunks.length, embedTokens };
}

async function main() {
  const supabase = createServiceClient();
  const files = (await readdir(CORPUS_DIR)).filter((f) => f.endsWith(".md")).sort();

  console.log(`Знайдено ${files.length} файлів у corpus/. Починаю інжест...\n`);

  const summaries: DocSummary[] = [];

  for (const filename of files) {
    try {
      const summary = await ingestFile(supabase, filename);
      summaries.push(summary);
      console.log(`  ok  ${summary.slug} — ${summary.chunks} chunks, ${summary.embedTokens} tokens`);
    } catch (err) {
      console.error(`  FAIL  ${filename}: ${(err as Error).message}`);
      throw err;
    }
  }

  const totalChunks = summaries.reduce((sum, s) => sum + s.chunks, 0);
  const totalTokens = summaries.reduce((sum, s) => sum + s.embedTokens, 0);

  console.log("\nПідсумок:");
  console.log("slug".padEnd(38) + "chunks".padStart(8) + "tokens".padStart(10));
  for (const s of summaries) {
    console.log(s.slug.padEnd(38) + String(s.chunks).padStart(8) + String(s.embedTokens).padStart(10));
  }
  console.log("-".repeat(56));
  console.log(
    `docs: ${summaries.length}`.padEnd(38) +
      String(totalChunks).padStart(8) +
      String(totalTokens).padStart(10)
  );
}

main().catch((err) => {
  console.error("Інжест перервано з помилкою:", err);
  process.exit(1);
});
