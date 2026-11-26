import type { GpsStatus } from "@waylit/core";

/**
 * What to tell the rider about the live GPS. Plain words. Anything that needs attention is amber
 * (`caution`), never red, because a weak signal or a refused permission is not a crash. Returns
 * undefined when there is nothing to say (idle, or a good signal).
 */
export interface GpsNotice {
  readonly tone: "info" | "caution";
  readonly text: string;
}

export function gpsNoticeFor(status: GpsStatus | undefined): GpsNotice | undefined {
  switch (status) {
    case "requesting":
      return { tone: "info", text: "Waiting for a GPS fix. Allow location if your browser asks." };
    case "weak":
      return { tone: "caution", text: "GPS signal is weak. Your position may be a little off." };
    case "stale":
      return { tone: "caution", text: "GPS signal lost. Waiting for it to come back." };
    case "denied":
      return {
        tone: "caution",
        text: "Location is blocked for this site. Allow it in your browser settings (the icon next to the address), then end this trip and start again.",
      };
    case "unavailable":
      return {
        tone: "caution",
        text: "This device or browser cannot give a location. End the trip and choose the Simulator in Settings.",
      };
    default:
      return undefined;
  }
}
