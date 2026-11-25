"use client";

import { useEffect, useState, type RefObject } from "react";
import { cesiumIonToken } from "@/config";
import type { MapSceneController } from "./scene-controller";

/**
 * Development overlay: the frame rate now, the median over the last minute and the 1 percent
 * low, the frame time, and what the provider can say about its tiles. It exists so the first
 * real frame rate on a phone can be read off the screen. Shown in development builds and with
 * `?dev=1`. It never shows the token, only whether one is set.
 */
export function MapStats({
  controllerRef,
}: {
  readonly controllerRef: RefObject<MapSceneController | null>;
}) {
  const [lines, setLines] = useState<readonly string[]>([]);

  useEffect(() => {
    const update = (): void => {
      const controller = controllerRef.current;
      if (!controller) return;
      const state = controller.getState();
      const stats = controller.getFrameStats();
      const diag = controller.getDiagnostics();
      const rows: string[] = [];
      rows.push(
        `${state.providerId ?? "none"} | ${state.status} | ${state.selection.reason} | token ${cesiumIonToken ? "set" : "not set"}`,
      );
      if (stats && stats.sampleCount > 0) {
        rows.push(
          `fps ${stats.currentFps.toFixed(0)} now | ${stats.onePercentLowFps.toFixed(0)} 1% low | ${stats.lastFrameMs.toFixed(1)} ms`,
        );
        rows.push(
          `median ${stats.medianFps.toFixed(1)} 60s | ${stats.median5MinFps.toFixed(1)} 5min | ${stats.medianRideFps.toFixed(1)} ride (${formatRideTime(stats.rideSeconds)})`,
        );
      } else {
        rows.push("fps waiting for frames");
      }
      if (diag) {
        const parts: string[] = [];
        if (diag.tilesLoaded !== undefined) {
          parts.push(
            `tiles ${String(diag.tilesLoaded)} loaded, ${String(diag.tilesPending ?? 0)} pending, ${String(diag.tilesTotal ?? 0)} total`,
          );
        }
        if (diag.requests !== undefined) parts.push(`${String(diag.requests)} requests`);
        if (diag.memoryMegabytes !== undefined) parts.push(`${diag.memoryMegabytes.toFixed(0)} MB`);
        if (diag.rootRequests !== undefined)
          parts.push(`${String(diag.rootRequests)} root request(s)`);
        if (diag.detail) parts.push(diag.detail);
        if (parts.length > 0) rows.push(parts.join(" | "));
      }
      rows.push(
        `dpr ${window.devicePixelRatio.toFixed(2)} | ${String(window.innerWidth)}x${String(window.innerHeight)}`,
      );
      setLines(rows);
    };
    update();
    const timer = window.setInterval(update, 500);
    return () => {
      window.clearInterval(timer);
    };
  }, [controllerRef]);

  if (lines.length === 0) return null;
  return (
    <pre
      data-testid="map-stats"
      aria-hidden="true"
      className="pointer-events-none absolute top-[max(0.4rem,var(--wl-safe-top))] left-1/2 z-20 max-w-[60vw] -translate-x-1/2 rounded bg-black/70 px-2 py-1 font-mono text-[10px] leading-tight whitespace-pre-wrap text-text-secondary"
    >
      {lines.join("\n")}
    </pre>
  );
}

/** Minutes and seconds, such as 4:07, so a tester can tell when 5 minutes of riding have passed. */
export function formatRideTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, "0")}`;
}
