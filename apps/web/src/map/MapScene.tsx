"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLng, Route } from "@waylit/core";
import { resolveTuning, selectProvider, type ProviderActivity } from "@waylit/map-provider";
import { cesiumIonToken } from "@/config";
import { devControlsEnabled } from "@/hud/dev-controls";
import type { DaylightState } from "@/hud/daylight";
import type { RidePhase } from "@/ride/ride-session";
import { MapStats } from "./MapStats";
import { sceneLightingFrom } from "./lighting-input";
import { loadProvider } from "./load-provider";
import { MapSceneController, startFixOf, type SceneState } from "./scene-controller";

interface MapSceneProps {
  /** The reserved credits strip. The provider draws its credits and logos into it. */
  readonly creditsElement: HTMLElement | null;
  readonly route: Route;
  readonly phase: RidePhase;
  /** The simulated rider, once the trip has started. */
  readonly position: LatLng | undefined;
  readonly heading: number | undefined;
  readonly daylight: DaylightState;
  /** Show the frame rate overlay and the provider details. Development and `?dev=1`. */
  readonly devOverlay: boolean;
}

const ACTIVITY: Record<RidePhase, ProviderActivity> = {
  idle: "idle",
  riding: "riding",
  summary: "paused",
};

/** How long a note stays on screen outside development, in milliseconds. */
const NOTE_MS = 20_000;

/**
 * The 3D scene behind the HUD. It fills the screen, draws nothing of its own in React, and hands
 * the work to a `MapSceneController`: the follow camera, the provider and the fallback rule. This
 * component only passes in the rider, the daylight and the ride phase, and shows a quiet amber
 * note if the photorealistic map could not be used.
 */
export function MapScene({
  creditsElement,
  route,
  phase,
  position,
  heading,
  daylight,
  devOverlay,
}: MapSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<MapSceneController | null>(null);
  const [state, setState] = useState<SceneState | undefined>(undefined);
  const [expiredNote, setExpiredNote] = useState<string | undefined>(undefined);

  // The newest inputs, so a scene that starts late (the credits strip is found after the first
  // render) still starts with the right ones.
  const latest = useRef({ phase, daylight });
  useEffect(() => {
    latest.current = { phase, daylight };
  });

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !creditsElement) return;
    const search = window.location.search;
    const nodeEnv = process.env.NODE_ENV;
    const overrides = devControlsEnabled(search, nodeEnv);
    const selection = selectProvider({ search, token: cesiumIonToken, nodeEnv });
    const next = new MapSceneController({
      sceneElement: scene,
      creditsElement,
      selection,
      tuningFor: (id) => resolveTuning(id, search, overrides),
      createProvider: (id, tuning) =>
        loadProvider(id, tuning, {
          token: cesiumIonToken,
          lighting: sceneLightingFrom(latest.current.daylight),
        }),
      startFix: startFixOf(route.path),
      now: () => performance.now(),
      onState: setState,
    });
    controllerRef.current = next;
    next.setLighting(sceneLightingFrom(latest.current.daylight));
    next.setActivity(ACTIVITY[latest.current.phase]);
    // Start on the next tick, so React's development double mount cancels before any request.
    const timer = window.setTimeout(() => {
      void next.start();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      next.dispose();
      controllerRef.current = null;
    };
  }, [creditsElement, route]);

  // A new trip puts the camera back at the start, with no gliding.
  useEffect(() => {
    if (phase === "idle") controllerRef.current?.resetCamera(startFixOf(route.path));
  }, [phase, route]);

  // The rider. The first fix of a trip puts the camera on the rider.
  useEffect(() => {
    if (position === undefined) return;
    controllerRef.current?.setRider({ position, headingDegrees: heading });
  }, [position, heading]);

  useEffect(() => {
    controllerRef.current?.setActivity(ACTIVITY[phase]);
  }, [phase]);

  useEffect(() => {
    controllerRef.current?.setLighting(sceneLightingFrom(daylight));
  }, [daylight]);

  // A note shows for a while and then goes, unless this is a development screen.
  const note = state?.note;
  useEffect(() => {
    if (note === undefined || devOverlay) return;
    const timer = window.setTimeout(() => {
      setExpiredNote(note);
    }, NOTE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [note, devOverlay]);
  const noteVisible = note !== undefined && (devOverlay || expiredNote !== note);

  return (
    <>
      <div
        data-testid="map-scene"
        data-slot="map"
        data-map-provider={state?.providerId}
        data-map-status={state?.status ?? "loading"}
        role="img"
        aria-label="3D map of the route"
        className="wl-map absolute inset-0"
      >
        {/* The renderer fills this inner box. Its own stylesheet sets the container to
            position: relative, which would collapse an absolutely positioned container. */}
        <div ref={sceneRef} className="h-full w-full" />
      </div>
      {noteVisible ? (
        <p
          role="status"
          data-testid="map-note"
          className={`pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 rounded-full bg-glass px-3 py-1 text-hud-sm ${
            devOverlay
              ? "top-[max(4.2rem,var(--wl-safe-top))]"
              : "top-[max(0.4rem,var(--wl-safe-top))]"
          } ${state?.warning ? "text-caution" : "text-text-secondary"}`}
        >
          {note}
        </p>
      ) : null}
      {devOverlay ? <MapStats controllerRef={controllerRef} /> : null}
    </>
  );
}
