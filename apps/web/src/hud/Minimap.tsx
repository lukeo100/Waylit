import { useMemo } from "react";
import { createRouteIndex, type LatLng, type Route } from "@waylit/core";
import {
  HEADING_CONE,
  MINIMAP_VIEW,
  createMinimapRoute,
  followTransform,
  headingConePath,
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
 * A small round minimap, drawn as plain SVG: the route line, a position dot and a heading cone.
 * There are no map tiles and no map data here, only the route's own coordinates, so nothing
 * on it needs a map provider credit. While riding it follows the rider with the heading up.
 * On the start and summary screens it shows the whole route, north up.
 */
export function Minimap({ route, alongMetres, position, heading, nextTurnAt }: MinimapProps) {
  const minimap = useMemo(() => {
    const index = createRouteIndex(route.path);
    return createMinimapRoute(route.path, index.cumulativeMetres);
  }, [route]);
  const { width, height, riderX, riderY, radius } = MINIMAP_VIEW;

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
  // North is opposite to the heading, so the letter N sits on the rim in that direction.
  const radians = ((heading ?? 0) * Math.PI) / 180;

  return (
    <div
      data-testid="minimap"
      className="wl-glass relative aspect-square size-[clamp(3.75rem,min(9vw,23dvh),7.5rem)] shrink-0 overflow-hidden rounded-full"
      role="img"
      aria-label={following ? "Minimap, route ahead" : "Minimap, whole route"}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          {/* Strong at the rider and fading out along the cone. A flat gradient, not a glow. */}
          <linearGradient
            id="wl-minimap-cone"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="0"
            y2={-HEADING_CONE.length}
          >
            <stop offset="0" stopColor="var(--wl-color-cyan)" stopOpacity="0.8" />
            <stop offset="1" stopColor="var(--wl-color-cyan)" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {following ? (
          <path
            data-testid="heading-cone"
            d={headingConePath()}
            transform={`translate(${riderX} ${riderY})`}
            fill="url(#wl-minimap-cone)"
            stroke="var(--wl-color-cyan)"
            strokeOpacity="0.7"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
        ) : null}

        <g transform={view.transform}>
          <polyline
            points={pointsAttribute(passed)}
            fill="none"
            stroke="var(--wl-color-text-muted)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity="0.7"
          />
          <polyline
            points={pointsAttribute(ahead)}
            fill="none"
            stroke="var(--wl-color-cyan)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {turn ? (
            <circle
              cx={turn.x}
              cy={turn.y}
              r={4 * unit}
              fill="var(--wl-color-night-950)"
              stroke="var(--wl-color-text)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {!following && start ? (
            <circle cx={start.x} cy={start.y} r={4 * unit} fill="var(--wl-color-text)" />
          ) : null}
        </g>

        {following ? (
          <>
            <circle
              data-testid="rider-dot"
              cx={riderX}
              cy={riderY}
              r="5"
              fill="var(--wl-color-cyan)"
              stroke="var(--wl-color-night-950)"
              strokeWidth="1.8"
            />
            <text
              data-testid="compass"
              x={(radius - 39 * Math.sin(radians)).toFixed(1)}
              y={(radius - 39 * Math.cos(radians) + 3.5).toFixed(1)}
              textAnchor="middle"
              fontSize="10"
              fontWeight="600"
              fill="var(--wl-color-text-secondary)"
            >
              N
            </text>
          </>
        ) : null}
      </svg>
    </div>
  );
}
