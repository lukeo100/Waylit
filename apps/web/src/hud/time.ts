/** Time of day for the HUD in the rider's own time zone, as 24 hour time such as "14:35". */
export function formatClockTime(timestampMs: number | undefined): string {
  if (timestampMs === undefined || !Number.isFinite(timestampMs)) return "--:--";
  return new Date(timestampMs).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}
