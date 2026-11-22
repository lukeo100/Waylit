import { MOCK_WEATHER } from "./mock-weather";
import { OfflineIcon, OnlineIcon, WeatherIcon } from "./icons";
import { formatClockTime } from "./time";

interface StatusClusterProps {
  /** The time to show, or undefined before the page has loaded. */
  readonly nowMs: number | undefined;
  readonly online: boolean;
}

/** Top right, above the minimap: local time, mock weather and whether the device is online. */
export function StatusCluster({ nowMs, online }: StatusClusterProps) {
  return (
    <section
      aria-label="Status"
      data-testid="status-cluster"
      className="wl-glass flex items-center justify-between gap-2 px-3 py-1.5 tight:py-1"
    >
      <p
        data-testid="local-time"
        className="text-xl leading-tight font-semibold text-text tabular-nums short:text-lg"
      >
        {formatClockTime(nowMs)}
      </p>
      <p
        data-testid="weather"
        title="Mock weather"
        className="flex items-center gap-1 text-sm font-medium text-text-secondary"
      >
        <span className="text-volt-soft">
          <WeatherIcon size={22} />
        </span>
        <span className="tabular-nums">{MOCK_WEATHER.temperatureCelsius}&deg;C</span>
        <span className="sr-only">{MOCK_WEATHER.label}, mock weather</span>
      </p>
      <p
        data-testid="connectivity"
        data-online={online}
        className={`flex items-center gap-1 text-sm font-medium ${online ? "text-ok" : "text-caution"}`}
      >
        {online ? <OnlineIcon size={22} /> : <OfflineIcon size={22} />}
        <span>{online ? "Online" : "Offline"}</span>
      </p>
    </section>
  );
}
