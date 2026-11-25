"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  SERVICE_WORKER_URL,
  loadedStaticUrls,
  shouldRegister,
  watchForUpdates,
} from "@/pwa/service-worker";

/**
 * Registers the service worker in production and offers updates. Renders nothing except
 * the update prompt, which is hidden on the riding screen so nothing interrupts a trip.
 */
export function ServiceWorkerRegistrar() {
  const [apply, setApply] = useState<(() => void) | null>(null);
  const pathname = usePathname();
  const riding = pathname.startsWith("/ride");

  useEffect(() => {
    const sw = "serviceWorker" in navigator ? navigator.serviceWorker : undefined;
    if (
      !sw ||
      !shouldRegister({ production: process.env.NODE_ENV === "production", container: sw })
    ) {
      return undefined;
    }
    let cancelled = false;
    let removeForegroundCheck: (() => void) | undefined;

    sw.register(SERVICE_WORKER_URL, { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (cancelled) return;
        watchForUpdates(
          sw,
          registration,
          () => window.location.reload(),
          (applyUpdate) => {
            setApply(() => applyUpdate);
          },
        );

        // Check for a new worker whenever the app comes back to the foreground.
        const onVisible = () => {
          if (document.visibilityState === "visible") void registration.update().catch(() => {});
        };
        document.addEventListener("visibilitychange", onVisible);
        removeForegroundCheck = () => document.removeEventListener("visibilitychange", onVisible);

        // Hand the worker the assets this page already loaded, so the first offline launch works.
        void sw.ready.then((ready) => {
          const urls = loadedStaticUrls(performance.getEntriesByType("resource"), location.origin);
          ready.active?.postMessage({ type: "CACHE_URLS", urls });
        });
      })
      .catch(() => {
        // Registration failing only means no offline support. The app still works.
      });

    return () => {
      cancelled = true;
      removeForegroundCheck?.();
    };
  }, []);

  if (!apply || riding) return null;

  return (
    <div
      role="status"
      className="wl-glass fixed bottom-[max(1rem,var(--wl-safe-bottom))] left-[max(1rem,var(--wl-safe-left))] z-40 flex max-w-[calc(100vw-2rem)] items-center gap-3 px-4 py-3"
    >
      <p className="text-sm text-text">A new version of Waylit is ready.</p>
      <button
        type="button"
        onClick={apply}
        className="inline-flex min-h-12 items-center rounded-md bg-cyan px-4 text-sm font-semibold text-night-950 hover:bg-cyan-soft"
      >
        Reload
      </button>
    </div>
  );
}
