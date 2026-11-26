import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AdapterStatus } from "@waylit/vehicle";
import { createInertVehicleController, type VehicleSnapshot } from "@/vehicle/vehicle-controller";
import { mapSettingsModel } from "@/map/map-settings";
import { MapSettingsSheet } from "./MapSettings";
import { VehicleSettings } from "./VehicleSettings";

const controller = createInertVehicleController();

function html(snapshot: Partial<VehicleSnapshot> & { status?: AdapterStatus }, guarded = false) {
  const full: VehicleSnapshot = {
    mode: "g3",
    lockedByAddress: false,
    status: { state: "idle" },
    ...snapshot,
  };
  return renderToStaticMarkup(
    <VehicleSettings snapshot={full} controller={controller} guarded={guarded} />,
  );
}

describe("Vehicle section", () => {
  it("shows the Mock default with a quiet note and the read only line", () => {
    const out = html({ mode: "mock" });
    expect(out).toContain('data-testid="vehicle-choice"');
    expect(out).toContain("Mock");
    expect(out).toContain("MAX G3 (Bluetooth)");
    expect(out).toContain("Reads only. Waylit never sends control commands.");
    expect(out).toContain('data-testid="vehicle-mock-note"');
    expect(out).not.toContain('data-testid="vehicle-connect"');
    expect(out).not.toContain("official Segway app");
  });

  it("shows Connect, the state line and every required note for the real scooter", () => {
    const out = html({});
    expect(out).toContain('data-testid="vehicle-connect"');
    expect(out).toContain('data-testid="vehicle-status"');
    expect(out).toContain("Reads only. Waylit never sends control commands.");
    expect(out).toContain("Keep the screen on while riding");
    expect(out).toContain("official Segway app");
    expect(out).toContain("unverified");
    expect(out).toContain("Not affiliated with Segway");
    expect(out).not.toMatch(/<button[^>]*data-testid="vehicle-connect"[^>]*disabled/);
  });

  it("makes the choice buttons at least 44 pixels tall", () => {
    expect(html({})).toContain("min-h-11");
  });

  it("uses amber for needs attention and offers pairing with a plain warning", () => {
    const out = html({ status: { state: "auth-needed", detail: "not-paired" } });
    expect(out).toContain('data-tone="attention"');
    expect(out).toContain("text-caution");
    expect(out).toContain('data-testid="vehicle-pair"');
    expect(out).toContain('data-testid="vehicle-pair-warning"');
    expect(out).toContain("sign the official app out");
    expect(out).not.toContain("text-danger");
  });

  it("uses red only for a real error", () => {
    const err = html({ status: { state: "error", detail: "connect-failed" } });
    expect(err).toContain('data-tone="error"');
    expect(err).toContain("text-danger");
    for (const status of [
      { state: "idle" },
      { state: "connecting" },
      { state: "connected" },
      { state: "auth-needed", detail: "rejected" },
      { state: "disconnected", detail: "needs-tap" },
      { state: "unsupported", detail: "ios" },
    ] as AdapterStatus[]) {
      expect(html({ status }), JSON.stringify(status)).not.toContain("text-danger");
    }
  });

  it("disables Connect with a plain message in an unsupported browser", () => {
    const out = html({ status: { state: "unsupported", detail: "ios" } });
    expect(out).toMatch(/<button[^>]*data-testid="vehicle-connect"[^>]*disabled/);
    expect(out).toContain("iPhone and iPad");
  });

  it("switches Connect off above the guard speed", () => {
    const out = html({}, true);
    expect(out).toMatch(/<button[^>]*data-testid="vehicle-connect"[^>]*disabled/);
    expect(out).toContain("Connecting is off while riding fast.");
  });

  it("offers Disconnect when connected", () => {
    const out = html({ status: { state: "connected" } });
    expect(out).toContain("Disconnect");
  });

  it("says the address decides and labels the desk simulator", () => {
    expect(html({ lockedByAddress: true })).toContain('data-testid="vehicle-locked"');
    const sim = html({ mode: "g3sim", lockedByAddress: true });
    expect(sim).toContain('data-testid="vehicle-sim"');
    expect(sim).not.toContain("official Segway app");
  });

  it("has no em dash, en dash or emoji", () => {
    const out = html({ status: { state: "auth-needed", detail: "not-paired" } });
    expect(out).not.toMatch(/[\u2013\u2014]/);
    expect(out).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("settings sheet slot", () => {
  it("shows the Vehicle section inside the sheet after the map settings", () => {
    const model = mapSettingsModel({
      search: "",
      token: "token-for-tests",
      nodeEnv: "production",
      settings: {},
    });
    const out = renderToStaticMarkup(
      <MapSettingsSheet
        model={model}
        onChange={() => undefined}
        onClose={() => undefined}
        sections={
          <VehicleSettings
            snapshot={{ mode: "mock", lockedByAddress: false, status: { state: "idle" } }}
            controller={controller}
            guarded={false}
          />
        }
      />,
    );
    expect(out.indexOf('data-testid="fx-choice"')).toBeLessThan(
      out.indexOf('data-testid="vehicle-settings"'),
    );
  });
});
