"use client";

import { ROLE_LABELS, useRole } from "@/lib/roles";
import type { Role } from "@/lib/search";

const ROLE_ORDER: Role[] = ["partner", "lawyer", "assistant", "hr"];

// Compact segment text per the design direction ("Партнер, Юрист, Помічник,
// HR") — deliberately shorter than the canonical ROLE_LABELS used elsewhere,
// so the segmented control stays narrow enough for the header to fit all
// four nav tabs inline on desktop. Full role name is still exposed to
// assistive tech via aria-label on each segment.
const SEGMENT_LABELS: Record<Role, string> = {
  partner: "Партнер",
  lawyer: "Юрист",
  assistant: "Помічник",
  hr: "HR",
};

export function RoleSwitcher() {
  const { role, setRole } = useRole();

  return (
    <div
      role="radiogroup"
      aria-label="Роль користувача"
      className="hidden items-center gap-0.5 rounded-lg bg-navy-800 p-0.5 lg:flex"
    >
      {ROLE_ORDER.map((r) => {
        const active = r === role;
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={ROLE_LABELS[r]}
            title={ROLE_LABELS[r]}
            onClick={() => setRole(r)}
            className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 font-body text-[13px] font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass ${
              active
                ? "bg-navy-700 text-brass"
                : "text-ivory-dim hover:text-ivory"
            }`}
          >
            {SEGMENT_LABELS[r]}
          </button>
        );
      })}
    </div>
  );
}

export function RoleSwitcherMobile() {
  const { role, setRole } = useRole();

  return (
    <label className="flex lg:hidden">
      <span className="sr-only">Роль користувача</span>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        className="rounded-md border border-navy-700 bg-navy-800 px-2 py-1.5 font-body text-[13px] text-ivory focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
      >
        {ROLE_ORDER.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </label>
  );
}
