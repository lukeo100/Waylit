import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEMO_ROUTE, MOCK_TRACKS, MediaPlayer, createManualClock } from "@waylit/core";
import { RideSession } from "@/ride/ride-session";
import { Dock } from "./Dock";
import { AttributionSlot, ScenePlaceholder } from "./SceneSlot";
import { MediaPanel } from "./MediaPanel";
import { Minimap } from "./Minimap";
import { NavigationPanel } from "./NavigationPanel";
import { StartPrompt } from "./StartPrompt";
import { StatusCluster } from "./StatusCluster";
import { TripSummary } from "./TripSummary";
import { VehiclePanel } from "./VehiclePanel";
import { HoldButton } from "./HoldButton";
import { HudFrame } from "./HudFrame";
import { telemetryNote } from "./telemetry-note";
import { formatClockTime } from "./time";
import { DevControls } from "./DevControls";
import { DEFAULT_SUN_POSITION, computeDaylight } from "./daylight";

const noop = () => undefined;

function ridingSnapshot(lost = false) {
  const clock = createManualClock(1_700_000_000_000);
  const session = new RideSession({ clock });
  session.start();
  session.setTelemetryLost(lost);
  for (let i = 0; i < 160; i++) {
    clock.advance(250);
    session.tick();
  }
  return { session, snapshot: session.getSnapshot() };
}

describe("riding screen components", () => {
  it("navigation panel shows a bare speed, GPS speed apart, the turn and what is left", () => {
    const { snapshot } = ridingSnapshot();
    const html = renderToStaticMarkup(
      <NavigationPanel
        speed={snapshot.speed}
        gpsSpeedMps={snapshot.gpsSpeedMps}
        progress={snapshot.progress}
        riding
      />,
    );
    expect(html).toContain("km/h");
    expect(html).toMatch(/GPS \d/);
    expect(html).toContain('data-testid="next-turn"');
    expect(html).toContain('data-testid="turn-distance"');
    expect(html).toContain("Bear left");
    expect(html).toContain('data-testid="stat-remaining"');
    expect(html).toMatch(/\d+ min\s*(<!-- -->)?\s*<span[^>]*> \u00b7 <\/span>/);
    expect(html).toContain("Arrive ");
    // The speed and turn sit on one small plate sized to the text, not a dock style panel.
    expect(html).not.toContain("wl-glass");
    expect(html).toContain("wl-plate");
    expect(html).toContain("text-speed");
  });

  it("marks the speed as GPS fallback when the scooter speed is not available", () => {
    const { snapshot } = ridingSnapshot(true);
    const html = renderToStaticMarkup(
      <NavigationPanel
        speed={snapshot.speed}
        gpsSpeedMps={snapshot.gpsSpeedMps}
        progress={snapshot.progress}
        riding
        note={telemetryNote(snapshot.telemetry, snapshot.trip, true)}
      />,
    );
    expect(html).toContain('data-fallback="true"');
    expect(html).toContain("No scooter data. Trip distance from GPS.");
    // Amber is the warning colour: the GPS label and the note use it, and cyan is not used here.
    expect(html).toContain("text-caution");
    expect(html).not.toContain("text-cyan");
  });

  it("only says there is no scooter data while riding and when telemetry is missing", () => {
    const { snapshot } = ridingSnapshot();
    expect(telemetryNote(snapshot.telemetry, snapshot.trip, true)).toBeUndefined();
    expect(telemetryNote(undefined, snapshot.trip, false)).toBeUndefined();
    expect(telemetryNote(undefined, { ...snapshot.trip, distanceSource: "vehicle" }, true)).toBe(
      "No scooter data. Using GPS.",
    );
  });

  it("vehicle dashboard shows battery, range, trip and an End trip button", () => {
    const { snapshot } = ridingSnapshot();
    const html = renderToStaticMarkup(
      <VehiclePanel
        telemetry={snapshot.telemetry}
        trip={snapshot.trip}
        guarded={false}
        riding
        onEndTrip={noop}
      />,
    );
    expect(html).toContain('data-testid="battery-bar"');
    expect(html).toContain('data-testid="range-value"');
    expect(html).toContain('data-testid="trip-distance"');
    expect(html).toContain('data-testid="trip-duration"');
    expect(html).toContain("End trip");
    // Speed lives top left, not in the dock.
    expect(html).not.toContain("vehicle-speed");
    expect(html).not.toContain("gps-speed");
  });

  it("vehicle dashboard shows dashes when telemetry is lost and asks for a hold", () => {
    const { snapshot } = ridingSnapshot(true);
    const html = renderToStaticMarkup(
      <VehiclePanel
        telemetry={snapshot.telemetry}
        trip={snapshot.trip}
        guarded
        riding
        onEndTrip={noop}
      />,
    );
    expect(html).toContain("--");
    expect(html).toContain('data-guarded="true"');
    expect(html).toContain("Hold to end");
    expect(html).not.toContain('data-testid="battery-bar"');
  });

  it("End trip is the only red: dark red fill, muted red outline, soft red text", () => {
    const { snapshot } = ridingSnapshot();
    const dashboard = renderToStaticMarkup(
      <VehiclePanel
        telemetry={snapshot.telemetry}
        trip={snapshot.trip}
        guarded={false}
        riding
        onEndTrip={noop}
      />,
    );
    expect(dashboard).toContain("bg-danger-fill");
    expect(dashboard).toContain("border-danger-border");
    expect(dashboard).toContain("text-danger");
    const player = new MediaPlayer({ tracks: MOCK_TRACKS, clock: createManualClock(0) });
    const media = renderToStaticMarkup(
      <MediaPanel state={player.getState()} controls={player} guarded />,
    );
    expect(media).not.toContain("danger");
  });

  it("media panel shows the track, three controls and a thin progress line", () => {
    const player = new MediaPlayer({ tracks: MOCK_TRACKS, clock: createManualClock(0) });
    const html = renderToStaticMarkup(
      <MediaPanel state={player.getState()} controls={player} guarded={false} />,
    );
    expect(html).toContain(MOCK_TRACKS[0]!.title);
    expect(html).toContain(MOCK_TRACKS[0]!.artist);
    expect(html).toContain('data-testid="artwork"');
    expect(html).toContain("Previous track");
    expect(html).toContain("Play");
    expect(html).toContain("Next track");
    expect(html).toContain('aria-label="Track progress"');
    expect(html).not.toContain("wl-hold-ring");
  });

  it("media buttons show a ring and say they need a hold above the guard speed", () => {
    const player = new MediaPlayer({ tracks: MOCK_TRACKS, clock: createManualClock(0) });
    const html = renderToStaticMarkup(
      <MediaPanel state={player.getState()} controls={player} guarded />,
    );
    expect(html.match(/data-testid="hold-ring"/g)).toHaveLength(3);
    expect(html).toContain("Hold to press.");
    expect(html).toContain('data-guarded="true"');
  });

  it("every hold to press control has feedback that does not depend on animation", () => {
    const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");
    // Under reduced motion the ring and fill must not be hidden. They show complete instead.
    const reduced = css.slice(
      css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf(".wl-hold-ring")),
    );
    expect(reduced.slice(0, 260)).not.toMatch(/display:\s*none/);
    expect(reduced.slice(0, 260)).toContain("transition: none");
    // The static held state lives on the buttons themselves, with a caption beside it.
    const media = readFileSync(fileURLToPath(new URL("./MediaPanel.tsx", import.meta.url)), "utf8");
    expect(media).toContain("data-[holding=true]:bg-cyan/25");
    expect(media).toContain("Keep holding");
    const vehicle = readFileSync(
      fileURLToPath(new URL("./VehiclePanel.tsx", import.meta.url)),
      "utf8",
    );
    expect(vehicle).toContain("data-[holding=true]:bg-danger/25");
    expect(vehicle).toContain("Keep holding");
  });

  it("hold button draws a ring track only while guarded", () => {
    const guarded = renderToStaticMarkup(
      <HoldButton guarded holdMs={600} feedback="ring" label="Next" onActivate={noop}>
        x
      </HoldButton>,
    );
    expect(guarded).toContain("wl-hold-ring");
    const calm = renderToStaticMarkup(
      <HoldButton guarded={false} holdMs={600} feedback="ring" label="Next" onActivate={noop}>
        x
      </HoldButton>,
    );
    expect(calm).not.toContain("wl-hold-ring");
  });

  it("dock joins media and vehicle halves with a hairline divider", () => {
    const html = renderToStaticMarkup(<Dock media={<i>left</i>} vehicle={<i>right</i>} />);
    expect(html.indexOf("left")).toBeLessThan(html.indexOf("dock-divider"));
    expect(html.indexOf("dock-divider")).toBeLessThan(html.indexOf("right"));
    expect(html).toContain("wl-glass");
  });

  it("dock is sized to its content, capped at 80 percent of the screen width (42rem on small phones)", () => {
    const html = renderToStaticMarkup(<Dock media={<i>left</i>} vehicle={<i>right</i>} />);
    expect(html).toContain("w-fit");
    expect(html).toContain("max-w-[min(100%,max(80vw,42rem))]");
    expect(html).not.toContain("w-full");
  });

  it("uses amber for the GPS fallback label and the telemetry note, and not for normal GPS", () => {
    const lost = ridingSnapshot(true).snapshot;
    const fallback = renderToStaticMarkup(
      <NavigationPanel
        speed={lost.speed}
        gpsSpeedMps={lost.gpsSpeedMps}
        progress={lost.progress}
        riding
        note={telemetryNote(lost.telemetry, lost.trip, true)}
      />,
    );
    expect(fallback).toMatch(/data-testid="speed-source"[^>]*class="[^"]*text-caution/);
    expect(fallback).toMatch(/data-testid="telemetry-note"[^>]*class="[^"]*text-caution/);
    const live = ridingSnapshot().snapshot;
    const normal = renderToStaticMarkup(
      <NavigationPanel
        speed={live.speed}
        gpsSpeedMps={live.gpsSpeedMps}
        progress={live.progress}
        riding
      />,
    );
    expect(normal).not.toContain("text-caution");
  });

  it("status cluster is plain text with a connectivity dot", () => {
    const online = renderToStaticMarkup(
      <StatusCluster nowMs={Date.UTC(2026, 0, 1, 12, 0)} online />,
    );
    expect(online).toContain("Online");
    expect(online).toContain("19");
    expect(online).toContain("bg-ok");
    expect(online).not.toContain("wl-glass");
    const offline = renderToStaticMarkup(<StatusCluster nowMs={undefined} online={false} />);
    expect(offline).toContain("Offline");
    expect(offline).toContain("bg-caution");
    expect(offline).toContain("--:--");
  });

  it("minimap is plain drawn SVG with no tiles or images, and a clear heading cone", () => {
    const { snapshot } = ridingSnapshot();
    const html = renderToStaticMarkup(
      <Minimap
        route={DEMO_ROUTE}
        alongMetres={snapshot.progress.distanceAlongMetres}
        position={snapshot.position}
        heading={snapshot.heading}
        nextTurnAt={snapshot.progress.nextInstruction?.at}
      />,
    );
    expect(html).toContain("<polyline");
    expect(html).toContain("<circle");
    expect(html).toContain("rounded-full");
    expect(html).not.toMatch(/<img|<image|url\((?!#)|https?:|tile/i);
    // The cone is a visible wedge: a gradient fill that starts strong, plus an outline.
    expect(html).toContain('data-testid="heading-cone"');
    expect(html).toContain('stop-opacity="0.8"');
    expect(html).toContain('stroke-opacity="0.7"');
    expect(html).toContain('data-testid="rider-dot"');
  });

  it("minimap shows the whole route, north up, with no cone before the trip starts", () => {
    const html = renderToStaticMarkup(<Minimap route={DEMO_ROUTE} alongMetres={0} />);
    expect(html).toContain("whole route");
    expect(html).not.toContain("heading-cone");
  });

  it("scene is a gradient placeholder and the credits strip is its own marked row", () => {
    const scene = renderToStaticMarkup(<ScenePlaceholder />);
    expect(scene).toContain("wl-scene");
    expect(scene).not.toContain("<canvas");
    const slot = renderToStaticMarkup(<AttributionSlot />);
    expect(slot).toContain('id="attribution-slot"');
    expect(slot).toContain("row-start-3");
    expect(slot).toContain("bg-credits");
  });

  it("credits strip is empty for riders and only labelled in development", () => {
    const production = renderToStaticMarkup(<AttributionSlot />);
    expect(production).not.toMatch(/Credits area|appear here|placeholder/i);
    expect(production.replace(/<[^>]*>/g, "")).toBe("");
    const development = renderToStaticMarkup(<AttributionSlot showPlaceholder />);
    expect(development).toContain("Credits area");
  });

  it("start prompt and trip summary have the buttons the brief asks for", () => {
    expect(
      renderToStaticMarkup(<StartPrompt onStart={noop} sunMode="follow-clock" onSunMode={noop} />),
    ).toContain("Start trip");
    const html = renderToStaticMarkup(
      <TripSummary
        summary={{
          distanceMetres: 4180,
          durationSeconds: 905,
          averageSpeedKmh: 16.6,
          distanceSource: "gps",
        }}
        onStartNew={noop}
      />,
    );
    expect(html).toContain("Trip complete");
    expect(html).toContain("4.18 km");
    expect(html).toContain("15 min");
    expect(html).toContain("17 km/h");
    expect(html).toContain("Distance was counted from GPS");
    expect(html).toContain("Start new trip");
    const mixed = renderToStaticMarkup(
      <TripSummary
        summary={{
          distanceMetres: 4180,
          durationSeconds: 905,
          averageSpeedKmh: 16.6,
          distanceSource: "mixed",
        }}
        onStartNew={noop}
      />,
    );
    expect(mixed).toContain("Part of the distance was counted from GPS");
    expect(mixed).not.toContain("Distance was counted from GPS because");
    const scooter = renderToStaticMarkup(
      <TripSummary
        summary={{
          distanceMetres: 4180,
          durationSeconds: 905,
          averageSpeedKmh: 16.6,
          distanceSource: "vehicle",
        }}
        onStartNew={noop}
      />,
    );
    expect(scooter).not.toContain("GPS");
  });

  it("dev controls have the time override and every touch target is at least 44 px", () => {
    const daylight = computeDaylight(DEFAULT_SUN_POSITION, Date.UTC(2026, 5, 21, 11, 0), true);
    const render = (timeOverrideMs: number | undefined) =>
      renderToStaticMarkup(
        <DevControls
          playbackSpeed={1}
          telemetryLost={false}
          onPlaybackSpeed={noop}
          onTelemetryLost={noop}
          daylight={daylight}
          realNowMs={Date.UTC(2026, 5, 21, 11, 0)}
          position={DEFAULT_SUN_POSITION}
          timeOverrideMs={timeOverrideMs}
          onTimeOverride={noop}
        />,
      );
    // With an override in force the panel opens on the time page.
    const html = render(Date.UTC(2026, 5, 21, 11, 0));
    for (const id of ["time-dawn", "time-noon", "time-sunset", "time-night", "time-slider"]) {
      expect(html).toContain(`data-testid="${id}"`);
    }
    expect(html).toContain('data-testid="time-date"');
    expect(html).toContain('data-overridden="true"');
    expect(html).toContain("Live");
    expect(html).toContain("day");
    expect(html).not.toContain("Lose scooter data");
    // Without one it opens on the simulation page, and the time page is folded away.
    const folded = render(undefined);
    expect(folded).toContain('data-testid="time-toggle"');
    expect(folded).toContain('aria-expanded="false"');
    expect(folded).toContain("Lose scooter data");
    expect(folded).not.toContain('data-testid="time-override"');
    expect(folded).not.toContain("time-slider");
    for (const page of [html, folded]) {
      // No 32 px targets, and each page is one line that never wraps onto a second row.
      expect(page).not.toContain("min-h-8");
      expect(page).not.toContain("min-w-8");
      expect(page).toContain("flex-nowrap");
      expect(page).not.toContain("flex-wrap");
    }
    expect(html.match(/min-h-11/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
    expect(folded.match(/min-h-11/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });

  it("shows arrival from the overridden clock when the time is overridden", () => {
    const { snapshot } = ridingSnapshot();
    const remaining = snapshot.progress.remainingDurationSeconds ?? 0;
    const simulated = Date.UTC(2026, 5, 21, 11, 0);
    const html = renderToStaticMarkup(
      <NavigationPanel
        speed={snapshot.speed}
        gpsSpeedMps={snapshot.gpsSpeedMps}
        progress={snapshot.progress}
        riding
        simulatedNowMs={simulated}
      />,
    );
    expect(html).toContain(`Arrive ${formatClockTime(simulated + remaining * 1000)}`);
  });

  it("uses no em dashes or emoji in any copy", () => {
    const { snapshot } = ridingSnapshot();
    const html = [
      renderToStaticMarkup(<StartPrompt onStart={noop} sunMode="follow-clock" onSunMode={noop} />),
      renderToStaticMarkup(
        <NavigationPanel
          speed={snapshot.speed}
          gpsSpeedMps={snapshot.gpsSpeedMps}
          progress={snapshot.progress}
          riding
        />,
      ),
      renderToStaticMarkup(<AttributionSlot showPlaceholder />),
    ].join("");
    expect(html).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`));
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("HUD redesign: local readability, no screen wide backdrop", () => {
  const progressAt = (distanceToNextMetres: number) => ({
    nextInstruction: {
      manoeuvre: "turn-left" as const,
      text: "Turn left",
      at: DEMO_ROUTE.path[0]!,
    },
    distanceToNextMetres,
    distanceAlongMetres: 100,
    remainingDistanceMetres: 2000,
    remainingDurationSeconds: 400,
    arrived: false,
  });
  const speed = { speedMps: 5, source: "vehicle" as const };

  it("turns the turn arrow cyan only when the turn is imminent", () => {
    const far = renderToStaticMarkup(
      <NavigationPanel speed={speed} gpsSpeedMps={5} progress={progressAt(400)} riding />,
    );
    const near = renderToStaticMarkup(
      <NavigationPanel speed={speed} gpsSpeedMps={5} progress={progressAt(40)} riding />,
    );
    expect(far).toMatch(/data-testid="turn-arrow" data-phase="far"/);
    expect(near).toMatch(/data-testid="turn-arrow" data-phase="imminent"/);
    expect(near).toContain("wl-turn-arrow");
    // Before a trip the arrow stays quiet whatever the distance.
    const idle = renderToStaticMarkup(
      <NavigationPanel speed={speed} gpsSpeedMps={5} progress={progressAt(5)} riding={false} />,
    );
    expect(idle).toMatch(/data-testid="turn-arrow" data-phase="far"/);
  });

  it("keeps the time left and the arrival on one quiet line in secondary text", () => {
    const html = renderToStaticMarkup(
      <NavigationPanel speed={speed} gpsSpeedMps={5} progress={progressAt(400)} riding />,
    );
    expect(html).toContain('data-testid="stat-remaining"');
    expect(html).toContain('data-testid="stat-eta"');
    // Muted grey is for panels only. Text over the scene is primary, secondary or amber.
    expect(html).not.toContain("text-text-muted");
  });

  it("puts the status chip on its own plate", () => {
    const html = renderToStaticMarkup(<StatusCluster nowMs={0} online />);
    expect(html).toContain("wl-plate");
    expect(html).toContain("rounded-pill");
    expect(html).not.toContain("text-text-muted");
  });

  it("lays out the slots with no backdrop of its own", () => {
    const html = renderToStaticMarkup(
      <HudFrame
        navigation={<p data-testid="nav-slot">nav</p>}
        status={<p data-testid="status-slot">status</p>}
        mapControls={<p data-testid="map-slot">map</p>}
        centre={<p data-testid="centre-slot">centre</p>}
        dock={<p data-testid="dock-slot">dock</p>}
        credits={<AttributionSlot />}
      />,
    );
    for (const id of ["nav-slot", "status-slot", "map-slot", "centre-slot", "dock-slot"]) {
      expect(html).toContain(`data-testid="${id}"`);
    }
    // The credits strip is the last row and the only thing with a solid band.
    expect(html.lastIndexOf('data-testid="attribution-slot"')).toBeGreaterThan(
      html.indexOf('data-testid="dock-slot"'),
    );
    expect(html).not.toMatch(/wl-scrim|gradient|bg-night|bg-glass|wl-plate|wl-glass/);
  });

  it("draws only the credits strip when the trip summary is open", () => {
    const html = renderToStaticMarkup(<HudFrame credits={<AttributionSlot />} />);
    expect(html).toContain('data-testid="attribution-slot"');
    expect(html).not.toContain("justify-between");
  });

  it("puts the caption under the start button on a plate", () => {
    const html = renderToStaticMarkup(
      <StartPrompt onStart={noop} sunMode="follow-clock" onSunMode={noop} />,
    );
    expect(html).toMatch(/class="wl-plate[^"]*"[^>]*>Simulated ride/);
  });
});
