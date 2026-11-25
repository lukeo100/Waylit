import type { ReactNode } from "react";
import type { Manoeuvre } from "@waylit/core";

/**
 * Original line icons for the HUD, drawn for Waylit. They use `currentColor`, so the colour is
 * set by the text colour around them, and they are hidden from assistive technology because
 * every icon sits next to text or a label.
 */

interface IconProps {
  readonly size?: number | string;
  readonly className?: string;
}

function Icon({
  size = 24,
  className,
  children,
  filled = false,
}: IconProps & { readonly children: ReactNode; readonly filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Icon for the next manoeuvre. */
export function ManoeuvreIcon({ manoeuvre, ...props }: IconProps & { manoeuvre: Manoeuvre }) {
  switch (manoeuvre) {
    case "turn-left":
      return (
        <Icon {...props}>
          <path d="M17 21v-6a5 5 0 0 0-5-5H6" />
          <path d="M10 5.5 5.5 10l4.5 4.5" />
        </Icon>
      );
    case "turn-right":
      return (
        <Icon {...props}>
          <path d="M7 21v-6a5 5 0 0 1 5-5h6" />
          <path d="M14 5.5l4.5 4.5-4.5 4.5" />
        </Icon>
      );
    case "slight-left":
      return (
        <Icon {...props}>
          <path d="M15 21v-6.5L8.5 7" />
          <path d="M8.5 13V7H14" />
        </Icon>
      );
    case "slight-right":
      return (
        <Icon {...props}>
          <path d="M9 21v-6.5L15.5 7" />
          <path d="M15.5 13V7H10" />
        </Icon>
      );
    case "u-turn":
      return (
        <Icon {...props}>
          <path d="M8 21V10a4 4 0 0 1 8 0v5" />
          <path d="M12.5 12l3.5 3.5 3.5-3.5" />
        </Icon>
      );
    case "roundabout":
      return (
        <Icon {...props}>
          <circle cx="12" cy="15" r="4" />
          <path d="M12 11V4" />
          <path d="M8.5 7.5 12 4l3.5 3.5" />
        </Icon>
      );
    case "arrive":
      return (
        <Icon {...props}>
          <path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z" />
          <circle cx="12" cy="11" r="2" />
        </Icon>
      );
    case "depart":
    case "continue":
      return (
        <Icon {...props}>
          <path d="M12 21V5" />
          <path d="M6 11l6-6 6 6" />
        </Icon>
      );
  }
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props} filled>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
    </Icon>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props} filled>
      <rect x="6" y="5" width="4.5" height="14" rx="1.2" />
      <rect x="13.5" y="5" width="4.5" height="14" rx="1.2" />
    </Icon>
  );
}

export function PreviousIcon(props: IconProps) {
  return (
    <Icon {...props} filled>
      <rect x="5" y="5" width="3" height="14" rx="1" />
      <path d="M19 6.2v11.6a.9.9 0 0 1-1.4.76l-8.2-5.8a.9.9 0 0 1 0-1.52l8.2-5.8A.9.9 0 0 1 19 6.2z" />
    </Icon>
  );
}

export function NextIcon(props: IconProps) {
  return (
    <Icon {...props} filled>
      <rect x="16" y="5" width="3" height="14" rx="1" />
      <path d="M5 6.2v11.6a.9.9 0 0 0 1.4.76l8.2-5.8a.9.9 0 0 0 0-1.52L6.4 5.44A.9.9 0 0 0 5 6.2z" />
    </Icon>
  );
}

/** Sun with a cloud, for the mock weather chip. */
export function WeatherIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="9" r="3" />
      <path d="M9 3v1.2M3 9h1.2M4.8 4.8l.9.9M13.2 4.8l-.9.9" />
      <path d="M8 19.5h9a3.5 3.5 0 0 0 .4-6.97A5 5 0 0 0 8 14a2.8 2.8 0 0 0 0 5.5z" />
    </Icon>
  );
}

export function OnlineIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 9.5a13 13 0 0 1 18 0" />
      <path d="M6.2 13a8.5 8.5 0 0 1 11.6 0" />
      <path d="M9.4 16.4a4 4 0 0 1 5.2 0" />
      <circle cx="12" cy="19.5" r=".8" />
    </Icon>
  );
}

export function OfflineIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 9.5a13 13 0 0 1 4-2.6M21 9.5a13 13 0 0 0-6.5-3.3" />
      <path d="M9.4 16.4a4 4 0 0 1 5.2 0" />
      <circle cx="12" cy="19.5" r=".8" />
      <path d="M4 4l16 16" />
    </Icon>
  );
}

/**
 * Battery with a level bar. `percent` is 0 to 100, or undefined when there is no reading, which
 * draws an empty outline. It is drawn in two parts so the level can use its own colour.
 */
export function BatteryIcon({
  percent,
  low = false,
  size = 24,
  className,
}: IconProps & { readonly percent: number | undefined; readonly low?: boolean }) {
  const level = percent === undefined ? 0 : Math.min(Math.max(percent, 0), 100);
  const barWidth = (level / 100) * 13;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect
        x="2"
        y="7"
        width="17"
        height="10"
        rx="2.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M21.2 10.4v3.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {barWidth > 0 ? (
        <rect
          data-testid="battery-bar"
          x="4"
          y="9"
          width={barWidth}
          height="6"
          rx="1.2"
          fill={low ? "var(--wl-color-caution)" : "var(--wl-color-text)"}
        />
      ) : null}
    </svg>
  );
}

/** Stacked layers, for the map settings. */
export function LayersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 12.5 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}
