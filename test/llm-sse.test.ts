import { describe, it, expect } from "vitest";
import { splitSseLines } from "../src/lib/llm";

describe("splitSseLines", () => {
  it("buffers a partial line and completes it on the next chunk", () => {
    // First TCP chunk ends mid-line (no trailing "\n" for the second frame).
    const first = splitSseLines(
      "",
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"choices":[{"delta":{"content":"Wo'
    );
    expect(first.lines).toEqual([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      "",
    ]);
    // The truncated second frame is held back, not dropped.
    expect(first.remainder).toBe(
      'data: {"choices":[{"delta":{"content":"Wo'
    );

    // Second chunk supplies the rest of that same line.
    const second = splitSseLines(first.remainder, 'rld"}}]}\n\n');
    expect(second.lines).toEqual([
      'data: {"choices":[{"delta":{"content":"World"}}]}',
      "",
    ]);
    expect(second.remainder).toBe("");

    // The reconstructed line is valid, parseable JSON on both sides of the
    // split — this is exactly the case the previous implementation dropped
    // silently (a naive per-chunk `text.split("\n")` truncates it instead).
    const reconstructed = second.lines[0].slice("data: ".length);
    expect(() => JSON.parse(reconstructed)).not.toThrow();
    expect(JSON.parse(reconstructed).choices[0].delta.content).toBe("World");
  });

  it("returns no lines and buffers everything when the chunk has no newline", () => {
    const { lines, remainder } = splitSseLines("", "data: partial");
    expect(lines).toEqual([]);
    expect(remainder).toBe("data: partial");
  });

  it("passes through multiple complete lines in one chunk", () => {
    const { lines, remainder } = splitSseLines("", "data: a\ndata: b\n");
    expect(lines).toEqual(["data: a", "data: b"]);
    expect(remainder).toBe("");
  });
});
