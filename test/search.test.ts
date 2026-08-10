import { describe, it, expect } from "vitest";
import { filterByRelevance, mergeSiblings, type RankedChunk, type SiblingRow } from "../src/lib/search";

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

function chunk(overrides: Partial<RankedChunk>): RankedChunk {
  return {
    id: 0,
    doc_id: 0,
    content: "",
    chunk_index: 0,
    title: "Doc",
    category: "Регламенти",
    relevance_score: 0,
    ...overrides,
  };
}

describe("mergeSiblings", () => {
  it("inserts a sibling right after its doc's survivor, scored just under it", () => {
    const survivors: RankedChunk[] = [
      chunk({ id: 1, doc_id: 10, chunk_index: 0, title: "Регламент відпусток", relevance_score: 0.9 }),
      chunk({ id: 2, doc_id: 20, chunk_index: 0, title: "Інший документ", relevance_score: 0.5 }),
    ];
    const siblings: SiblingRow[] = [
      { id: 1, doc_id: 10, content: "chunk 0", chunk_index: 0 }, // already a survivor
      { id: 3, doc_id: 10, content: "chunk 1 — заява за 14 днів", chunk_index: 1 },
      { id: 4, doc_id: 20, content: "chunk 1 of doc 20", chunk_index: 1 },
    ];

    const result = mergeSiblings(survivors, siblings, 8);

    expect(result.map((c) => c.id)).toEqual([1, 3, 2, 4]);
    expect(result[1]).toMatchObject({
      id: 3,
      doc_id: 10,
      title: "Регламент відпусток",
      relevance_score: 0.9 * 0.98,
    });
  });

  it("enforces the cap by dropping the lowest-relevance docs' siblings first", () => {
    const survivors: RankedChunk[] = [
      chunk({ id: 1, doc_id: 10, chunk_index: 0, relevance_score: 0.9 }),
      chunk({ id: 2, doc_id: 20, chunk_index: 0, relevance_score: 0.6 }),
      chunk({ id: 3, doc_id: 30, chunk_index: 0, relevance_score: 0.3 }),
    ];
    const siblings: SiblingRow[] = [
      { id: 11, doc_id: 10, content: "sibling of highest-relevance doc", chunk_index: 1 },
      { id: 21, doc_id: 20, content: "sibling of mid-relevance doc", chunk_index: 1 },
      { id: 31, doc_id: 30, content: "sibling of lowest-relevance doc", chunk_index: 1 },
    ];

    const result = mergeSiblings(survivors, siblings, 4);

    expect(result).toHaveLength(4);
    // All 3 survivors are kept; only the highest-relevance doc's sibling survives the cap.
    expect(result.map((c) => c.id)).toEqual([1, 11, 2, 3]);
  });

  it("does not duplicate a chunk that is both a survivor and returned as a sibling row", () => {
    const survivors: RankedChunk[] = [
      chunk({ id: 1, doc_id: 10, chunk_index: 0, relevance_score: 0.9 }),
      chunk({ id: 2, doc_id: 10, chunk_index: 1, relevance_score: 0.8 }),
    ];
    const siblings: SiblingRow[] = [
      { id: 1, doc_id: 10, content: "chunk 0", chunk_index: 0 },
      { id: 2, doc_id: 10, content: "chunk 1", chunk_index: 1 },
    ];

    const result = mergeSiblings(survivors, siblings, 8);

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual([1, 2]);
  });
});
