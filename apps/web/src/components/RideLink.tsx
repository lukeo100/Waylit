"use client";

import Link from "next/link";
import { isStandalone } from "@/pwa/install";
import { tryLockLandscape } from "@/pwa/orientation";

/**
 * Link to the riding screen. The click is the user gesture that lets us attempt a
 * landscape lock. It only applies in an installed app and fails silently otherwise.
 */
export function RideLink({ children }: { readonly children: string }) {
  return (
    <Link
      href="/ride"
      onClick={() => {
        void tryLockLandscape({ screen, standalone: isStandalone() });
      }}
      className="inline-flex min-h-12 items-center rounded-md border border-glass-border bg-night-800 px-5 text-base font-semibold text-text transition-colors duration-200 ease-out hover:border-cyan"
    >
      {children}
    </Link>
  );
}
