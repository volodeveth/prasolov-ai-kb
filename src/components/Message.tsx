"use client";

import type { ReactNode } from "react";
import type { SourceItem } from "@/lib/ndjson";

export type MessageStatus = "retrieving" | "streaming" | "done" | "error";
export type ErrorKind = "rate_limited" | "generic";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  status?: MessageStatus;
  sources?: SourceItem[];
  citedIndexes?: number[];
  errorKind?: ErrorKind;
  errorMessage?: string;
}

interface MessageProps {
  message: ChatMessage;
  onCite: (source: SourceItem, opener: HTMLElement) => void;
}

const GENERIC_ERROR_TEXT = "Щось пішло не так. Спробуйте ще раз.";

/**
 * Splits assistant text on complete `[n]` markers and renders each as a
 * brass seal-chip <sup> button (design direction's signature citation
 * element) when `n` matches a known source, plain text otherwise. Because
 * this re-derives the whole segment list from the full accumulated text on
 * every render, a marker never renders as raw unstyled "[n]" even for a
 * frame — a partial "[1" mid-stream is just plain text until the closing
 * "]" arrives, at which point the very next render turns it straight into
 * the styled chip.
 */
function renderWithCitations(
  text: string,
  sources: SourceItem[],
  onCite: (source: SourceItem, opener: HTMLElement) => void
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /\[(\d{1,2})\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const n = Number(match[1]);
    const source = sources.find((s) => s.n === n);

    if (source) {
      nodes.push(
        <sup key={`cite-${key++}`}>
          <button
            type="button"
            onClick={(e) => onCite(source, e.currentTarget)}
            aria-label={`Джерело ${n}: ${source.title}`}
            className="mx-0.5 inline-flex -translate-y-px items-center rounded-[3px] border border-brass-deep bg-navy-800 px-1 font-data text-[11px] leading-none text-brass transition-colors duration-[120ms] hover:bg-brass hover:text-navy-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
          >
            {n}
          </button>
        </sup>
      );
    } else {
      // Marker doesn't match a known source (out of range, or sources
      // haven't arrived yet) — leave it as plain text.
      nodes.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function RetrievingIndicator() {
  return (
    <div className="flex items-center gap-2 py-0.5 font-body text-[13px] text-ivory-dim">
      <span>Шукаю в базі знань…</span>
      <span className="flex gap-1" aria-hidden="true">
        <span className="h-1 w-1 rounded-full bg-brass" />
        <span className="h-1 w-1 rounded-full bg-brass" />
        <span className="h-1 w-1 rounded-full bg-brass" />
      </span>
    </div>
  );
}

function Caret() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-[15px] w-[2px] -translate-y-px align-middle bg-brass-deep"
    />
  );
}

function ErrorBanner({ message }: { message: ChatMessage }) {
  if (message.errorKind === "rate_limited") {
    return (
      <div className="mt-1 rounded-md border border-navy-700 bg-navy-800 px-3 py-2 font-body text-[13px] text-ivory-dim">
        {message.errorMessage}
      </div>
    );
  }

  return (
    <div className="mt-1 rounded-md border border-navy-700 bg-navy-800 px-3 py-2">
      <p className="font-body text-[13px] text-ivory-dim">{GENERIC_ERROR_TEXT}</p>
      {message.errorMessage && (
        <p className="mt-0.5 font-body text-[12px] text-ivory-dim/70">
          {message.errorMessage}
        </p>
      )}
    </div>
  );
}

function SourcesFooter({
  citedIndexes,
  sources,
  onCite,
}: {
  citedIndexes: number[];
  sources: SourceItem[];
  onCite: (source: SourceItem, opener: HTMLElement) => void;
}) {
  const cited = citedIndexes
    .map((n) => sources.find((s) => s.n === n))
    .filter((s): s is SourceItem => Boolean(s));

  if (cited.length === 0) return null;

  return (
    <p className="mt-1 font-body text-[13px] text-ivory-dim">
      Джерела:{" "}
      {cited.map((source, i) => (
        <span key={source.n}>
          {i > 0 && ", "}
          <button
            type="button"
            onClick={(e) => onCite(source, e.currentTarget)}
            className="underline decoration-navy-700 underline-offset-2 hover:text-brass focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
          >
            [{source.n}] {source.title}
          </button>
        </span>
      ))}
    </p>
  );
}

export function Message({ message, onCite }: MessageProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-xl bg-navy-800 px-4 py-2.5 font-body text-[15px] leading-6 text-ivory">
          {message.text}
        </div>
      </div>
    );
  }

  const sources = message.sources ?? [];

  return (
    <div className="flex max-w-[90%] flex-col gap-1 border-l-2 border-brass py-0.5 pl-4">
      {message.status === "retrieving" ? (
        <RetrievingIndicator />
      ) : (
        <p className="whitespace-pre-wrap font-body text-[15px] leading-6 text-ivory">
          {renderWithCitations(message.text, sources, onCite)}
          {message.status === "streaming" && <Caret />}
        </p>
      )}

      {message.status === "error" && <ErrorBanner message={message} />}

      {message.status === "done" && message.citedIndexes && (
        <SourcesFooter
          citedIndexes={message.citedIndexes}
          sources={sources}
          onCite={onCite}
        />
      )}
    </div>
  );
}
