import { describe, it, expect } from "vitest";
import { renderInline } from "../src/lib/render-inline";

describe("renderInline", () => {
  it("splits plain/strong/plain/chip", () => {
    expect(renderInline("a **b** c [1]")).toEqual([
      { type: "text", value: "a " },
      { type: "strong", value: "b" },
      { type: "text", value: " c " },
      { type: "chip", n: 1 },
    ]);
  });

  it("leaves an unclosed ** as literal text", () => {
    expect(renderInline("**x")).toEqual([{ type: "text", value: "**x" }]);
  });

  it("leaves a bare [1 (no closing bracket) as literal text", () => {
    expect(renderInline("бачив [1")).toEqual([{ type: "text", value: "бачив [1" }]);
  });

  it("handles multiple bold spans and multiple citations", () => {
    expect(renderInline("**24** дні [1] та **12** годин [2]")).toEqual([
      { type: "strong", value: "24" },
      { type: "text", value: " дні " },
      { type: "chip", n: 1 },
      { type: "text", value: " та " },
      { type: "strong", value: "12" },
      { type: "text", value: " годин " },
      { type: "chip", n: 2 },
    ]);
  });

  it("returns a single text segment for plain text with no markers", () => {
    expect(renderInline("Немає розмітки.")).toEqual([
      { type: "text", value: "Немає розмітки." },
    ]);
  });

  it("does not treat brackets inside bold, or ** inside brackets, as crossed markers", () => {
    expect(renderInline("**[not a citation]** [1]")).toEqual([
      { type: "strong", value: "[not a citation]" },
      { type: "text", value: " " },
      { type: "chip", n: 1 },
    ]);
  });
});
