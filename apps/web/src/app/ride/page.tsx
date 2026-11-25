"use client";

import { DEMO_ROUTE } from "@waylit/core";
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
import { isDaylight } from "@/hud/time";
import { useDevControls, useMinuteClock, useOnline } from "@/hud/use-browser-state";
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
 * The screen stays awake while a trip is running and is released when it ends. Panels are a
 * little more solid in daylight and more see-through at night (`data-daylight`).
 */
export default function RidePage() {
  const { snapshot, actions } = useRide();
  const riding = snapshot.phase === "riding";
  const summary = snapshot.phase === "summary";
  const wakeLock = useWakeLock(riding);
  // Media runs on the start screen and during the trip. Ending the trip stops it.
  const media = useMockMedia(!summary);
  const online = useOnline();
  const nowMs = useMinuteClock();
  const devControls = useDevControls();

  return (
    <main
      data-wake-lock={wakeLock}
      data-phase={snapshot.phase}
      data-guarded={snapshot.guarded}
      data-daylight={isDaylight(nowMs)}
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
                  />
                ) : null}
              </div>
            </>
          )}
        </div>

        {summary ? null : (
          <div className="row-start-2 pt-[1dvh] pr-[max(var(--wl-safe-right),clamp(0.5rem,2.8vw,2.5rem))] pb-[clamp(0.25rem,1.6dvh,0.75rem)] pl-[max(var(--wl-safe-left),clamp(0.5rem,2.8vw,2.5rem))]">
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
  );
}
