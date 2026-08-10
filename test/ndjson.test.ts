import { describe, it, expect } from "vitest";
import { NdjsonParser, type ChatEvent } from "../src/lib/ndjson";

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe("NdjsonParser", () => {
  it("parses a single line delivered in one chunk", () => {
    const parser = new NdjsonParser();
    const events = parser.push(bytes('{"type":"token","v":"Привіт"}\n'));
    expect(events).toEqual([{ type: "token", v: "Привіт" }]);
  });

  it("parses multiple lines delivered in one chunk", () => {
    const parser = new NdjsonParser();
    const events = parser.push(
      bytes(
        '{"type":"sources","sources":[],"traceId":"t1"}\n{"type":"token","v":"a"}\n'
      )
    );
    expect(events).toEqual([
      { type: "sources", sources: [], traceId: "t1" },
      { type: "token", v: "a" },
    ]);
  });

  it("buffers a line split mid-way across two chunks", () => {
    const parser = new NdjsonParser();
    const full = '{"type":"token","v":"hello world"}\n';
    const splitAt = 15; // lands inside the JSON, not on a boundary
    const first = parser.push(bytes(full.slice(0, splitAt)));
    expect(first).toEqual([]);
    const second = parser.push(bytes(full.slice(splitAt)));
    expect(second).toEqual([{ type: "token", v: "hello world" }]);
  });

  it("buffers a line split exactly at a multi-byte UTF-8 character boundary", () => {
    const parser = new NdjsonParser();
    const full = '{"type":"token","v":"дні відпустки"}\n';
    const fullBytes = bytes(full);
    // Split in the middle of the Cyrillic run so a 2-byte UTF-8 sequence is
    // torn across chunks — TextDecoder({stream:true}) must hold the partial
    // byte rather than emitting U+FFFD.
    const mid = Math.floor(fullBytes.length / 2);
    const events1 = parser.push(fullBytes.slice(0, mid));
    const events2 = parser.push(fullBytes.slice(mid));
    expect([...events1, ...events2]).toEqual([
      { type: "token", v: "дні відпустки" },
    ]);
  });

  it("handles several chunks accumulating one line, then more lines", () => {
    const parser = new NdjsonParser();
    const events: ChatEvent[] = [];
    events.push(...parser.push(bytes('{"type":"tok')));
    events.push(...parser.push(bytes('en","v":"partial"}')));
    events.push(...parser.push(bytes('\n{"type":"done","citedIndexes":[1,3],"totalMs":2345}\n')));
    expect(events).toEqual([
      { type: "token", v: "partial" },
      { type: "done", citedIndexes: [1, 3], totalMs: 2345 },
    ]);
  });

  it("flush() parses a trailing line with no terminating newline", () => {
    const parser = new NdjsonParser();
    const events = parser.push(bytes('{"type":"error","message":"boom"}'));
    expect(events).toEqual([]);
    expect(parser.flush()).toEqual([{ type: "error", message: "boom" }]);
  });

  it("flush() returns empty when the buffer is empty or whitespace", () => {
    const parser = new NdjsonParser();
    parser.push(bytes('{"type":"token","v":"x"}\n'));
    expect(parser.flush()).toEqual([]);

    const parser2 = new NdjsonParser();
    parser2.push(bytes("   \n  "));
    expect(parser2.flush()).toEqual([]);
  });

  it("ignores malformed JSON lines instead of throwing", () => {
    const parser = new NdjsonParser();
    const events = parser.push(bytes("not json\n{\"type\":\"token\",\"v\":\"ok\"}\n"));
    expect(events).toEqual([{ type: "token", v: "ok" }]);
  });

  it("parses the full sources/token/done sequence across arbitrary chunk splits", () => {
    const full =
      '{"type":"sources","sources":[{"n":1,"title":"Регламент відпусток","category":"Регламенти","chunk":"..."}],"traceId":"abc"}\n' +
      '{"type":"token","v":"Вам належить "}\n' +
      '{"type":"token","v":"24 дні [1]."}\n' +
      '{"type":"done","citedIndexes":[1],"totalMs":1200}\n';
    const fullBytes = bytes(full);

    // Feed it back in small, deliberately-uneven byte windows to simulate
    // real network chunking that ignores line boundaries.
    const parser = new NdjsonParser();
    const events: ChatEvent[] = [];
    const chunkSize = 17;
    for (let i = 0; i < fullBytes.length; i += chunkSize) {
      events.push(...parser.push(fullBytes.slice(i, i + chunkSize)));
    }
    events.push(...parser.flush());

    expect(events).toEqual([
      {
        type: "sources",
        sources: [
          {
            n: 1,
            title: "Регламент відпусток",
            category: "Регламенти",
            chunk: "...",
          },
        ],
        traceId: "abc",
      },
      { type: "token", v: "Вам належить " },
      { type: "token", v: "24 дні [1]." },
      { type: "done", citedIndexes: [1], totalMs: 1200 },
    ]);
  });
});
