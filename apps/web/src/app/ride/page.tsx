"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { DEMO_ROUTE } from "@waylit/core";
import { parseTimeOverride } from "@/hud/dev-controls";
import { DaylightProvider } from "@/hud/daylight-context";
import {
  DEFAULT_SUN_POSITION,
  computeDaylight,
  roundPosition,
  unknownDaylight,
  type DaylightState,
} from "@/hud/daylight";
import { DevControls } from "@/hud/DevControls";
import { Dock } from "@/hud/Dock";
import { MediaPanel } from "@/hud/MediaPanel";
import { Minimap } from "@/hud/Minimap";
import { NavigationPanel } from "@/hud/NavigationPanel";
import { AttributionSlot, ScenePlaceholder } from "@/hud/SceneSlot";
import { StartPrompt } from "@/hud/StartPrompt";
import { StatusCluster } from "@/hud/StatusCluster";
import { TripSummary } from "@/hud/TripSummary";
import { VehiclePanel } from "@/hud/VehiclePanel";
import { telemetryNote } from "@/hud/telemetry-note";
import { useDevControls, useMinuteClock, useOnline, useSearch } from "@/hud/use-browser-state";
import { useMockMedia } from "@/media/useMockMedia";
import { useWakeLock } from "@/pwa/use-wake-lock";
import { useRide } from "@/ride/use-ride";

/**
 * The riding screen. It runs one simulated ride. The scene fills the whole screen (a dark
 * gradient until the 3D view lands in task 8) and the HUD floats on it, with no solid bars:
 *
 *   top left      vehicle speed as a huge bare number, GPS speed under it, next turn beside it
 *   top right     time, temperature, a connectivity dot and a round minimap
 *   centre        left clear for the 3D scene
 *   bottom        one joined glass dock: media player left, vehicle dashboard and End trip right
 *   bottom edge   a reserved, darker strip for map and data credits that nothing overlaps
 *
 * The screen stays awake while a trip is running and is released when it ends. Daylight comes
 * from the sun at the rider's position and the time (see `useDaylight`), and the dock is a
 * little more solid in daylight and more see-through at night, fading smoothly through dawn
 * and dusk.
 */
export default function RidePage() {
  const { snapshot, actions } = useRide();
  const riding = snapshot.phase === "riding";
  const summary = snapshot.phase === "summary";
  const wakeLock = useWakeLock(riding);
  // Media runs on the start screen and during the trip. Ending the trip stops it.
  const media = useMockMedia(!summary);
  const online = useOnline();
  const realNowMs = useMinuteClock();
  const devControls = useDevControls();

  // A developer can override the date and time (see DevControls). The override only exists
  // while the dev controls are shown, so riders can never end up on a frozen clock.
  // It starts from `?time=` in the address (see parseTimeOverride), and the controls take over
  // after that. "live" is the explicit choice to follow the real clock.
  const search = useSearch();
  const [timeChoice, setTimeChoice] = useState<number | "live" | undefined>(undefined);
  const urlTimeMs = devControls
    ? parseTimeOverride(search, DEFAULT_SUN_POSITION, realNowMs)
    : undefined;
  const timeOverrideMs =
    !devControls || timeChoice === "live" ? undefined : (timeChoice ?? urlTimeMs);
  const setTimeOverride = (ms: number | undefined): void => {
    setTimeChoice(ms ?? "live");
  };
  const nowMs = timeOverrideMs ?? realNowMs;

  // Daylight comes from the sun at the rider's position and the current time. The position is
  // the simulated GPS fix while riding (real GPS later) and the demo start otherwise. Rounded
  // to about 100 m so the state only changes when the sun could have.
  const sunPosition = roundPosition(
    riding ? (snapshot.position ?? DEFAULT_SUN_POSITION) : DEFAULT_SUN_POSITION,
  );
  const daylight = useMemo(
    () =>
      nowMs === undefined
        ? unknownDaylight(sunPosition)
        : computeDaylight(sunPosition, nowMs, timeOverrideMs !== undefined),
    // The position is rebuilt each render, so depend on its two numbers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sunPosition.lat, sunPosition.lng, nowMs, timeOverrideMs],
  );

  return (
    <DaylightProvider value={daylight}>
      <main
        data-wake-lock={wakeLock}
        data-phase={snapshot.phase}
        data-guarded={snapshot.guarded}
        data-daylight={daylight.isDay}
        data-sun-phase={daylight.solar.phase}
        style={daylightStyle(daylight)}
        className="fixed inset-0 overflow-hidden bg-night-950 text-text select-none"
      >
        <ScenePlaceholder />

        <div className="relative z-10 grid h-full grid-rows-[minmax(0,1fr)_auto_auto]">
          <div className="relative row-start-1 min-h-0 pt-[max(0.75rem,var(--wl-safe-top),2.4dvh)] pr-[max(0.75rem,var(--wl-safe-right),2vw)] pl-[max(0.75rem,var(--wl-safe-left),2vw)]">
            {summary ? null : (
              <>
                <div className="flex items-start justify-between gap-[2vw]">
                  <NavigationPanel
                    speed={snapshot.speed}
                    gpsSpeedMps={riding ? snapshot.gpsSpeedMps : undefined}
                    progress={snapshot.progress}
                    riding={riding}
                    note={telemetryNote(snapshot.telemetry, snapshot.trip, riding)}
                    simulatedNowMs={timeOverrideMs}
                  />
                  <div className="flex shrink-0 flex-col items-end gap-[clamp(0.4rem,2.2dvh,0.9rem)]">
                    <StatusCluster nowMs={nowMs} online={online} />
                    <Minimap
                      route={DEMO_ROUTE}
                      alongMetres={snapshot.progress.distanceAlongMetres}
                      position={riding ? snapshot.position : undefined}
                      heading={riding ? snapshot.heading : undefined}
                      nextTurnAt={riding ? snapshot.progress.nextInstruction?.at : undefined}
                    />
                  </div>
                </div>

                <div className="pointer-events-none absolute inset-x-0 bottom-[1.5dvh] flex flex-col items-center gap-[1.2dvh]">
                  {snapshot.phase === "idle" ? <StartPrompt onStart={actions.start} /> : null}
                  {devControls ? (
                    <DevControls
                      playbackSpeed={snapshot.playbackSpeed}
                      telemetryLost={snapshot.telemetryLost}
                      onPlaybackSpeed={actions.setPlaybackSpeed}
                      onTelemetryLost={actions.setTelemetryLost}
                      daylight={daylight}
                      realNowMs={realNowMs}
                      position={sunPosition}
                      timeOverrideMs={timeOverrideMs}
                      onTimeOverride={setTimeOverride}
                    />
                  ) : null}
                </div>
              </>
            )}
          </div>

          {summary ? null : (
            <div className="row-start-2 pt-[1dvh] pr-[max(var(--wl-safe-right),clamp(0.5rem,2vw,2.5rem))] pb-[clamp(0.25rem,1.6dvh,0.75rem)] pl-[max(var(--wl-safe-left),clamp(0.5rem,2vw,2.5rem))]">
              <Dock
                media={
                  <MediaPanel
                    state={media.state}
                    controls={media.controls}
                    guarded={snapshot.guarded}
                  />
                }
                vehicle={
                  <VehiclePanel
                    telemetry={snapshot.telemetry}
                    trip={snapshot.trip}
                    guarded={snapshot.guarded}
                    riding={riding}
                    onEndTrip={actions.endTrip}
                  />
                }
              />
            </div>
          )}

          <AttributionSlot showPlaceholder={devControls} />
        </div>

        {summary && snapshot.summary ? (
          <TripSummary summary={snapshot.summary} onStartNew={actions.reset} />
        ) : null}
      </main>
    </DaylightProvider>
  );
}

/** The CSS variables the screen's styles read: the daylight factor and the warm light amount. */
function daylightStyle(daylight: DaylightState): CSSProperties {
  return {
    "--wl-daylight": daylight.factor.toFixed(3),
    "--wl-warmth": daylight.warmth.toFixed(3),
  } as CSSProperties;
}
