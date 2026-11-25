import type { TripReading, VehicleTelemetry } from "@waylit/vehicle";

/**
 * The note shown when the scooter has stopped sending data during a trip, or undefined when
 * there is nothing to say. Trip distance is mentioned when it is being counted from GPS.
 */
export function telemetryNote(
  telemetry: VehicleTelemetry | undefined,
  trip: TripReading,
  riding: boolean,
): string | undefined {
  if (!riding || telemetry !== undefined) return undefined;
  const gpsTrip = trip.distanceSource === "gps" && trip.distanceFallbackReason !== undefined;
  return `No scooter data. ${gpsTrip ? "Trip distance from GPS." : "Using GPS."}`;
}
