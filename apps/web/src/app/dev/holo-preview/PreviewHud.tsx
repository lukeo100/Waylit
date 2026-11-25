"use client";

import { useMemo, type CSSProperties } from "react";
import {
  MOCK_TRACKS,
  fromLocalMetres,
  type MediaControls,
  type MediaState,
  type MediaTrack,
} from "@waylit/core";
import { Dock } from "@/hud/Dock";
import { HudFrame } from "@/hud/HudFrame";
import { MediaPanel } from "@/hud/MediaPanel";
import { Minimap } from "@/hud/Minimap";
import { NavigationPanel } from "@/hud/NavigationPanel";
import { AttributionSlot } from "@/hud/SceneSlot";
import { StatusCluster } from "@/hud/StatusCluster";
import { VehiclePanel } from "@/hud/VehiclePanel";
import { computeDaylight, presetInstant, type TimePreset } from "@/hud/daylight";
import { MapSettings } from "@/hud/MapSettings";
import { mapSettingsModel } from "@/map/map-settings";
import {
  PREVIEW_ORIGIN,
  PREVIEW_ROUTE_METRES,
  PREVIEW_TURN_METRES,
  previewRoute,
} from "./preview-route";

/** The preview rider's speed: 18 km/h, so the hold guard is on as it would be on the road. */
const SPEED_MPS = 18 / 3.6;
const NO_OP = (): void => undefined;
const CONTROLS: MediaControls = {
  play: NO_OP,
  pause: NO_OP,
  toggle: NO_OP,
  next: NO_OP,
  previous: NO_OP,
  seek: NO_OP,
};

interface PreviewHudProps {
  readonly preset: TimePreset;
  /** Metres along the preview route, the same distance the scene puts the rider at. */
  readonly along: number;
}

/**
 * The real riding HUD over the procedural preview scene, with fixed mock values, so the redesign
 * can be shot and compared in headless Chrome with no Google tiles and no network. It uses the
 * same `HudFrame` and panels as the ride page, and the same daylight variables, so plates and
 * glass follow the chosen time of day. Open it with `/dev/holo-preview?dev=1&hud=1`.
 */
export function PreviewHud({ preset, along }: PreviewHudProps) {
  const route = useMemo(() => previewRoute(), []);
  const instant = presetInstant(preset, PREVIEW_ORIGIN, Date.UTC(2026, 10, 25, 12, 0));
  const daylight = computeDaylight(PREVIEW_ORIGIN, instant, true);
  const remaining = Math.max(PREVIEW_ROUTE_METRES - along, 0);
  const turn = route.instructions[1];
  const track = MOCK_TRACKS[0] as MediaTrack;
  const media: MediaState = {
    status: "playing",
    trackIndex: 0,
    track,
    trackCount: MOCK_TRACKS.length,
    positionSeconds: 71,
    durationSeconds: track.durationSeconds,
    progress: 71 / track.durationSeconds,
  };
  const model = mapSettingsModel({
    search: "",
    token: undefined,
    nodeEnv: "production",
    settings: {},
  });

  return (
    <div
      data-testid="preview-hud"
      data-daylight={daylight.isDay}
      style={
        {
          "--wl-daylight": daylight.factor.toFixed(3),
          "--wl-warmth": daylight.warmth.toFixed(3),
        } as CSSProperties
      }
      className="pointer-events-none absolute inset-0 text-text select-none [&_button]:pointer-events-auto"
    >
      <HudFrame
        navigation={
          <NavigationPanel
            speed={{ speedMps: SPEED_MPS, source: "vehicle" }}
            gpsSpeedMps={SPEED_MPS - 0.3}
            progress={{
              ...(turn
                ? {
                    nextInstruction: { ...turn, text: "Turn left onto the cross street" },
                    distanceToNextMetres: Math.max(PREVIEW_TURN_METRES - along, 0),
                  }
                : {}),
              distanceAlongMetres: along,
              remainingDistanceMetres: remaining + 4100,
              remainingDurationSeconds: (remaining + 4100) / SPEED_MPS,
              etaTimestamp: instant + ((remaining + 4100) / SPEED_MPS) * 1000,
              arrived: false,
            }}
            riding
          />
        }
        status={<StatusCluster nowMs={instant} online />}
        mapControls={
          <>
            <MapSettings model={model} guarded onChange={NO_OP} />
            <Minimap
              route={route}
              alongMetres={along}
              position={fromLocalMetres(PREVIEW_ORIGIN, { east: 0, north: -60 + along })}
              heading={0}
              nextTurnAt={turn?.at}
            />
          </>
        }
        dock={
          <Dock
            media={<MediaPanel state={media} controls={CONTROLS} guarded />}
            vehicle={
              <VehiclePanel
                telemetry={{
                  speedMps: SPEED_MPS,
                  batteryPercent: 82,
                  rangeMetres: 31_000,
                  timestamp: instant,
                }}
                trip={{
                  distanceMetres: 3240,
                  durationSeconds: 762,
                  distanceSource: "vehicle",
                  durationSource: "vehicle",
                  usedGps: false,
                  gpsDistanceMetres: 0,
                }}
                guarded
                riding
                onEndTrip={NO_OP}
              />
            }
          />
        }
        credits={<AttributionSlot />}
      />
    </div>
  );
}
