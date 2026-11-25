/** Time of day for the HUD in the rider's own time zone, as 24 hour time such as "14:35". */
export function formatClockTime(timestampMs: number | undefined): string {
  if (timestampMs === undefined || !Number.isFinite(timestampMs)) return "--:--";
  return new Date(timestampMs).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/** Local hour at which the HUD treats the day as starting, and as ending. */
const DAY_STARTS_HOUR = 7;
const DAY_ENDS_HOUR = 19;

/**
 * True in daylight, going by the rider's local clock: 07:00 up to 19:00. The riding screen
 * makes its panels more solid in daylight so they stay readable in the sun, and a little more
 * see-through at night. This is a simple stand in. A later phase can use real sunrise and
 * sunset for the position. Before the page has loaded there is no time, and the HUD assumes
 * night so the first frame is the darker, quieter one.
 */
export function isDaylight(timestampMs: number | undefined): boolean {
  if (timestampMs === undefined || !Number.isFinite(timestampMs)) return false;
  const hour = new Date(timestampMs).getHours();
  return hour >= DAY_STARTS_HOUR && hour < DAY_ENDS_HOUR;
}
