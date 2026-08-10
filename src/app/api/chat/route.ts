import { randomUUID } from "node:crypto";
import { retrieve, type Role } from "@/lib/search";
import { ROLES } from "@/lib/corpus";
import { buildMessages, generateAnswerStream } from "@/lib/llm";
import { extractCitedIndexes } from "@/lib/citations";
import { hashIp, checkRateLimit } from "@/lib/rate-limit";
import { writeTrace } from "@/lib/tracer";

// Streaming LLM calls can run well past the platform's default timeout.
export const maxDuration = 60;

const MAX_QUERY_LENGTH = 500;
const SOURCE_CHUNK_PREVIEW_LENGTH = 600;
const RATE_LIMIT_MESSAGE = "Ліміт демо: 20 запитів на годину.";

// Must match the SYSTEM_PROMPT rule-3 refusal phrase in src/lib/llm.ts
// verbatim — retrieval already told us there's nothing to answer with, so
// we short-circuit here instead of paying for an LLM call to say the same.
const NO_ANSWER_PHRASE =
  "У базі знань немає відповіді на це питання. Зверніться до відповідального за напрям або поставте питання інакше.";

interface ChatBody {
  query?: unknown;
  role?: unknown;
}

interface SourceOut {
  n: number;
  title: string;
  category: string;
  chunk: string;
}

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

function jsonError(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function ndjsonLine(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

export async function POST(req: Request) {
  const requestStart = Date.now();

  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, { error: "bad_request", message: "Invalid JSON body" });
  }

  const { query, role } = body;

  if (
    typeof query !== "string" ||
    query.trim().length === 0 ||
    query.length > MAX_QUERY_LENGTH
  ) {
    return jsonError(400, {
      error: "bad_request",
      message: `query must be a non-empty string of at most ${MAX_QUERY_LENGTH} characters`,
    });
  }

  if (!isRole(role)) {
    return jsonError(400, {
      error: "bad_request",
      message: `role must be one of: ${ROLES.join(", ")}`,
    });
  }

  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";
  const ipHash = hashIp(ip);

  const allowed = await checkRateLimit(ipHash);
  if (!allowed) {
    await writeTrace({
      role,
      query,
      status: "rate_limited",
      ip_hash: ipHash,
      total_ms: Date.now() - requestStart,
    });
    return jsonError(429, { error: "rate_limited", message: RATE_LIMIT_MESSAGE });
  }

  const traceId = randomUUID();

  const stream = new ReadableStream({
    async start(controller) {
      const safeEnqueue = (obj: unknown) => {
        try {
          controller.enqueue(ndjsonLine(obj));
        } catch {
          // Client disconnected or controller already closed — nothing to do.
        }
      };
      const safeClose = () => {
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      try {
        const { chunks, timings, empty } = await retrieve(query, role);

        const sources: SourceOut[] = chunks.map((c, i) => ({
          n: i + 1,
          title: c.title,
          category: c.category,
          chunk: c.content.slice(0, SOURCE_CHUNK_PREVIEW_LENGTH),
        }));

        safeEnqueue({ type: "sources", sources, traceId });

        if (empty) {
          safeEnqueue({ type: "token", v: NO_ANSWER_PHRASE });
          const totalMs = Date.now() - requestStart;
          safeEnqueue({ type: "done", citedIndexes: [], totalMs });
          safeClose();

          await writeTrace({
            trace_id: traceId,
            role,
            query,
            answer: NO_ANSWER_PHRASE,
            sources,
            embedding_ms: timings.embedding_ms,
            search_ms: timings.search_ms,
            rerank_ms: timings.rerank_ms,
            total_ms: totalMs,
            chunks_found: chunks.length,
            chunks_reranked: chunks.length,
            llm_prompt_tokens: 0,
            llm_completion_tokens: 0,
            status: "no_answer",
            ip_hash: ipHash,
          });
          return;
        }

        const messages = buildMessages(query, chunks);
        const { stream: llmStream, getUsage } = await generateAnswerStream(messages);

        const llmStart = Date.now();
        let llmTtfbMs: number | null = null;
        let answer = "";

        const reader = llmStream.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value || value.length === 0) continue;

          if (llmTtfbMs === null) llmTtfbMs = Date.now() - llmStart;

          const text = decoder.decode(value, { stream: true });
          if (text) {
            answer += text;
            safeEnqueue({ type: "token", v: text });
          }
        }

        const llmTotalMs = Date.now() - llmStart;
        const citedIndexes = extractCitedIndexes(answer, chunks.length);
        const totalMs = Date.now() - requestStart;

        safeEnqueue({ type: "done", citedIndexes, totalMs });
        safeClose();

        const usage = getUsage();
        const relevanceScores = chunks.map((c) => c.relevance_score);
        const topRelevanceScore = relevanceScores.length
          ? Math.max(...relevanceScores)
          : null;
        const avgRelevanceScore = relevanceScores.length
          ? relevanceScores.reduce((sum, s) => sum + s, 0) / relevanceScores.length
          : null;

        await writeTrace({
          trace_id: traceId,
          role,
          query,
          answer,
          sources,
          embedding_ms: timings.embedding_ms,
          search_ms: timings.search_ms,
          rerank_ms: timings.rerank_ms,
          llm_ttfb_ms: llmTtfbMs,
          llm_total_ms: llmTotalMs,
          total_ms: totalMs,
          chunks_found: chunks.length,
          chunks_reranked: chunks.length,
          top_relevance_score: topRelevanceScore,
          avg_relevance_score: avgRelevanceScore,
          llm_prompt_tokens: usage.promptTokens,
          llm_completion_tokens: usage.completionTokens,
          cost_usd: usage.costUsd,
          status: "success",
          ip_hash: ipHash,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        safeEnqueue({ type: "error", message });
        safeClose();

        await writeTrace({
          trace_id: traceId,
          role,
          query,
          status: "error",
          error_message: message,
          total_ms: Date.now() - requestStart,
          ip_hash: ipHash,
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}
