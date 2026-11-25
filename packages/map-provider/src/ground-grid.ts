import { fromLocalMetres, toLocalMetres, type LatLng } from "@waylit/core";

/**
 * A faint grid on the ground around the rider, for the MapLibre fallback (Google mode gets its
 * grid from the screen space shader instead). The lines are fixed to the world: they sit on
 * multiples of the spacing east and north of a reference point, so they stay still while the
 * rider moves over them. The grid is rebuilt only when the rider crosses into a new cell.
 */

export interface GroundGridOptions {
  /** Distance between lines in metres. */
  readonly spacingMetres?: number;
  /** How far the grid reaches from the rider in each direction, in metres. */
  readonly reachMetres?: number;
}

export interface GroundGrid {
  /** Changes only when the lines change, so callers can skip identical updates. */
  readonly key: string;
  /** Each line is two points. */
  readonly lines: readonly (readonly [LatLng, LatLng])[];
}

export function groundGrid(
  reference: LatLng,
  centre: LatLng,
  options: GroundGridOptions = {},
): GroundGrid {
  const spacing = options.spacingMetres ?? 16;
  const reach = options.reachMetres ?? 128;
  const local = toLocalMetres(reference, centre);
  const cellEast = Math.round(local.east / spacing);
  const cellNorth = Math.round(local.north / spacing);
  const count = Math.floor(reach / spacing);
  const west = (cellEast - count) * spacing;
  const eastEdge = (cellEast + count) * spacing;
  const south = (cellNorth - count) * spacing;
  const northEdge = (cellNorth + count) * spacing;
  const lines: (readonly [LatLng, LatLng])[] = [];
  for (let i = -count; i <= count; i++) {
    const east = (cellEast + i) * spacing;
    lines.push([
      fromLocalMetres(reference, { east, north: south }),
      fromLocalMetres(reference, { east, north: northEdge }),
    ]);
    const north = (cellNorth + i) * spacing;
    lines.push([
      fromLocalMetres(reference, { east: west, north }),
      fromLocalMetres(reference, { east: eastEdge, north }),
    ]);
  }
  return { key: `${String(cellEast)},${String(cellNorth)}`, lines };
}
