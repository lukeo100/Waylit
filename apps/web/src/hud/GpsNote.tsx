import type { GpsStatus } from "@waylit/core";
import { gpsNoticeFor } from "./gps-notice";

/** A quiet line about the live GPS, on a small plate. Amber for anything that needs attention. */
export function GpsNote({ status }: { readonly status: GpsStatus | undefined }) {
  const notice = gpsNoticeFor(status);
  if (!notice) return null;
  return (
    <p
      role="status"
      data-testid="gps-note"
      data-status={status}
      className={`wl-plate wl-hud-text max-w-[min(34rem,70vw)] rounded-md px-3 py-1.5 text-center text-hud-sm leading-snug ${
        notice.tone === "caution" ? "text-caution" : "text-text-secondary"
      }`}
    >
      {notice.text}
    </p>
  );
}
