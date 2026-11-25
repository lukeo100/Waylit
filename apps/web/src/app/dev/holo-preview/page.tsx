"use client";

import { useEffect, useRef, useState } from "react";
import { devControlsEnabled } from "@/hud/dev-controls";
import type { TimePreset } from "@/hud/daylight";
import { PreviewHud } from "./PreviewHud";

/**
 * A development page for looking at the hologram layer without Google tiles or any network. It
 * draws a small procedural street scene with the real hologram code on top, on either engine:
 *
 *   /dev/holo-preview?dev=1&engine=cesium|maplibre&time=noon|dawn|sunset|night&fx=off|low|high
 *                    &along=<metres>   hold the rider at a distance along the route
 *                    &hud=1            draw the real riding HUD on top, with fixed mock values
 *
 * Cesium draws pale boxes under the Cesium sky, with the real post process stage, chevrons,
 * beacon, heading marker and rider. The corridor is stood in for by a flat strip, because a
 * classification volume needs real 3D Tiles to classify. MapLibre draws extruded boxes through
 * the real holographic building style, grid, scan band, corridor and custom layer.
 *
 * It exists so the shaders and layers can be compiled and looked at in headless Chrome. It uses
 * no tiles, no tokens and no network. `window.__holoPreview` reports the state for scripts.
 */
export default function HoloPreviewPage() {
  const host = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("Loading");
  const [hud, setHud] = useState<{ preset: TimePreset; along: number } | undefined>(undefined);

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
    void import("./holo-preview-scene").then(({ startHoloPreview }) => {
      if (cancelled) return;
      destroy = startHoloPreview(element, window.location.search);
      setMessage("");
      const params = new URLSearchParams(window.location.search);
      if (params.get("hud") === "1") {
        const along = Number(params.get("along") ?? "NaN");
        setHud({
          preset: (params.get("time") ?? "night") as TimePreset,
          along: Number.isFinite(along) ? along : 60,
        });
      }
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, []);

  return (
    <main className="fixed inset-0 bg-night-950 text-text">
      <div ref={host} className="absolute inset-0" />
      {hud ? <PreviewHud preset={hud.preset} along={hud.along} /> : null}
      {message ? <p className="absolute top-2 left-2 text-sm">{message}</p> : null}
    </main>
  );
}
