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
import { telemetryNote } from "./telemetry-note";
import { isDaylight } from "./time";

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
    // No card: the speed is bare text, not inside a glass panel.
    expect(html).not.toContain("wl-glass");
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

  it("treats 07:00 to 19:00 local time as daylight", () => {
    const at = (hour: number) => new Date(2026, 5, 1, hour, 30).getTime();
    expect(isDaylight(at(6))).toBe(false);
    expect(isDaylight(at(7))).toBe(true);
    expect(isDaylight(at(12))).toBe(true);
    expect(isDaylight(at(18))).toBe(true);
    expect(isDaylight(at(19))).toBe(false);
    expect(isDaylight(at(23))).toBe(false);
    expect(isDaylight(undefined)).toBe(false);
  });

  it("uses no em dashes or emoji in any copy", () => {
    const { snapshot } = ridingSnapshot();
    const html = [
      renderToStaticMarkup(<StartPrompt onStart={noop} />),
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
