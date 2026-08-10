import { randomUUID } from "node:crypto";
import { retrieve, type Role, type RankedChunk } from "@/lib/search";
import { ROLES } from "@/lib/corpus";
import { buildMessages, generateAnswerStream } from "@/lib/llm";
import { extractCitedIndexes } from "@/lib/citations";
import { hashIp, checkRateLimit } from "@/lib/rate-limit";
import { writeTrace, type KbTrace } from "@/lib/tracer";

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

  // Owns cancellation of the (expensive, metered) LLM generation call. Wired
  // to the outer stream's cancel() below so a client that walks away mid-answer
  // doesn't leave OpenRouter billing for tokens nobody will read.
  const abortController = new AbortController();
  // Belt-and-suspenders: the incoming Request's own signal (tied to the
  // underlying connection) can fire before the outer ReadableStream's
  // cancel() does, since cancel() only fires once something tries to write
  // to the closed socket and gets backpressure.
  if (req.signal.aborted) {
    abortController.abort(req.signal.reason);
  } else {
    req.signal.addEventListener(
      "abort",
      () => abortController.abort(req.signal.reason),
      { once: true }
    );
  }
  let innerReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  // Hoisted above the try so a failure *after* retrieval still has real
  // stage timings/sources to trace, instead of losing them to block scope.
  let chunks: RankedChunk[] = [];
  let timings = { embedding_ms: 0, search_ms: 0, rerank_ms: 0 };
  let sources: SourceOut[] = [];
  let traceWritten = false;

  async function writeTraceOnce(fields: Partial<KbTrace>) {
    if (traceWritten) return;
    traceWritten = true;
    await writeTrace(fields);
  }

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
        const retrieved = await retrieve(query, role);
        chunks = retrieved.chunks;
        timings = retrieved.timings;
        const empty = retrieved.empty;

        sources = chunks.map((c, i) => ({
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

          await writeTraceOnce({
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
        const { stream: llmStream, getUsage } = await generateAnswerStream(
          messages,
          abortController.signal
        );

        const llmStart = Date.now();
        let llmTtfbMs: number | null = null;
        let answer = "";

        const reader = llmStream.getReader();
        innerReader = reader;
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

        innerReader = null;

        // reader.cancel() (called from the outer stream's cancel() below)
        // resolves the pending read with {done: true} rather than rejecting
        // it — indistinguishable from a normal end-of-stream unless we also
        // check the abort flag here. Without this check a disconnect mid
        // answer would misrecord as a clean "success" trace with a
        // truncated answer and no usage/cost data.
        if (abortController.signal.aborted) {
          await writeTraceOnce({
            trace_id: traceId,
            role,
            query,
            answer,
            sources,
            embedding_ms: timings.embedding_ms,
            search_ms: timings.search_ms,
            rerank_ms: timings.rerank_ms,
            llm_ttfb_ms: llmTtfbMs,
            total_ms: Date.now() - requestStart,
            chunks_found: chunks.length,
            chunks_reranked: chunks.length,
            status: "error",
            error_message: "client_disconnected",
            ip_hash: ipHash,
          });
          return;
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

        await writeTraceOnce({
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
        const wasAborted =
          abortController.signal.aborted ||
          (err instanceof Error && err.name === "AbortError");
        const message = wasAborted
          ? "client_disconnected"
          : err instanceof Error
            ? err.message
            : "Unknown error";

        // A disconnect means nobody can receive an error/done line — the
        // controller is already cancelled, so only the trace matters here.
        if (!wasAborted) {
          safeEnqueue({ type: "error", message });
          safeClose();
        }

        await writeTraceOnce({
          trace_id: traceId,
          role,
          query,
          sources,
          embedding_ms: timings.embedding_ms,
          search_ms: timings.search_ms,
          rerank_ms: timings.rerank_ms,
          chunks_found: chunks.length,
          chunks_reranked: chunks.length,
          status: "error",
          error_message: message,
          total_ms: Date.now() - requestStart,
          ip_hash: ipHash,
        });
      }
    },
    cancel(reason) {
      // Fires when the client disconnects (the runtime cancels the stream
      // it's piping to the closed connection). Stop paying OpenRouter for
      // tokens nobody will read, and stop reading its stream.
      abortController.abort(reason);
      if (innerReader) {
        innerReader.cancel(reason).catch(() => {});
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
