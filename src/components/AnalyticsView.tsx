"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ROLE_LABELS } from "@/lib/roles";
import type { Role } from "@/lib/search";

type TraceStatus = "success" | "error" | "rate_limited" | "no_answer";

interface RecentTrace {
  query: string;
  role: string;
  status: TraceStatus;
  total_ms: number | null;
  cost_usd: number | null;
  top_relevance_score: number | null;
  created_at: string;
}

interface AnalyticsResponse {
  totals: {
    queries: number;
    successRate: number;
    noAnswerRate: number;
    avgTotalMs: number;
    p95TotalMs: number;
    totalCostUsd: number;
    avgCostUsd: number;
  };
  recent: RecentTrace[];
}

const STATUS_META: Record<TraceStatus, { label: string; dotClassName: string }> = {
  success: { label: "успіх", dotClassName: "bg-ok" },
  no_answer: { label: "немає відповіді", dotClassName: "bg-ivory-dim" },
  error: { label: "помилка", dotClassName: "bg-err" },
  rate_limited: { label: "ліміт", dotClassName: "bg-ivory-dim" },
};

const DATETIME_FORMATTER = new Intl.DateTimeFormat("uk-UA", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const INTEGER_FORMATTER = new Intl.NumberFormat("uk-UA");

function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} с`;
}

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  return `${INTEGER_FORMATTER.format(Math.round(ms))} мс`;
}

function formatCost(usd: number, decimals = 4): string {
  return `$${usd.toFixed(decimals)}`;
}

function roleLabel(role: string): string {
  return role in ROLE_LABELS ? ROLE_LABELS[role as Role] : role;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-navy-700 bg-navy-900 p-5">
      <p className="font-body text-[13px] text-ivory-dim">{label}</p>
      <p className="mt-1.5 font-body text-[30px] font-semibold text-ivory">
        {value}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-8 flex flex-col items-center gap-2 rounded-xl border border-navy-700 bg-navy-900 py-16 text-center">
      <p className="font-body text-[15px] text-ivory-dim">
        Ще немає запитів — поставте перше питання в{" "}
        <Link
          href="/"
          className="text-brass underline decoration-brass-deep underline-offset-2 hover:text-brass-deep"
        >
          Чаті
        </Link>
        .
      </p>
    </div>
  );
}

export function AnalyticsView() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/analytics")
      .then((res) => {
        if (!res.ok) throw new Error("bad_response");
        return res.json();
      })
      .then((body: AnalyticsResponse) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) setError("Не вдалося завантажити аналітику.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl py-8">
      <h1>Аналітика</h1>
      <p className="mt-2 font-body text-[15px] text-ivory-dim">
        Показники якості та вартості відповідей асистента.
      </p>

      {error && <p className="mt-8 font-body text-[15px] text-err">{error}</p>}

      {data && data.totals.queries === 0 && <EmptyState />}

      {data && data.totals.queries > 0 && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard label="Запитів" value={INTEGER_FORMATTER.format(data.totals.queries)} />
            <StatCard label="Успішних" value={formatPercent(data.totals.successRate)} />
            <StatCard label="Без відповіді" value={formatPercent(data.totals.noAnswerRate)} />
            <StatCard label="p95 час відповіді" value={formatSeconds(data.totals.p95TotalMs)} />
            <StatCard
              label="Середня вартість запиту"
              value={formatCost(data.totals.avgCostUsd, 4)}
            />
            <StatCard label="Загальна вартість" value={formatCost(data.totals.totalCostUsd, 4)} />
          </div>

          <h2 className="mt-10">Останні запити</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-navy-700 bg-navy-900">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-navy-700 text-left">
                  <th className="px-4 py-3 font-body text-[13px] font-medium text-ivory-dim">
                    Запит
                  </th>
                  <th className="px-4 py-3 font-body text-[13px] font-medium text-ivory-dim">
                    Роль
                  </th>
                  <th className="px-4 py-3 font-body text-[13px] font-medium text-ivory-dim">
                    Статус
                  </th>
                  <th className="px-4 py-3 text-right font-body text-[13px] font-medium text-ivory-dim">
                    Час
                  </th>
                  <th className="px-4 py-3 text-right font-body text-[13px] font-medium text-ivory-dim">
                    Вартість
                  </th>
                  <th className="px-4 py-3 text-right font-body text-[13px] font-medium text-ivory-dim">
                    Дата
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((trace, i) => {
                  const meta = STATUS_META[trace.status];
                  return (
                    <tr key={i} className="border-b border-navy-700 last:border-b-0">
                      <td
                        className="max-w-[60ch] truncate px-4 py-3 font-body text-[14px] text-ivory"
                        title={trace.query}
                      >
                        {trace.query}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-body text-[13px] text-ivory-dim">
                        {roleLabel(trace.role)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 font-body text-[13px] text-ivory">
                          <span
                            aria-hidden="true"
                            className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${meta.dotClassName}`}
                          />
                          {meta.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-data text-[13px] tabular-nums text-ivory-dim">
                        {formatMs(trace.total_ms)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-data text-[13px] tabular-nums text-ivory-dim">
                        {trace.cost_usd === null ? "—" : formatCost(trace.cost_usd)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-data text-[13px] tabular-nums text-ivory-dim">
                        {DATETIME_FORMATTER.format(new Date(trace.created_at))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
