import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { mapSettingsModel, type MapSettings as Settings } from "@/map/map-settings";
import { GUARD_ON_KMH, nextGuardState } from "@/ride/guard";
import { MapSettings, MapSettingsSheet } from "./MapSettings";

const noop = () => undefined;

function model(overrides: { token?: string | undefined; search?: string; settings?: Settings }) {
  return mapSettingsModel({
    search: overrides.search ?? "",
    token: "token" in overrides ? overrides.token : "token-for-tests",
    nodeEnv: "production",
    settings: overrides.settings ?? {},
  });
}

const sheet = (m: ReturnType<typeof model>) =>
  renderToStaticMarkup(<MapSettingsSheet model={m} onChange={noop} onClose={noop} />);

describe("map settings button", () => {
  it("is a round control of at least 44 pixels that opens a dialog", () => {
    const html = renderToStaticMarkup(
      <MapSettings model={model({})} guarded={false} onChange={noop} />,
    );
    expect(html).toContain('data-testid="map-settings-button"');
    expect(html).toContain("size-11");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Settings"');
    // Closed to start with.
    expect(html).not.toContain("map-settings-sheet");
  });

  it("needs a hold above the guard speed, and says so", () => {
    // The same guard as the media buttons: on at 8 km/h.
    expect(GUARD_ON_KMH).toBe(8);
    expect(nextGuardState(false, 8)).toBe(true);
    expect(nextGuardState(false, 7.9)).toBe(false);
    const guarded = renderToStaticMarkup(<MapSettings model={model({})} guarded onChange={noop} />);
    expect(guarded).toContain('data-guarded="true"');
    expect(guarded).toContain("Settings. Hold to press.");
    expect(guarded).toContain('data-testid="hold-ring"');
    expect(guarded).toContain("wl-hold-ring");
    const free = renderToStaticMarkup(
      <MapSettings model={model({})} guarded={false} onChange={noop} />,
    );
    expect(free).toContain('data-guarded="false"');
    expect(free).not.toContain("Hold to press");
    expect(free).not.toContain("wl-hold-ring");
  });
});

describe("map settings sheet", () => {
  it("offers Google 3D tiles and the fallback map and the three effect levels", () => {
    const html = sheet(model({}));
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Google 3D tiles");
    expect(html).toContain("Fallback map");
    expect(html).toContain("Hologram screen effect");
    for (const level of ["Off", "Low", "High"]) expect(html).toContain(`>${level}<`);
    // Every choice and the close button is a 44 pixel target.
    expect((html.match(/min-h-11/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it("marks the map and the effect in force", () => {
    const google = sheet(model({}));
    expect(google).toMatch(/aria-checked="true"[^>]*data-value="cesium"/);
    const fallback = sheet(model({ settings: { map: "fallback", fxFallback: "high" } }));
    expect(fallback).toMatch(/aria-checked="true"[^>]*data-value="fallback"/);
    expect(fallback).toMatch(/aria-checked="true"[^>]*data-value="high"/);
    // Effect defaults to off on Google tiles.
    expect(google).toMatch(/aria-checked="true"[^>]*data-value="off"/);
  });

  it("tells the maintainer that each switch to Google uses a Cesium ion request", () => {
    const html = sheet(model({}));
    expect(html).toContain('data-testid="map-quota"');
    expect(html).toContain("1,000 root requests per month");
    expect(html).toContain("Community plan");
  });

  it("disables the Google option with a plain explanation when there is no token", () => {
    const html = sheet(model({ token: undefined, settings: { map: "cesium" } }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-value="cesium"/);
    expect(html).toContain('data-testid="map-no-token"');
    expect(html).toContain("need a Cesium ion token");
    expect(html).not.toContain('data-testid="map-quota"');
    expect(html).not.toMatch(/error|failed/i);
    // The fallback is what is showing.
    expect(html).toMatch(/aria-checked="true"[^>]*data-value="fallback"/);
  });

  it("locks a choice the address has made and says how to change it", () => {
    const html = sheet(model({ search: "?map=fallback&fx=low&gps=sim" }));
    expect(html).toContain('data-testid="map-locked"');
    expect(html).toContain('data-testid="fx-locked"');
    const radios = html.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
    expect(radios.length).toBe(7);
    for (const radio of radios) expect(radio).toContain('disabled=""');
    const free = sheet(model({}));
    expect(free).not.toContain("map-locked");
    expect(free).not.toContain("fx-locked");
  });

  it("stays above the credits strip and has no red", () => {
    const html = sheet(model({}));
    expect(html).toContain("var(--wl-credits-clearance");
    expect(html).not.toMatch(/danger|text-red|bg-red/);
  });
});

describe("position source in the settings sheet", () => {
  it("offers Simulator and Phone GPS, with the simulator as the default", () => {
    const html = sheet(model({}));
    expect(html).toContain('data-testid="gps-choice"');
    expect(html).toContain("Phone GPS");
    expect(html).toMatch(/aria-checked="true"[^>]*data-value="sim"/);
    expect(html).toContain("A simulated ride on the demo route");
  });

  it("explains in plain words that live GPS is a free ride that stays on the device", () => {
    const html = sheet(model({ settings: { gps: "live" } }));
    expect(html).toMatch(/aria-checked="true"[^>]*data-value="live"/);
    expect(html).toContain("free ride");
    expect(html).toContain("never stored or sent");
  });

  it("is locked by ?gps= and while a trip is running", () => {
    const locked = sheet(model({ search: "?gps=live", settings: { gps: "sim" } }));
    expect(locked).toContain('data-testid="gps-locked"');
    expect(locked).toMatch(/aria-checked="true"[^>]*data-value="live"/);
    const busy = renderToStaticMarkup(
      <MapSettingsSheet model={model({})} canChangeGps={false} onChange={noop} onClose={noop} />,
    );
    expect(busy).toContain('data-testid="gps-busy"');
    const gpsRadios =
      busy.match(/<button[^>]*role="radio"[^>]*data-value="(sim|live)"[^>]*>/g) ?? [];
    expect(gpsRadios).toHaveLength(2);
    for (const radio of gpsRadios) expect(radio).toContain('disabled=""');
  });

  it("says a replay is playing, with no location used", () => {
    expect(sheet(model({ search: "?gps=replay" }))).toContain("generated trace");
  });

  it("shows the ground height field only for a free ride on Google tiles, with its range", () => {
    expect(sheet(model({}))).not.toContain("ground-input");
    expect(sheet(model({ settings: { gps: "live", map: "fallback" } }))).not.toContain(
      "ground-input",
    );
    const html = sheet(model({ settings: { gps: "live" } }));
    expect(html).toContain('data-testid="ground-input"');
    expect(html).toContain('min="-100"');
    expect(html).toContain('max="3000"');
    expect(html).toContain("ellipsoid");
  });
});

describe("the sheet after Google failed or the effect was lowered", () => {
  it("shows the fallback map as running, with an amber note, not Google selected", () => {
    const m = {
      ...model({ settings: { fxFallback: "low" } }),
      map: "fallback" as const,
      fx: "low" as const,
    };
    const html = renderToStaticMarkup(
      <MapSettingsSheet model={m} fellBack onChange={noop} onClose={noop} />,
    );
    expect(html).toMatch(/aria-checked="true"[^>]*data-value="fallback"/);
    expect(html).not.toMatch(/aria-checked="true"[^>]*data-value="cesium"/);
    expect(html).toMatch(/data-testid="map-fell-back"[^>]*class="[^"]*text-caution/);
    expect(html).toContain("fallback map is running");
    expect(sheet(model({}))).not.toContain("map-fell-back");
  });

  it("says when the frame rate lowered the effect, in amber, and never when the address sets it", () => {
    const m = model({ settings: { fxGoogle: "high" } });
    const html = renderToStaticMarkup(
      <MapSettingsSheet model={m} fxLoweredTo="low" onChange={noop} onClose={noop} />,
    );
    expect(html).toMatch(/data-testid="fx-lowered"[^>]*class="[^"]*text-caution/);
    expect(html).toContain("Lowered to Low");
    const locked = renderToStaticMarkup(
      <MapSettingsSheet
        model={model({ search: "?fx=high" })}
        fxLoweredTo="low"
        onChange={noop}
        onClose={noop}
      />,
    );
    expect(locked).not.toContain("fx-lowered");
    expect(sheet(m)).not.toContain("fx-lowered");
  });
});
