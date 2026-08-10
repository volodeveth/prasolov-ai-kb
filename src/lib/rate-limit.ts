import { createHash } from "node:crypto";

// Demo-tier cap: kept low deliberately (unauthenticated public demo).
const LIMIT_PER_HOUR = 20;

/** One-way, deterministic hash — never store raw client IPs. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

/** Pure comparison: allowed while strictly under the hourly limit. */
export function isAllowed(recentCount: number): boolean {
  return recentCount < LIMIT_PER_HOUR;
}

/**
 * Counts kb_traces rows for this ip_hash in the last hour via a REST HEAD
 * request (Prefer: count=exact), then applies isAllowed(). Fails open on
 * any error — a broken count check should not itself take the demo down.
 */
export async function checkRateLimit(ipHash: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return true;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const endpoint = `${url}/rest/v1/kb_traces?select=id&ip_hash=eq.${encodeURIComponent(
    ipHash
  )}&created_at=gte.${encodeURIComponent(oneHourAgo)}`;

  try {
    const res = await fetch(endpoint, {
      method: "HEAD",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "count=exact",
      },
    });

    if (!res.ok) return true;

    const contentRange = res.headers.get("content-range");
    // Format: "0-19/42" — the part after "/" is the total count.
    const total = contentRange ? Number(contentRange.split("/")[1]) : NaN;
    if (Number.isNaN(total)) return true;

    return isAllowed(total);
  } catch (err) {
    console.error("checkRateLimit failed", err);
    return true;
  }
}
