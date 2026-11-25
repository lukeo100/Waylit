"use client";

import { useEffect, useState, type RefObject } from "react";
import { cesiumIonToken } from "@/config";
import type { MapSceneController } from "./scene-controller";

/**
 * Development overlay: the frame rate now, the median over the last minute and the 1 percent
 * low, the frame time, and what the provider can say about its tiles. It exists so the first
 * real frame rate on a phone can be read off the screen. Shown in development builds and with
 * `?dev=1`. It never shows the token, only whether one is set. It is drawn in the right hand
 * column under the minimap (the page passes a slot), so it can never sit on the speed or turn text.
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
      rows.push(`${state.providerId ?? "none"} ${state.status}`);
      // On a development screen the amber note is a row here, so the two never stack.
      if (state.note !== undefined) rows.push(state.warning ? "amber note shown" : "note shown");
      if (stats && stats.sampleCount > 0) {
        rows.push(
          `fps ${stats.currentFps.toFixed(0)} | low ${stats.onePercentLowFps.toFixed(0)} | ${stats.lastFrameMs.toFixed(0)} ms`,
        );
        rows.push(
          `60s ${stats.medianFps.toFixed(1)} | 5m ${stats.median5MinFps.toFixed(1)} | ride ${stats.medianRideFps.toFixed(1)}`,
        );
        rows.push(`ride time ${formatRideTime(stats.rideSeconds)}`);
      } else {
        rows.push("fps waiting");
      }
      if (diag) {
        const counts: string[] = [];
        if (diag.tilesLoaded !== undefined) {
          counts.push(`${String(diag.tilesLoaded)}/${String(diag.tilesTotal ?? 0)} tiles`);
        }
        if (diag.requests !== undefined) counts.push(`${String(diag.requests)} req`);
        if (diag.memoryMegabytes !== undefined)
          counts.push(`${diag.memoryMegabytes.toFixed(0)} MB`);
        if (diag.rootRequests !== undefined) counts.push(`${String(diag.rootRequests)} root`);
        if (counts.length > 0) rows.push(counts.join(" | "));
      }
      rows.push(
        `dpr ${window.devicePixelRatio.toFixed(2)} ${String(window.innerWidth)}x${String(window.innerHeight)} ${cesiumIonToken ? "token" : "no token"}`,
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
      className="pointer-events-none w-[min(18vw,13rem)] rounded bg-black/70 px-1.5 py-1 font-mono text-[8px] leading-[1.15] break-words whitespace-pre-wrap text-text-secondary"
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
