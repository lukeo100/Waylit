import { useMemo } from "react";
import { createRouteIndex, type LatLng, type Route } from "@waylit/core";
import {
  MINIMAP_VIEW,
  createMinimapRoute,
  followTransform,
  overviewTransform,
  pointsAttribute,
  splitRoute,
  toLocal,
} from "./minimap-geometry";

interface MinimapProps {
  readonly route: Route;
  /** Distance travelled along the route, in metres. */
  readonly alongMetres: number;
  /** Latest GPS position and heading. Without them the whole route is shown, north up. */
  readonly position?: LatLng | undefined;
  readonly heading?: number | undefined;
  /** Where the next instruction happens, drawn as a ring on the route. */
  readonly nextTurnAt?: LatLng | undefined;
}

/**
 * A small 2D minimap, drawn as plain SVG: the route line, a position dot and the heading.
 * There are no map tiles and no map data here, only the route's own coordinates, so nothing
 * on it needs a map provider credit. While riding it follows the rider with the heading up.
 * On the start and summary screens it shows the whole route, north up.
 */
export function Minimap({ route, alongMetres, position, heading, nextTurnAt }: MinimapProps) {
  const minimap = useMemo(() => {
    const index = createRouteIndex(route.path);
    return createMinimapRoute(route.path, index.cumulativeMetres);
  }, [route]);
  const { width, height, riderX, riderY } = MINIMAP_VIEW;

  const following = position !== undefined && heading !== undefined;
  const { passed, ahead } = splitRoute(minimap, following ? alongMetres : 0);
  const view = following
    ? {
        transform: followTransform(toLocal(minimap.origin, position), heading),
        scale: MINIMAP_VIEW.unitsPerMetre,
      }
    : overviewTransform(minimap);
  const start = minimap.points[0];
  const turn = nextTurnAt ? toLocal(minimap.origin, nextTurnAt) : undefined;
  // Marker sizes are in screen units, so they are divided by the scale inside the group.
  const unit = 1 / view.scale;

  return (
    <div
      data-testid="minimap"
      className="wl-glass relative h-full w-full overflow-hidden"
      role="img"
      aria-label={following ? "Minimap, route ahead" : "Minimap, whole route"}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <g transform={view.transform}>
          <polyline
            points={pointsAttribute(passed)}
            fill="none"
            stroke="var(--wl-color-text-muted)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity="0.7"
          />
          <polyline
            points={pointsAttribute(ahead)}
            fill="none"
            stroke="var(--wl-color-volt)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {turn ? (
            <circle
              cx={turn.x}
              cy={turn.y}
              r={5 * unit}
              fill="var(--wl-color-night-950)"
              stroke="var(--wl-color-cyan-soft)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {!following && start ? (
            <circle cx={start.x} cy={start.y} r={4.5 * unit} fill="var(--wl-color-cyan)" />
          ) : null}
        </g>

        {following ? (
          <>
            <g transform={`translate(${riderX} ${riderY})`}>
              <path d="M0 -13 L7 3 L0 -1 L-7 3 Z" fill="var(--wl-color-cyan)" opacity="0.35" />
              <circle
                r="5"
                fill="var(--wl-color-cyan)"
                stroke="var(--wl-color-night-950)"
                strokeWidth="2"
              />
            </g>
          </>
        ) : null}
      </svg>
      {following ? <CompassNorth heading={heading} /> : null}
    </div>
  );
}

/**
 * A small arrow that points to north, with the letter N kept upright beside its tip. The map
 * turns with the rider, so north moves around as the heading changes. It is plain HTML laid
 * over the map corner, so it never gets cropped when the map box changes shape.
 */
function CompassNorth({ heading }: { readonly heading: number }) {
  const radians = (heading * Math.PI) / 180;
  // North sits opposite to the heading, 17 pixels from the centre of the compass.
  const labelX = -17 * Math.sin(radians);
  const labelY = -17 * Math.cos(radians);
  return (
    <div
      aria-hidden="true"
      data-testid="compass"
      className="pointer-events-none absolute top-2 left-2 size-10 text-text"
    >
      <svg
        viewBox="-20 -20 40 40"
        className="size-full"
        style={{ transform: `rotate(${-heading}deg)` }}
      >
        <path d="M0 -11 L6 8 L0 4 L-6 8 Z" fill="currentColor" />
      </svg>
      <span
        className="absolute top-1/2 left-1/2 text-xs leading-none font-bold text-text-secondary"
        style={{
          transform: `translate(calc(-50% + ${labelX.toFixed(1)}px), calc(-50% + ${labelY.toFixed(1)}px))`,
        }}
      >
        N
      </span>
    </div>
  );
}
