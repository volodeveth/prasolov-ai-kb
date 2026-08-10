/**
 * Extract citation markers like `[1]`, `[2]` from a generated answer.
 * Returns unique, valid (1..max) indexes in the order they first appear.
 */
export function extractCitedIndexes(answer: string, max: number): number[] {
  const seen = new Set<number>();
  const result: number[] = [];

  for (const match of answer.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(match[1]);
    if (n < 1 || n > max) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    result.push(n);
  }

  return result;
}
