"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { DEMO_ROUTE, sunMoment, utcOffsetMinutesAt } from "@waylit/core";
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
import { HudFrame } from "@/hud/HudFrame";
import { MediaPanel } from "@/hud/MediaPanel";
import { Minimap } from "@/hud/Minimap";
import { NavigationPanel } from "@/hud/NavigationPanel";
import { AttributionSlot, ScenePlaceholder } from "@/hud/SceneSlot";
import { StartPrompt } from "@/hud/StartPrompt";
import { StatusCluster } from "@/hud/StatusCluster";
import { TripSummary } from "@/hud/TripSummary";
import { VehiclePanel } from "@/hud/VehiclePanel";
import { telemetryNote } from "@/hud/telemetry-note";
import { POSITION_SOURCE } from "@/hud/sun-mode";
import { useCreditsClearance } from "@/hud/use-credits-clearance";
import {
  useDevControls,
  useMinuteClock,
  useOnline,
  useMapSettings,
  useSearch,
  useSunMode,
} from "@/hud/use-browser-state";
import { MapScene } from "@/map/MapScene";
import { mapSettingsModel } from "@/map/map-settings";
import { cesiumIonToken } from "@/config";
import { MapSettings } from "@/hud/MapSettings";
import { useMockMedia } from "@/media/useMockMedia";
import { browserFullscreenEnvironment, enterFullscreen, exitFullscreen } from "@/pwa/fullscreen";
import { safetyNotice } from "@/pwa/safety-notice";
import { useWakeLock } from "@/pwa/use-wake-lock";
import { useRide } from "@/ride/use-ride";

/**
 * The riding screen. It runs one simulated ride. The 3D scene fills the whole screen with
 * nothing darkening it, and the HUD floats on it as a few small glass objects (see HudFrame):
 *
 *   top left      speed and next turn on one small plate
 *   top right     a status chip (time, temperature, connectivity), map settings and the minimap
 *   centre        left clear for the 3D scene
 *   bottom        one joined glass dock: media player left, vehicle dashboard and End trip right
 *   bottom edge   a reserved, darker strip for map and data credits that nothing overlaps
 *
 * The screen stays awake and fullscreen while a trip is running (so the phone's status and
 * navigation bars are hidden and the app draws its own top strip), and both are released when it
 * ends. Daylight comes
 * from the sun at the rider's position and the time (see `useDaylight`), and the dock is a
 * little more solid in daylight and more see-through at night, fading smoothly through dawn
 * and dusk.
 */
export default function RidePage() {
  const { snapshot, actions } = useRide();
  const riding = snapshot.phase === "riding";
  const summary = snapshot.phase === "summary";
  const wakeLock = useWakeLock(riding);
  // Go fullscreen from the Start trip tap (a user gesture), so the phone's system bars hide while
  // riding. It does nothing when the installed app is already fullscreen, and fails silently.
  const { start } = actions;
  const startTrip = useCallback(() => {
    void enterFullscreen(browserFullscreenEnvironment());
    start();
  }, [start]);
  // Leave fullscreen when the trip ends, or when the rider leaves the screen.
  useEffect(() => {
    if (!riding) return undefined;
    return () => {
      void exitFullscreen(browserFullscreenEnvironment());
    };
  }, [riding]);
  // Media runs on the start screen and during the trip. Ending the trip stops it.
  const media = useMockMedia(!summary);
  const online = useOnline();
  const realNowMs = useMinuteClock();
  const devControls = useDevControls();
  // The credits strip is where the 3D scene draws its required credits and logos.
  const [creditsElement, setCreditsElement] = useState<HTMLElement | null>(null);
  // The dev overlay is drawn in the right column under the minimap, away from the turn text.
  const [statsSlot, setStatsSlot] = useState<HTMLElement | null>(null);
  // The first run safety notice sits above the credits strip (it reads the strip's height), and
  // the 3D scene does not start until it has been acknowledged, so no tile credits are ever on
  // screen behind an open notice. The server snapshot says acknowledged, like the notice itself.
  const noticeAcknowledged = useSyncExternalStore(
    safetyNotice.subscribe,
    safetyNotice.isAcknowledged,
    () => true,
  );
  useCreditsClearance(creditsElement?.parentElement ?? null);

  // A developer can override the date and time (see DevControls). The override only exists
  // while the dev controls are shown, so riders can never end up on a frozen clock.
  // It starts from `?time=` in the address (see parseTimeOverride), and the controls take over
  // after that. "live" is the explicit choice to follow the real clock.
  const search = useSearch();
  const [mapSettings, setMapSettings] = useMapSettings();
  const mapModel = mapSettingsModel({
    search,
    token: cesiumIonToken,
    nodeEnv: process.env.NODE_ENV,
    settings: mapSettings,
  });
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
  // Which moment the sun is worked out for. The HUD clock above always shows the device's own
  // time. In simulation the sun follows that clock by default, applied at the route's place, and
  // a developer override (a real instant at the place) wins over both modes. With real GPS
  // (POSITION_SOURCE "gps") the real time is used as it is.
  const [sunMode, setSunMode] = useSunMode();
  const sunMs =
    timeOverrideMs ??
    (realNowMs === undefined
      ? undefined
      : sunMoment({
          mode: sunMode,
          positionSource: POSITION_SOURCE,
          deviceNowMs: realNowMs,
          deviceUtcOffsetMinutes: utcOffsetMinutesAt(realNowMs),
          position: sunPosition,
        }));
  const daylight = useMemo(
    () =>
      sunMs === undefined || nowMs === undefined
        ? unknownDaylight(sunPosition)
        : computeDaylight(sunPosition, sunMs, timeOverrideMs !== undefined, nowMs),
    // The position is rebuilt each render, so depend on its two numbers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sunPosition.lat, sunPosition.lng, sunMs, nowMs, timeOverrideMs],
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
        <MapScene
          creditsElement={noticeAcknowledged ? creditsElement : null}
          route={DEMO_ROUTE}
          phase={snapshot.phase}
          position={riding ? snapshot.position : undefined}
          heading={riding ? snapshot.heading : undefined}
          alongMetres={riding ? snapshot.progress.distanceAlongMetres : undefined}
          daylight={daylight}
          settings={mapSettings}
          devOverlay={devControls}
          statsSlot={statsSlot}
        />
        <HudFrame
          navigation={
            summary ? undefined : (
              <NavigationPanel
                speed={snapshot.speed}
                gpsSpeedMps={riding ? snapshot.gpsSpeedMps : undefined}
                progress={snapshot.progress}
                riding={riding}
                note={telemetryNote(snapshot.telemetry, snapshot.trip, riding)}
                simulatedNowMs={timeOverrideMs}
              />
            )
          }
          status={summary ? undefined : <StatusCluster nowMs={nowMs} online={online} />}
          mapControls={
            summary ? undefined : (
              <>
                <MapSettings
                  model={mapModel}
                  guarded={snapshot.guarded}
                  onChange={setMapSettings}
                />
                <Minimap
                  route={DEMO_ROUTE}
                  alongMetres={snapshot.progress.distanceAlongMetres}
                  position={riding ? snapshot.position : undefined}
                  heading={riding ? snapshot.heading : undefined}
                  nextTurnAt={riding ? snapshot.progress.nextInstruction?.at : undefined}
                />
              </>
            )
          }
          statsSlotRef={setStatsSlot}
          centre={
            summary ? undefined : (
              <>
                {snapshot.phase === "idle" ? (
                  <StartPrompt onStart={startTrip} sunMode={sunMode} onSunMode={setSunMode} />
                ) : null}
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
              </>
            )
          }
          dock={
            summary ? undefined : (
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
            )
          }
          credits={<AttributionSlot showPlaceholder={devControls} creditsRef={setCreditsElement} />}
        />

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
