"use client";

import Link from "next/link";
import { useWakeLock } from "@/pwa/use-wake-lock";

/**
 * Placeholder riding screen for the PWA shell. It shows the shell behaviour only: full
 * screen, no chrome, screen kept awake. The HUD, minimap and 3D view replace this body in
 * later tasks, and should keep the `useWakeLock` call.
 */
export default function RidePage() {
  const wakeLock = useWakeLock(true);

  return (
    <main
      data-wake-lock={wakeLock}
      className="fixed inset-0 grid place-items-center bg-night-950 px-[max(1.5rem,var(--wl-safe-right))] py-[max(1rem,var(--wl-safe-top))]"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold text-text short:text-xl">Ride screen</h1>
        <p className="max-w-[44ch] text-sm text-text-secondary">
          Placeholder for the riding view. The screen stays awake while this page is open.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-12 items-center rounded-md bg-danger px-5 text-base font-semibold text-night-950"
        >
          End trip
        </Link>
      </div>
    </main>
  );
}
