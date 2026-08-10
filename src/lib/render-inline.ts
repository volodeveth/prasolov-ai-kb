// Pure, framework-free inline-markdown segmenter for assistant answers.
// Handles exactly the two things the corpus/LLM actually produce — **bold**
// and [n] citation markers — deliberately not a general markdown parser.
//
// Segments are re-derived from the FULL accumulated text on every call (see
// Message.tsx), which is what makes this safe to call on every render of a
// streaming answer: an unclosed "**b" or a bare "[1" is just plain text
// until its closing marker arrives, at which point the very next render
// turns it into the real segment — it never flashes as a half-parsed marker.

export type InlineSegment =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "chip"; n: number };

const BOLD_RE = /\*\*([\s\S]+?)\*\*/g;
const CITATION_RE = /\[(\d{1,2})\]/g;

/** Splits a citation-free text run on complete `**bold**` pairs. */
function splitBold(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  BOLD_RE.lastIndex = 0;
  while ((match = BOLD_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "strong", value: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}

/**
 * Splits text into plain/strong/chip segments. Citation markers are split
 * out first (their bracket syntax can't collide with `**`), then each
 * remaining text run is split again for bold. `chip` segments carry only
 * the raw index `n` — resolving it against known sources (styled chip vs.
 * plain "[n]" fallback for an unknown index) is a rendering-time concern
 * left to the caller.
 */
export function renderInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  CITATION_RE.lastIndex = 0;
  while ((match = CITATION_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push(...splitBold(text.slice(lastIndex, match.index)));
    }
    segments.push({ type: "chip", n: Number(match[1]) });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push(...splitBold(text.slice(lastIndex)));
  }
  return segments;
}
