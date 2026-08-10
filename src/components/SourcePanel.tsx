"use client";

import { useEffect, useRef, useState } from "react";
import type { SourceItem } from "@/lib/ndjson";

interface SourcePanelProps {
  source: SourceItem | null;
  onClose: () => void;
}

// Right-side "case-file card" drawer for a cited source. Per the design
// direction: navy-900, left border brass-deep, category as an uppercase
// letterspaced stamp, title in the display serif, chunk text in a bordered
// quote block. Kept permanently mounted (rather than conditionally rendered)
// so the translateX close transition has something to animate — the last
// non-null source is retained in `displaySource` while the panel slides out.
export function SourcePanel({ source, onClose }: SourcePanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const open = source !== null;

  // "Storing information from previous renders" pattern (React docs): adjust
  // state during render itself, not in an effect, so displaySource keeps the
  // last non-null value while the panel is sliding closed instead of going
  // blank the instant `source` becomes null.
  const [displaySource, setDisplaySource] = useState<SourceItem | null>(source);
  const [prevSource, setPrevSource] = useState<SourceItem | null>(source);
  if (source !== prevSource) {
    setPrevSource(source);
    if (source !== null) setDisplaySource(source);
  }

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-navy-950/60 transition-opacity duration-[240ms] ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={
          displaySource
            ? `Джерело ${displaySource.n}: ${displaySource.title}`
            : "Джерело"
        }
        className={`absolute right-0 top-0 h-full w-full max-w-[420px] overflow-y-auto border-l border-brass-deep bg-navy-900 p-6 transition-transform duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {displaySource && (
          <>
            <div className="flex items-start justify-between gap-3">
              <span className="inline-block rounded-sm border border-brass px-2 py-0.5 font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-brass">
                {displaySource.category}
              </span>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Закрити панель джерела"
                className="shrink-0 rounded-md p-1 font-body text-[15px] text-ivory-dim transition-colors duration-150 hover:text-ivory focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
              >
                ✕
              </button>
            </div>

            <h2 className="mt-4">{displaySource.title}</h2>

            <blockquote className="mt-4 rounded-md border border-navy-700 bg-navy-800 p-4 font-body text-[15px] leading-6 text-ivory">
              {displaySource.chunk}
            </blockquote>

            <p className="mt-4 font-data text-[13px] text-ivory-dim">
              Джерело №{displaySource.n}
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
