import { describe, expect, it } from "vitest";
import type { GpsStatus } from "@waylit/core";
import { gpsNoticeFor } from "./gps-notice";

describe("gpsNoticeFor", () => {
  it("says nothing when idle or the signal is good", () => {
    expect(gpsNoticeFor(undefined)).toBeUndefined();
    expect(gpsNoticeFor("idle")).toBeUndefined();
    expect(gpsNoticeFor("active")).toBeUndefined();
  });

  it("is amber, never an error, for anything that needs attention", () => {
    const attention: GpsStatus[] = ["weak", "stale", "denied", "unavailable"];
    for (const status of attention) expect(gpsNoticeFor(status)?.tone).toBe("caution");
    expect(gpsNoticeFor("requesting")?.tone).toBe("info");
  });

  it("tells the rider what to do, in plain words with no raw error text", () => {
    expect(gpsNoticeFor("denied")?.text).toMatch(/allow it/i);
    expect(gpsNoticeFor("unavailable")?.text).toMatch(/simulator/i);
    for (const status of ["weak", "stale", "denied", "unavailable", "requesting"] as const) {
      const text = gpsNoticeFor(status)!.text;
      expect(text).not.toMatch(/PERMISSION_DENIED|Error|code \d/);
      expect(text).not.toMatch(/[—–]/);
    }
  });
});
