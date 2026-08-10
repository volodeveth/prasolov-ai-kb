// Small padlock glyph used to mark knowledge-base rows the current role
// cannot access. Deliberately an inline SVG (not an emoji) per the design
// direction — emoji render inconsistently across platforms and can't take
// currentColor, which this needs to stay dimmed alongside the rest of a
// restricted row.
export function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M4.5 7V5a3.5 3.5 0 1 1 7 0v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <rect
        x="3"
        y="7"
        width="10"
        height="7"
        rx="1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="8" cy="10.3" r="0.9" fill="currentColor" />
    </svg>
  );
}
