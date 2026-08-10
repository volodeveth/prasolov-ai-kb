"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, type Category } from "@/lib/corpus";
import { ROLE_LABELS, useRole } from "@/lib/roles";
import type { Role } from "@/lib/search";
import { LockIcon } from "@/components/LockIcon";

interface KnowledgeDocument {
  slug: string;
  title: string;
  category: Category;
  roles: Role[] | null;
  updated_at: string;
  chunk_count: number;
  accessible: boolean;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("uk-UA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Ukrainian plural agreement (one/few/many) — e.g. 1 фрагмент, 2 фрагменти,
// 5 фрагментів — shared by every count label on this page so the rule lives
// in exactly one place.
function pluralizeUk(n: number, [one, few, many]: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function formatChunkCount(n: number): string {
  return `${n} ${pluralizeUk(n, ["фрагмент", "фрагменти", "фрагментів"])}`;
}

function formatDocumentCount(n: number): string {
  return `${n} ${pluralizeUk(n, ["документ", "документи", "документів"])}`;
}

function accessLabel(roles: Role[] | null): string {
  if (roles === null) return "Доступ: усі ролі";
  return `Доступ: ${roles.map((r) => ROLE_LABELS[r]).join(", ")}`;
}

function DocumentRow({ doc }: { doc: KnowledgeDocument }) {
  const restricted = !doc.accessible;
  return (
    <li
      className={`flex flex-col gap-1.5 border-b border-navy-700 px-5 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${
        restricted ? "opacity-50" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {restricted && (
          <span title={accessLabel(doc.roles)} className="shrink-0 text-ivory-dim">
            <LockIcon />
          </span>
        )}
        <span className="truncate font-display text-[16px] font-semibold text-ivory">
          {doc.title}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-4 pl-6 sm:pl-0">
        <span className="font-data text-[13px] tabular-nums text-ivory-dim">
          {DATE_FORMATTER.format(new Date(doc.updated_at))}
        </span>
        <span className="font-body text-[13px] text-ivory-dim">
          {formatChunkCount(doc.chunk_count)}
        </span>
      </div>
    </li>
  );
}

function CategorySection({
  category,
  documents,
}: {
  category: Category;
  documents: KnowledgeDocument[];
}) {
  if (documents.length === 0) return null;
  return (
    <section>
      <h2>{category}</h2>
      <ul className="mt-3 rounded-xl border border-navy-700 bg-navy-900">
        {documents.map((doc) => (
          <DocumentRow key={doc.slug} doc={doc} />
        ))}
      </ul>
    </section>
  );
}

export function KnowledgeView() {
  const { role } = useRole();
  const [documents, setDocuments] = useState<KnowledgeDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | "all">("all");

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/knowledge?role=${role}`)
      .then((res) => {
        if (!res.ok) throw new Error("bad_response");
        return res.json();
      })
      .then((body: { documents: KnowledgeDocument[] }) => {
        if (!cancelled) {
          setDocuments(body.documents);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Не вдалося завантажити список документів.");
      });

    return () => {
      cancelled = true;
    };
  }, [role]);

  const visibleCategories =
    activeCategory === "all" ? CATEGORIES : CATEGORIES.filter((c) => c === activeCategory);

  return (
    <div className="mx-auto max-w-5xl py-8">
      <h1>База знань</h1>
      <p className="mt-2 font-body text-[15px] text-ivory-dim">
        {documents
          ? `${formatDocumentCount(documents.length)} · роль: ${ROLE_LABELS[role]}`
          : "Завантаження…"}
      </p>

      <div
        role="tablist"
        aria-label="Фільтр за категорією"
        className="mt-5 flex flex-wrap gap-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeCategory === "all"}
          onClick={() => setActiveCategory("all")}
          className={`rounded-full px-3.5 py-1.5 font-body text-[13px] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass ${
            activeCategory === "all"
              ? "bg-navy-700 text-brass"
              : "bg-navy-800 text-ivory-dim hover:text-ivory"
          }`}
        >
          Усі категорії
        </button>
        {CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            role="tab"
            aria-selected={activeCategory === category}
            onClick={() => setActiveCategory(category)}
            className={`rounded-full px-3.5 py-1.5 font-body text-[13px] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass ${
              activeCategory === category
                ? "bg-navy-700 text-brass"
                : "bg-navy-800 text-ivory-dim hover:text-ivory"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-8 font-body text-[15px] text-err">{error}</p>
      )}

      {documents && (
        <div className="mt-8 flex flex-col gap-8">
          {visibleCategories.map((category) => (
            <CategorySection
              key={category}
              category={category}
              documents={documents.filter((d) => d.category === category)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
