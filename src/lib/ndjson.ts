// Client-side NDJSON parser for the streaming /api/chat response (see
// src/app/api/chat/route.ts for the producer side). Extracted from Chat.tsx
// so the split-on-"\n" / buffer-partial-last-line logic is unit-testable
// without a browser or a live network stream.

export interface SourceItem {
  n: number;
  title: string;
  category: string;
  chunk: string;
}

export type ChatEvent =
  | { type: "sources"; sources: SourceItem[]; traceId: string }
  | { type: "token"; v: string }
  | { type: "done"; citedIndexes: number[]; totalMs: number }
  | { type: "error"; message: string };

function isChatEvent(value: unknown): value is ChatEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string"
  );
}

/**
 * Incremental NDJSON decoder: feed it raw response chunks (Uint8Array) as
 * they arrive from a fetch ReadableStream reader, get back the fully-parsed
 * events found so far. A line split across two chunks (or a multi-byte UTF-8
 * character split across chunk boundaries) is buffered until it completes —
 * TextDecoder is used in streaming mode for exactly this reason.
 */
export class NdjsonParser {
  private buffer = "";
  private decoder = new TextDecoder();

  /** Feed one chunk of bytes; returns every event completed by this chunk. */
  push(chunk: Uint8Array): ChatEvent[] {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    return this.drainCompleteLines();
  }

  /**
   * Call once after the stream ends (reader signals `done`). Flushes the
   * decoder's own internal byte buffer and parses whatever line remains
   * without a trailing newline.
   */
  flush(): ChatEvent[] {
    this.buffer += this.decoder.decode();
    const fromLines = this.drainCompleteLines();
    const rest = this.buffer.trim();
    this.buffer = "";
    if (!rest) return fromLines;
    const parsed = this.parseLine(rest);
    return parsed ? [...fromLines, parsed] : fromLines;
  }

  private drainCompleteLines(): ChatEvent[] {
    const events: ChatEvent[] = [];
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      const parsed = this.parseLine(line);
      if (parsed) events.push(parsed);
    }
    return events;
  }

  private parseLine(line: string): ChatEvent | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      const value: unknown = JSON.parse(trimmed);
      return isChatEvent(value) ? value : null;
    } catch {
      // Malformed line (shouldn't happen against a well-behaved server) —
      // drop it rather than crashing the whole stream render.
      return null;
    }
  }
}
