import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEMO_ROUTE, MOCK_TRACKS, MediaPlayer, createManualClock } from "@waylit/core";
import { RideSession } from "@/ride/ride-session";
import { AttributionSlot, ScenePlaceholder } from "./SceneSlot";
import { MediaPanel } from "./MediaPanel";
import { Minimap } from "./Minimap";
import { NavigationPanel } from "./NavigationPanel";
import { StartPrompt } from "./StartPrompt";
import { StatusCluster } from "./StatusCluster";
import { TripSummary } from "./TripSummary";
import { VehiclePanel } from "./VehiclePanel";

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
  it("navigation panel shows speed, next turn and trip remaining", () => {
    const { snapshot } = ridingSnapshot();
    const html = renderToStaticMarkup(
      <NavigationPanel speed={snapshot.speed} progress={snapshot.progress} riding />,
    );
    expect(html).toContain("km/h");
    expect(html).toContain("Scooter");
    expect(html).toContain('data-testid="next-turn"');
    expect(html).toContain("Bear left");
    expect(html).toContain("To go");
    expect(html).toContain("Time left");
  });

  it("says GPS fallback when the scooter speed is not available", () => {
    const { snapshot } = ridingSnapshot(true);
    const html = renderToStaticMarkup(
      <NavigationPanel speed={snapshot.speed} progress={snapshot.progress} riding />,
    );
    expect(html).toContain("GPS fallback");
  });

  it("vehicle dashboard shows scooter speed apart from GPS speed and an End trip button", () => {
    const { snapshot } = ridingSnapshot();
    const html = renderToStaticMarkup(
      <VehiclePanel
        telemetry={snapshot.telemetry}
        trip={snapshot.trip}
        gpsSpeedMps={snapshot.gpsSpeedMps}
        guarded={false}
        riding
        onEndTrip={noop}
      />,
    );
    expect(html).toContain('data-testid="vehicle-speed"');
    expect(html).toContain('data-testid="gps-speed"');
    expect(html).toContain('data-testid="battery-bar"');
    expect(html).toContain("range");
    expect(html).toContain("End trip");
    expect(html).not.toContain("No scooter data");
  });

  it("vehicle dashboard shows dashes and a note when telemetry is lost", () => {
    const { snapshot } = ridingSnapshot(true);
    const html = renderToStaticMarkup(
      <VehiclePanel
        telemetry={snapshot.telemetry}
        trip={snapshot.trip}
        gpsSpeedMps={snapshot.gpsSpeedMps}
        guarded
        riding
        onEndTrip={noop}
      />,
    );
    expect(html).toContain("No scooter data. Trip distance from GPS.");
    expect(html).toContain("--");
    expect(html).toContain('data-guarded="true"');
  });

  it("media panel shows the track and asks for a hold above the guard speed", () => {
    const player = new MediaPlayer({ tracks: MOCK_TRACKS, clock: createManualClock(0) });
    const html = renderToStaticMarkup(
      <MediaPanel state={player.getState()} controls={player} guarded />,
    );
    expect(html).toContain(MOCK_TRACKS[0]!.title);
    expect(html).toContain(MOCK_TRACKS[0]!.artist);
    expect(html).toContain("Hold a button to use it");
    expect(html).toContain("Previous track");
    expect(html).toContain("Next track");
    const calm = renderToStaticMarkup(
      <MediaPanel state={player.getState()} controls={player} guarded={false} />,
    );
    expect(calm).toContain("00:00 / 03:04");
    expect(calm).not.toContain("Hold a button");
  });

  it("status cluster shows time, weather and connectivity", () => {
    const online = renderToStaticMarkup(
      <StatusCluster nowMs={Date.UTC(2026, 0, 1, 12, 0)} online />,
    );
    expect(online).toContain("Online");
    expect(online).toContain("19");
    const offline = renderToStaticMarkup(<StatusCluster nowMs={undefined} online={false} />);
    expect(offline).toContain("Offline");
    expect(offline).toContain("--:--");
  });

  it("minimap is plain drawn SVG with no tiles or images", () => {
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
    expect(html).not.toMatch(/<img|<image|url\(|https?:|tile/i);
  });

  it("scene is a gradient placeholder and the attribution slot is its own marked strip", () => {
    const scene = renderToStaticMarkup(<ScenePlaceholder />);
    expect(scene).toContain("wl-scene");
    expect(scene).not.toContain("<canvas");
    const slot = renderToStaticMarkup(<AttributionSlot />);
    expect(slot).toContain('id="attribution-slot"');
    expect(slot).toContain("row-start-4");
  });

  it("start prompt and trip summary have the buttons the brief asks for", () => {
    expect(renderToStaticMarkup(<StartPrompt onStart={noop} />)).toContain("Start trip");
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

  it("uses no em dashes or emoji in any copy", () => {
    const { snapshot } = ridingSnapshot();
    const html = [
      renderToStaticMarkup(<StartPrompt onStart={noop} />),
      renderToStaticMarkup(
        <NavigationPanel speed={snapshot.speed} progress={snapshot.progress} riding />,
      ),
      renderToStaticMarkup(<AttributionSlot />),
    ].join("");
    expect(html).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`));
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
