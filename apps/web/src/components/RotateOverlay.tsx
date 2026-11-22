/**
 * Asks the rider to turn a small portrait phone sideways. Pure CSS (see .wl-rotate-overlay
 * in globals.css), so it reacts instantly and needs no JavaScript. Used by the riding screen.
 */
export function RotateOverlay() {
  return (
    <div role="alert" className="wl-rotate-overlay">
      <svg
        className="wl-rotate-icon"
        viewBox="0 0 64 64"
        width="64"
        height="64"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="20" y="8" width="24" height="42" rx="5" />
        <path d="M30 44h4" />
        <path d="M10 30a22 22 0 0 0 10 24M20 54l-6-1M20 54l1-6" />
      </svg>
      <h2 className="mt-4 text-xl font-semibold text-text">Turn your phone sideways</h2>
      <p className="mt-2 max-w-[28ch] text-base leading-snug text-text-secondary">
        The riding view is built for landscape.
      </p>
    </div>
  );
}
