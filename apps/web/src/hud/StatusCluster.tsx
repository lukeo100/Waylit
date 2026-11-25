import { MOCK_WEATHER } from "./mock-weather";
import { formatClockTime } from "./time";

interface StatusClusterProps {
  /** The time to show, or undefined before the page has loaded. */
  readonly nowMs: number | undefined;
  readonly online: boolean;
}

/**
 * Top right, above the minimap: one small status chip on a plate of dark glass with the local
 * time, the mock temperature and a small dot for connectivity. Green means online. Amber means offline, and the word is there for
 * assistive technology, so colour is never the only signal.
 */
export function StatusCluster({ nowMs, online }: StatusClusterProps) {
  return (
    <section
      aria-label="Status"
      data-testid="status-cluster"
      className="wl-plate wl-hud-text wl-enter flex min-h-[clamp(1.9rem,8.5dvh,2.4rem)] items-center gap-[clamp(0.5rem,1.1vw,0.8rem)] rounded-pill px-[clamp(0.6rem,1.3vw,0.9rem)] leading-none"
    >
      <p data-testid="local-time" className="text-hud-md font-semibold text-text tabular-nums">
        {formatClockTime(nowMs)}
      </p>
      <p
        data-testid="weather"
        title="Mock weather"
        className="text-hud-md font-medium text-text-secondary tabular-nums"
      >
        {MOCK_WEATHER.temperatureCelsius}&deg;C
        <span className="sr-only">, {MOCK_WEATHER.label}, mock weather</span>
      </p>
      <p
        data-testid="connectivity"
        data-online={online}
        title={online ? "Online" : "Offline"}
        className="flex items-center"
      >
        <span
          aria-hidden="true"
          className={`size-[clamp(0.45rem,1.9dvh,0.6rem)] rounded-full ${online ? "bg-ok" : "bg-caution"}`}
        />
        <span className="sr-only">{online ? "Online" : "Offline"}</span>
      </p>
    </section>
  );
}
