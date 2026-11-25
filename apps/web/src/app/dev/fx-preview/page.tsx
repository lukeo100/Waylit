"use client";

import { useEffect, useRef, useState } from "react";
import { devControlsEnabled } from "@/hud/dev-controls";

/**
 * A development page for looking at the futuristic effect without Google tiles. It draws a small
 * procedural city (boxes, roads and ground in pale photographic colours) under the Cesium sky,
 * lit for a chosen moment, and runs the real post process stage on it. It needs `?dev=1`.
 *
 *   /dev/fx-preview?dev=1&time=noon|dawn|sunset|night&fx=off|low|high
 *
 * It exists so the shader can be compiled and checked in headless Chrome, where Google tiles
 * cannot be loaded. It uses no tiles, no tokens and no network. `window.__fxPreview` reports the
 * state for scripts.
 */
export default function FxPreviewPage() {
  const host = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("Loading");

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    if (!devControlsEnabled(window.location.search, process.env.NODE_ENV)) {
      queueMicrotask(() => {
        setMessage("Add ?dev=1 to use this page.");
      });
      return;
    }
    let destroy: (() => void) | undefined;
    let cancelled = false;
    void import("./preview-scene").then(({ startPreview }) => {
      if (cancelled) return;
      destroy = startPreview(element, window.location.search);
      setMessage("");
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, []);

  return (
    <main className="fixed inset-0 bg-night-950 text-text">
      <div ref={host} className="absolute inset-0" />
      {message ? <p className="absolute top-2 left-2 text-sm">{message}</p> : null}
    </main>
  );
}
