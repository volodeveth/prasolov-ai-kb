import { createServiceClient } from "@/lib/supabase";

const WINDOW_SIZE = 500;
const RECENT_SIZE = 20;

type TraceStatus = "success" | "error" | "rate_limited" | "no_answer";

interface KbTraceRow {
  query: string;
  role: string;
  status: TraceStatus;
  total_ms: number | null;
  cost_usd: number | null;
  top_relevance_score: number | null;
  created_at: string;
}

function jsonError(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function percentile95(sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return 0;
  const index = Math.min(
    sortedAsc.length - 1,
    Math.ceil(0.95 * sortedAsc.length) - 1
  );
  return sortedAsc[index];
}

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("kb_traces")
    .select("query, role, status, total_ms, cost_usd, top_relevance_score, created_at")
    .order("created_at", { ascending: false })
    .limit(WINDOW_SIZE);

  if (error) {
    console.error("GET /api/analytics select error", error);
    return jsonError(500, { error: "internal_error", message: "Failed to load traces" });
  }

  const traces = (data ?? []) as KbTraceRow[];
  const queries = traces.length;

  const successCount = traces.filter((t) => t.status === "success").length;
  const noAnswerCount = traces.filter((t) => t.status === "no_answer").length;
  const successRate = queries > 0 ? successCount / queries : 0;
  const noAnswerRate = queries > 0 ? noAnswerCount / queries : 0;

  const totalMsValues = traces
    .map((t) => t.total_ms)
    .filter((v): v is number => v !== null && v !== undefined);
  const avgTotalMs =
    totalMsValues.length > 0
      ? totalMsValues.reduce((sum, v) => sum + v, 0) / totalMsValues.length
      : 0;
  const sortedTotalMs = [...totalMsValues].sort((a, b) => a - b);
  const p95TotalMs = percentile95(sortedTotalMs);

  const costValues = traces
    .map((t) => t.cost_usd)
    .filter((v): v is number => v !== null && v !== undefined);
  const totalCostUsd = costValues.reduce((sum, v) => sum + v, 0);
  const successWithCostCount = traces.filter(
    (t) => t.status === "success" && t.cost_usd !== null && t.cost_usd !== undefined
  ).length;
  const avgCostUsd = successWithCostCount > 0 ? totalCostUsd / successWithCostCount : 0;

  const recent = traces.slice(0, RECENT_SIZE).map((t) => ({
    query: t.query,
    role: t.role,
    status: t.status,
    total_ms: t.total_ms,
    cost_usd: t.cost_usd,
    top_relevance_score: t.top_relevance_score,
    created_at: t.created_at,
  }));

  return new Response(
    JSON.stringify({
      totals: {
        queries,
        successRate,
        noAnswerRate,
        avgTotalMs,
        p95TotalMs,
        totalCostUsd,
        avgCostUsd,
      },
      recent,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
