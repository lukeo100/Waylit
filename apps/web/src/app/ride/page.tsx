"use client";

import { DEMO_ROUTE } from "@waylit/core";
import { DevControls } from "@/hud/DevControls";
import { MediaPanel } from "@/hud/MediaPanel";
import { Minimap } from "@/hud/Minimap";
import { NavigationPanel } from "@/hud/NavigationPanel";
import { AttributionSlot, ScenePlaceholder } from "@/hud/SceneSlot";
import { StartPrompt } from "@/hud/StartPrompt";
import { StatusCluster } from "@/hud/StatusCluster";
import { TripSummary } from "@/hud/TripSummary";
import { VehiclePanel } from "@/hud/VehiclePanel";
import { useDevControls, useMinuteClock, useOnline } from "@/hud/use-browser-state";
import { useMockMedia } from "@/media/useMockMedia";
import { useWakeLock } from "@/pwa/use-wake-lock";
import { useRide } from "@/ride/use-ride";

/**
 * The riding screen. It runs one simulated ride and draws the HUD around an empty middle that
 * is kept free for the 3D scene (task 8):
 *
 *   top left      speed, next turn, distance, arrival, distance and time left
 *   top right     time, weather, connectivity, minimap
 *   bottom left   media player
 *   bottom right  vehicle dashboard and End trip
 *   bottom edge   a reserved strip for map and data credits
 *
 * The screen stays awake while a trip is running and is released when it ends.
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
      className="fixed inset-0 overflow-hidden bg-night-950 text-text select-none"
    >
      <ScenePlaceholder />

      <div className="relative z-10 grid h-full grid-cols-[clamp(15rem,34vw,23rem)_minmax(0,1fr)_clamp(15rem,34vw,23rem)] grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-x-3 gap-y-2 pt-[max(0.5rem,var(--wl-safe-top))] pr-[max(0.75rem,var(--wl-safe-right))] pb-[max(0.25rem,var(--wl-safe-bottom))] pl-[max(0.75rem,var(--wl-safe-left))] short:gap-y-1.5 tight:gap-y-1">
        {summary ? null : (
          <>
            <div className="col-start-1 row-start-1">
              <NavigationPanel
                speed={snapshot.speed}
                progress={snapshot.progress}
                riding={riding}
              />
            </div>

            <div className="col-start-2 row-start-1 flex items-start justify-center">
              {devControls ? (
                <DevControls
                  playbackSpeed={snapshot.playbackSpeed}
                  telemetryLost={snapshot.telemetryLost}
                  onPlaybackSpeed={actions.setPlaybackSpeed}
                  onTelemetryLost={actions.setTelemetryLost}
                />
              ) : null}
            </div>

            <div className="col-start-3 row-start-1 flex flex-col gap-2 short:gap-1.5">
              <StatusCluster nowMs={nowMs} online={online} />
              <div className="h-[clamp(5.5rem,30dvh,11rem)] tight:h-[5.5rem]">
                <Minimap
                  route={DEMO_ROUTE}
                  alongMetres={snapshot.progress.distanceAlongMetres}
                  position={riding ? snapshot.position : undefined}
                  heading={riding ? snapshot.heading : undefined}
                  nextTurnAt={riding ? snapshot.progress.nextInstruction?.at : undefined}
                />
              </div>
            </div>

            <div className="col-start-1 row-start-3 self-end">
              <MediaPanel
                state={media.state}
                controls={media.controls}
                guarded={snapshot.guarded}
              />
            </div>

            <div className="col-start-3 row-start-3 self-end">
              <VehiclePanel
                telemetry={snapshot.telemetry}
                trip={snapshot.trip}
                gpsSpeedMps={riding ? snapshot.gpsSpeedMps : undefined}
                guarded={snapshot.guarded}
                riding={riding}
                onEndTrip={actions.endTrip}
              />
            </div>
          </>
        )}

        <AttributionSlot />
      </div>

      {snapshot.phase === "idle" ? <StartPrompt onStart={actions.start} /> : null}
      {summary && snapshot.summary ? (
        <TripSummary summary={snapshot.summary} onStartNew={actions.reset} />
      ) : null}
    </main>
  );
}
