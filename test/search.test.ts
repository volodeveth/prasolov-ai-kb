import { describe, it, expect } from "vitest";
import { filterByRelevance } from "../src/lib/search";

describe("filterByRelevance", () => {
  it("keeps low-score chunks when rerank did not run (short-circuit path)", () => {
    const chunks = [
      { id: 1, relevance_score: 0.016 },
      { id: 2, relevance_score: 0.008 },
    ];
    expect(filterByRelevance(chunks, false)).toEqual(chunks);
  });

  it("drops chunks below 0.1 when a real rerank ran", () => {
    const chunks = [
      { id: 1, relevance_score: 0.85 },
      { id: 2, relevance_score: 0.05 },
      { id: 3, relevance_score: 0.1 },
    ];
    expect(filterByRelevance(chunks, true)).toEqual([
      { id: 1, relevance_score: 0.85 },
      { id: 3, relevance_score: 0.1 },
    ]);
  });
});
