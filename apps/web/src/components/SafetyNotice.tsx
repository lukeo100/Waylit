"use client";

import { useSyncExternalStore } from "react";
import { safetyNotice } from "@/pwa/safety-notice";

/**
 * First run notice. Waylit is a navigation aid, not a safety system. Shown until the
 * rider acknowledges it, then remembered in localStorage.
 *
 * The server snapshot says "already acknowledged", so the notice never appears in the
 * prerendered HTML and there is no hydration mismatch. It appears after hydration.
 */
export function SafetyNotice() {
  const acknowledged = useSyncExternalStore(
    safetyNotice.subscribe,
    safetyNotice.isAcknowledged,
    () => true,
  );

  if (acknowledged) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="safety-notice-title"
      aria-describedby="safety-notice-body"
      className="fixed right-[max(1rem,var(--wl-safe-right))] bottom-[max(1rem,var(--wl-safe-bottom))] left-[max(1rem,var(--wl-safe-left))] z-50 mx-auto max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto rounded-lg border border-l-4 border-glass-border border-l-caution bg-night-800 px-4 py-3 shadow-glow-volt short:py-2"
    >
      <h2 id="safety-notice-title" className="text-base font-semibold text-caution">
        Navigation aid, not a safety system
      </h2>
      <p id="safety-notice-body" className="mt-1 text-sm leading-normal text-text-secondary">
        Follow your local road and path rules, stay alert, and do not interact with the screen while
        riding. Waylit is provided as is, without warranty.
      </p>
      <div className="mt-3 flex justify-end short:mt-2">
        <button
          type="button"
          onClick={() => {
            safetyNotice.acknowledge();
          }}
          className="inline-flex min-h-12 min-w-12 items-center rounded-md bg-volt px-5 text-base font-semibold text-night-950 shadow-glow-volt transition-colors duration-200 ease-out hover:bg-volt-soft"
        >
          I understand
        </button>
      </div>
    </div>
  );
}
