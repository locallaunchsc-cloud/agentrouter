/**
 * RouteFlow mark — three nodes converging into one.
 * Geometric, Vignelli-flavored. Works at 24px and 200px, monochrome-first.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      aria-label="RouteFlow"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ color: "hsl(var(--primary))" }}
    >
      {/* Outer square — the router boundary */}
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      {/* Three inbound nodes */}
      <circle cx="7" cy="10" r="1.6" fill="currentColor" />
      <circle cx="7" cy="16" r="1.6" fill="currentColor" />
      <circle cx="7" cy="22" r="1.6" fill="currentColor" />
      {/* Converging lines */}
      <path
        d="M8.6 10 L20 16 M8.6 16 L20 16 M8.6 22 L20 16"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      {/* Router hub */}
      <circle cx="20" cy="16" r="2.4" fill="currentColor" />
      {/* Outbound */}
      <path d="M22.4 16 L27 16" stroke="currentColor" strokeWidth="1.25" />
      <path d="M26 14.3 L28 16 L26 17.7" stroke="currentColor" strokeWidth="1.25" fill="none" />
    </svg>
  );
}
