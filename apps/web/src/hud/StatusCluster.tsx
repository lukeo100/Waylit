import { MOCK_WEATHER } from "./mock-weather";
import { formatClockTime } from "./time";

interface StatusClusterProps {
  /** The time to show, or undefined before the page has loaded. */
  readonly nowMs: number | undefined;
  readonly online: boolean;
}

/**
 * Top right, above the minimap: local time and mock temperature as plain text, and a small dot
 * for connectivity. Green means online. Amber means offline, and the word is there for
 * assistive technology, so colour is never the only signal.
 */
export function StatusCluster({ nowMs, online }: StatusClusterProps) {
  return (
    <section
      aria-label="Status"
      data-testid="status-cluster"
      className="flex items-center gap-[clamp(0.5rem,1.2vw,0.9rem)] leading-none"
    >
      <p data-testid="local-time" className="text-hud-lg font-medium text-text tabular-nums">
        {formatClockTime(nowMs)}
      </p>
      <p
        data-testid="weather"
        title="Mock weather"
        className="text-hud-lg font-medium text-text-secondary tabular-nums"
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
          className={`size-[clamp(0.5rem,2.2dvh,0.7rem)] rounded-full ${online ? "bg-ok" : "bg-caution"}`}
        />
        <span className="sr-only">{online ? "Online" : "Offline"}</span>
      </p>
    </section>
  );
}
