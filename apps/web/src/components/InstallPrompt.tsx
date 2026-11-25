"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { INSTALL_HINT_TEXT, installHint, installPromptStore, isStandalone } from "@/pwa/install";

/**
 * Listens for the browser's install event for the whole session and renders nothing.
 * Mounted once in the root layout so an early event is kept for the start screen.
 */
export function InstallPromptCapture() {
  useEffect(() => installPromptStore.attach(window), []);
  return null;
}

function subscribeStandalone(onChange: () => void): () => void {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Small install button for the start screen. Never render it on the riding screen.
 * Without the install event (Safari, Firefox) it falls back to a short text hint.
 */
export function InstallPrompt() {
  const state = useSyncExternalStore(
    installPromptStore.subscribe,
    installPromptStore.getState,
    () => "installed" as const,
  );
  // The server snapshot says standalone, so nothing renders until the client knows.
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone, () => true);
  const [hintDue, setHintDue] = useState(false);

  // Wait a moment before showing the hint, so it does not flash before the event arrives.
  useEffect(() => {
    const timer = setTimeout(() => {
      setHintDue(true);
    }, 2500);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  if (standalone || state === "installed") return null;

  if (state === "available") {
    return (
      <button
        type="button"
        onClick={() => {
          void installPromptStore.prompt();
        }}
        className="inline-flex min-h-12 items-center rounded-md border border-glass-border bg-night-800 px-5 text-base font-semibold text-text transition-colors duration-200 ease-out hover:border-cyan"
      >
        Install app
      </button>
    );
  }

  if (!hintDue) return null;
  const hint = installHint({ userAgent: navigator.userAgent, standalone });
  if (hint === "installed") return null;
  return (
    <p className="max-w-[40ch] text-sm leading-snug text-text-muted">{INSTALL_HINT_TEXT[hint]}</p>
  );
}
