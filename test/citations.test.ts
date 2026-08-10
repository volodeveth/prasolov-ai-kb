import { describe, it, expect } from "vitest";
import { extractCitedIndexes } from "../src/lib/citations";

describe("extractCitedIndexes", () => {
  it("extracts unique ordered citation numbers", () => {
    expect(extractCitedIndexes("Так [1], і ще [3] та знову [1].", 5)).toEqual([1, 3]);
  });
  it("ignores out-of-range and zero", () => {
    expect(extractCitedIndexes("[0] [2] [9]", 3)).toEqual([2]);
  });
  it("handles combined form [1][2]", () => {
    expect(extractCitedIndexes("Відповідь [1][2].", 5)).toEqual([1, 2]);
  });
  it("returns empty for no citations", () => {
    expect(extractCitedIndexes("Немає цитат.", 5)).toEqual([]);
  });
});
