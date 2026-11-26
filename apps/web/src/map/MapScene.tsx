"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEMO_ROUTE, type LatLng, type Route } from "@waylit/core";
import {
  DEMO_ROUTE_GROUND_ELLIPSOID_METRES,
  LiveGroundEstimator,
  fxLevelIsPinned,
  resolveFxLevel,
  resolveTuning,
  type ProviderActivity,
} from "@waylit/map-provider";
import { cesiumIonToken } from "@/config";
import { devControlsEnabled } from "@/hud/dev-controls";
import type { DaylightState } from "@/hud/daylight";
import type { RidePhase } from "@/ride/ride-session";
import { MapStats } from "./MapStats";
import { sceneLightingFrom } from "./lighting-input";
import { loadProvider } from "./load-provider";
import { mapSettingsModel, type MapSettings } from "./map-settings";
import { MapSceneController, startFixOf, type SceneState } from "./scene-controller";

interface MapSceneProps {
  /** The reserved credits strip. The provider draws its credits and logos into it. */
  readonly creditsElement: HTMLElement | null;
  /** The route to guide along, or undefined for a free ride (live GPS, no route). */
  readonly route: Route | undefined;
  readonly phase: RidePhase;
  /** The simulated rider, once the trip has started. */
  readonly position: LatLng | undefined;
  readonly heading: number | undefined;
  /**
   * The ride session's distance along the route in metres, the number the HUD counts the next
   * turn from. The turn beacon uses it so the beacon and the HUD show the same distance.
   */
  readonly alongMetres?: number | undefined;
  /**
   * The phone's altitude and its accuracy, in a free ride. It feeds the ground height for Google
   * tiles (see `LiveGroundEstimator`). Never read from the tiles.
   */
  readonly altitude?:
    | {
        readonly metres: number;
        readonly accuracyMetres?: number | undefined;
        readonly timestamp: number;
      }
    | undefined;
  readonly daylight: DaylightState;
  /**
   * The rider's saved map settings. A change of map starts the other provider (through the same
   * selection and one-shot fallback rules). A change of the effect level is applied to a running
   * Google scene without starting it again, so it does not use a Cesium ion request.
   */
  readonly settings: MapSettings;
  /** Show the frame rate overlay and the provider details. Development and `?dev=1`. */
  readonly devOverlay: boolean;
  /**
   * Where the quiet note and the dev overlay are drawn: the right hand column under the minimap,
   * which nothing else uses, so they can never sit on the speed or turn text.
   */
  readonly statsSlot?: HTMLElement | null;
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
  alongMetres,
  altitude,
  daylight,
  settings,
  devOverlay,
  statsSlot = null,
}: MapSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<MapSceneController | null>(null);
  const [state, setState] = useState<SceneState | undefined>(undefined);
  const [expiredNote, setExpiredNote] = useState<string | undefined>(undefined);

  // The newest inputs, so a scene that starts late (the credits strip is found after the first
  // render) still starts with the right ones.
  const latest = useRef({ phase, daylight, settings });
  useEffect(() => {
    latest.current = { phase, daylight, settings };
  });
  const groundRef = useRef<LiveGroundEstimator | undefined>(undefined);
  // Bumped when the provider has to be started again for a new effect level.
  const [restart, setRestart] = useState(0);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !creditsElement) return;
    const search = window.location.search;
    const nodeEnv = process.env.NODE_ENV;
    const overrides = devControlsEnabled(search, nodeEnv);
    const stored = latest.current.settings;
    const { selection } = mapSettingsModel({
      search,
      token: cesiumIonToken,
      nodeEnv,
      settings: stored,
    });
    // A free ride on Google tiles takes the ground height from the phone's altitude, slowly and
    // clamped, with the settings constant until it is reliable. `?ground=` still wins. The height
    // never comes from the tiles (Amendment 3).
    const estimator = route
      ? undefined
      : new LiveGroundEstimator({
          fallbackMetres: stored.groundMetres ?? DEMO_ROUTE_GROUND_ELLIPSOID_METRES,
        });
    groundRef.current = estimator;
    const next = new MapSceneController({
      sceneElement: scene,
      creditsElement,
      selection,
      route,
      tuningFor: (id) => resolveTuning(id, search, overrides, stored.fx),
      createProvider: (id, tuning) =>
        loadProvider(id, tuning, {
          token: cesiumIonToken,
          lighting: sceneLightingFrom(latest.current.daylight),
          ...(estimator && tuning.groundHeightEllipsoidMetres === undefined
            ? { ground: estimator }
            : {}),
        }),
      startFix: startFixOf((route ?? DEMO_ROUTE).path),
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
    // A new map choice or a restart starts a fresh controller, with its own one-shot fallback.
  }, [creditsElement, route, settings.map, restart]);

  // A new effect level goes to a running Google scene directly. Anything else starts again.
  const lastFx = useRef(settings.fx);
  useEffect(() => {
    if (lastFx.current === settings.fx) return;
    lastFx.current = settings.fx;
    const controller = controllerRef.current;
    if (!controller) return;
    const search = window.location.search;
    const provider = controller.getState().providerId;
    const level = resolveFxLevel(search, provider ?? "maplibre-fallback", settings.fx);
    const pinned = fxLevelIsPinned(search, settings.fx);
    if (!controller.setFxLevel(level, pinned)) setRestart((n) => n + 1);
  }, [settings.fx]);

  // A new trip puts the camera back at the start, with no gliding.
  useEffect(() => {
    if (phase === "idle")
      controllerRef.current?.resetCamera(startFixOf((route ?? DEMO_ROUTE).path));
  }, [phase, route]);

  // The rider. The first fix of a trip puts the camera on the rider.
  useEffect(() => {
    if (position === undefined) return;
    controllerRef.current?.setRider({ position, headingDegrees: heading });
  }, [position, heading]);

  // The phone's altitude, once per fix, and the settings constant for the ground height.
  const altitudeAt = altitude?.timestamp;
  useEffect(() => {
    if (altitude)
      groundRef.current?.addSample(altitude.metres, altitude.accuracyMetres, altitude.timestamp);
    // One sample per fix: the timestamp says when a new one arrived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [altitudeAt]);
  useEffect(() => {
    if (settings.groundMetres !== undefined) groundRef.current?.setFallback(settings.groundMetres);
  }, [settings.groundMetres]);

  // The session's distance along the route, for the turn beacon's countdown.
  useEffect(() => {
    controllerRef.current?.setProgress(alongMetres);
  }, [alongMetres]);

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
      {noteVisible && !devOverlay && statsSlot
        ? createPortal(
            <p
              role="status"
              data-testid="map-note"
              className={`pointer-events-none wl-plate max-w-[22vw] rounded-md px-2 py-1 text-right text-hud-sm leading-snug ${
                state?.warning ? "text-caution" : "text-text-secondary"
              }`}
            >
              {note}
            </p>,
            statsSlot,
          )
        : null}
      {devOverlay && statsSlot
        ? createPortal(<MapStats controllerRef={controllerRef} />, statsSlot)
        : null}
    </>
  );
}
