"use client";

import { useEffect, useRef, useState } from "react";
import { useRole } from "@/lib/roles";
import { NdjsonParser, type ChatEvent, type SourceItem } from "@/lib/ndjson";
import { Message, type ChatMessage } from "@/components/Message";
import { SourcePanel } from "@/components/SourcePanel";

const SUGGESTED_CHIPS = [
  "Скільки днів відпустки мені належить?",
  "Які санкції за ст. 130 КУпАП при першому порушенні?",
  "Що робити при дзвінку з держоргану?",
  "Як вести облік годин у CRM?",
  "Хто призначає юриста на нову справу?",
];

const GENERIC_ERROR_MESSAGE = "Не вдалося з'єднатися з сервером.";

function EmptyState({ onPick }: { onPick: (question: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-16 text-center">
      <p className="max-w-md font-body text-[15px] text-ivory-dim">
        Поставте запитання до бази знань — асистент відповість з посиланнями
        на внутрішні документи.
      </p>
      <div className="flex max-w-xl flex-wrap justify-center gap-2">
        {SUGGESTED_CHIPS.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onPick(question)}
            className="rounded-full bg-navy-800 px-3.5 py-1.5 font-body text-[13px] text-ivory-dim transition-colors duration-150 hover:text-brass focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Chat() {
  const { role } = useRole();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawerSource, setDrawerSource] = useState<SourceItem | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  // Tracks the in-flight request's AbortController so navigating away (or
  // this component unmounting) mid-stream can cancel it — without this the
  // server's own req.signal-based cancellation (Task 6) never fires, and
  // the LLM keeps generating/billing for a client that's already gone.
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  function handleCite(source: SourceItem, opener: HTMLElement) {
    openerRef.current = opener;
    setDrawerSource(source);
  }

  function handleCloseDrawer() {
    setDrawerSource(null);
    openerRef.current?.focus();
    openerRef.current = null;
  }

  async function sendQuery(rawQuery: string) {
    const query = rawQuery.trim();
    if (!query || busy) return;

    setBusy(true);
    setInput("");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: query,
    };
    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      text: "",
      status: "retrieving",
    };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    const patchAssistant = (patch: Partial<ChatMessage>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m))
      );
    };
    const appendToken = (v: string) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, text: m.text + v } : m
        )
      );
    };
    const applyEvent = (event: ChatEvent) => {
      switch (event.type) {
        case "sources":
          patchAssistant({ sources: event.sources, status: "streaming" });
          break;
        case "token":
          appendToken(event.v);
          break;
        case "done":
          patchAssistant({ status: "done", citedIndexes: event.citedIndexes });
          break;
        case "error":
          patchAssistant({
            status: "error",
            errorKind: "generic",
            errorMessage: event.message,
          });
          break;
      }
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, role }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        const body = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        patchAssistant({
          status: "error",
          errorKind: "rate_limited",
          errorMessage: body?.message ?? "Ліміт демо: 20 запитів на годину.",
        });
        return;
      }

      if (!res.ok || !res.body) {
        patchAssistant({
          status: "error",
          errorKind: "generic",
          errorMessage: GENERIC_ERROR_MESSAGE,
        });
        return;
      }

      const parser = new NdjsonParser();
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) for (const event of parser.push(value)) applyEvent(event);
      }
      for (const event of parser.flush()) applyEvent(event);
    } catch (err) {
      // Unmount/navigation cancelled the request via abortControllerRef —
      // stop cleanly, no error banner, leave whatever answer text streamed
      // in so far exactly as-is.
      if (controller.signal.aborted) return;

      patchAssistant({
        status: "error",
        errorKind: "generic",
        errorMessage: err instanceof Error ? err.message : GENERIC_ERROR_MESSAGE,
      });
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setBusy(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void sendQuery(input);
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col py-6">
      <h1 className="sr-only">Чат — AI-База знань</h1>

      <div
        aria-live="polite"
        className="flex flex-1 flex-col gap-4 pb-6"
      >
        {messages.length === 0 && <EmptyState onPick={sendQuery} />}
        {messages.map((m) => (
          <Message key={m.id} message={m} onCite={handleCite} />
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 flex gap-2 border-t border-navy-700 bg-navy-950 py-3"
      >
        <label className="flex-1">
          <span className="sr-only">Питання до бази знань</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Поставте питання до бази знань…"
            disabled={busy}
            className="w-full rounded-lg border border-navy-700 bg-navy-800 px-4 py-2.5 font-body text-[15px] text-ivory placeholder:text-ivory-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass disabled:opacity-60"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="shrink-0 rounded-lg bg-brass px-4 py-2.5 font-body text-[15px] font-semibold text-navy-950 transition-opacity duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass disabled:opacity-50"
        >
          Запитати
        </button>
      </form>

      <SourcePanel source={drawerSource} onClose={handleCloseDrawer} />
    </div>
  );
}
