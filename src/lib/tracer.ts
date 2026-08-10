import { createServiceClient } from "./supabase";
import type { Role } from "./search";

export interface KbTrace {
  trace_id: string;
  role: Role | string;
  query: string;
  answer: string;
  sources: unknown;
  embedding_ms: number;
  search_ms: number;
  rerank_ms: number;
  llm_ttfb_ms: number | null;
  llm_total_ms: number | null;
  total_ms: number;
  chunks_found: number;
  chunks_reranked: number;
  top_relevance_score: number | null;
  avg_relevance_score: number | null;
  llm_prompt_tokens: number;
  llm_completion_tokens: number;
  cost_usd: number | null;
  status: "success" | "error" | "rate_limited" | "no_answer";
  error_message: string | null;
  ip_hash: string;
}

/**
 * Best-effort trace write. Tracing is observability, not a request
 * dependency — a failure here must never surface to the caller or fail
 * the chat response, so all errors are swallowed after logging.
 */
export async function writeTrace(fields: Partial<KbTrace>): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("kb_traces").insert(fields);
    if (error) {
      console.error("writeTrace insert error", error);
    }
  } catch (err) {
    console.error("writeTrace failed", err);
  }
}
