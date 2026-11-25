import {
  HOLO_CYAN_BRIGHT,
  HOLO_GLASS,
  mixHex,
  type FxLevel,
  type ScenePalette,
} from "@waylit/map-provider";
import type { LayerDef } from "./fallback-style";

/**
 * The holographic buildings of the MapLibre fallback, as style data: dark glass bodies, a bright
 * roof edge, faint floor lines and a glowing outline on the ground. It is plain data with no
 * MapLibre runtime import, so tests can read it. The fallback shows OpenFreeMap data, which is
 * not Google content, so none of the Google restrictions apply to how it is drawn.
 *
 * Extrusions cannot be outlined, so the look is built from slices. Each slice is its own
 * extrusion layer for one band of height, and the bands never overlap, so nothing fights for
 * the same pixels:
 *
 *   glass 0  from the ground to 8.86 m
 *   line 1   8.86 to 9.14 m          (a floor line, high only)
 *   glass 1  9.14 to 17.86 m
 *   line 2   17.86 to 18.14 m        (a floor line, high only)
 *   glass 2  18.14 m to the roof
 *   roof     the top 0.4 m, bright
 *
 * Buildings that are shorter than a band simply have no slice there (the filters say so).
 */

type Expression = readonly unknown[];

const HEIGHT: Expression = ["coalesce", ["get", "render_height"], 6];
const BASE: Expression = ["coalesce", ["get", "render_min_height"], 0];

/** Thickness of the bright roof edge, in metres. */
export const ROOF_EDGE_METRES = 0.4;
/** Height of the first floor line, and the spacing of the next. */
export const FLOOR_METRES = 9;
/** Thickness of a floor line in metres. */
export const FLOOR_LINE_METRES = 0.28;

const roofLevel: Expression = ["-", HEIGHT, ROOF_EDGE_METRES];

/** The dark glass colour for a palette. */
export function glassColour(palette: ScenePalette): string {
  return mixHex(palette.building, HOLO_GLASS, 0.62);
}

/** The bright edge colour for a palette: the glass pulled most of the way to cyan. */
export function edgeColour(palette: ScenePalette): string {
  return mixHex(glassColour(palette), HOLO_CYAN_BRIGHT, 0.88);
}

interface Slice {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly line: boolean;
}

function sliceLayer(slice: Slice): LayerDef {
  const { from, to, line } = slice;
  const top: Expression = to >= 1000 ? roofLevel : ["min", roofLevel, to];
  return {
    id: slice.id,
    type: "fill-extrusion",
    sourceLayer: "building",
    minzoom: 13,
    // The building must reach into the slice, and its own base must be below the slice's top.
    filter: ["all", [">", roofLevel, from + 0.05], ["<", BASE, to - 0.05]],
    colours: (palette) => ({
      "fill-extrusion-color": line ? edgeColour(palette) : glassColour(palette),
    }),
    fixed: {
      "fill-extrusion-base": ["max", BASE, from],
      "fill-extrusion-height": top,
      "fill-extrusion-opacity": line ? 0.7 : 0.8,
      "fill-extrusion-vertical-gradient": !line,
    },
  };
}

/** The layers that replace the plain `building` layer. */
export function holoBuildingLayers(level: Exclude<FxLevel, "off">): LayerDef[] {
  const floors = level === "high";
  const first = FLOOR_METRES - FLOOR_LINE_METRES / 2;
  const second = 2 * FLOOR_METRES - FLOOR_LINE_METRES / 2;
  const slices: Slice[] = floors
    ? [
        { id: "building", from: -1, to: first, line: false },
        { id: "building-floor-1", from: first, to: first + FLOOR_LINE_METRES, line: true },
        { id: "building-glass-1", from: first + FLOOR_LINE_METRES, to: second, line: false },
        { id: "building-floor-2", from: second, to: second + FLOOR_LINE_METRES, line: true },
        { id: "building-glass-2", from: second + FLOOR_LINE_METRES, to: 1000, line: false },
      ]
    : [{ id: "building", from: -1, to: 1000, line: false }];
  const layers: LayerDef[] = slices.map(sliceLayer);

  layers.push({
    id: "building-roof",
    type: "fill-extrusion",
    sourceLayer: "building",
    minzoom: 13,
    colours: (palette) => ({ "fill-extrusion-color": edgeColour(palette) }),
    fixed: {
      "fill-extrusion-base": ["max", BASE, roofLevel],
      "fill-extrusion-height": HEIGHT,
      "fill-extrusion-opacity": 0.85,
      "fill-extrusion-vertical-gradient": false,
    },
  });

  // Footprint outline: a soft wide line under a thin bright one.
  if (level === "high") {
    layers.push({
      id: "building-outline-glow",
      type: "line",
      sourceLayer: "building",
      minzoom: 14,
      layout: { "line-join": "round" },
      colours: (palette) => ({ "line-color": edgeColour(palette) }),
      fixed: { "line-width": 5, "line-blur": 4, "line-opacity": 0.24 },
    });
  }
  layers.push({
    id: "building-outline",
    type: "line",
    sourceLayer: "building",
    minzoom: 14,
    layout: { "line-join": "round" },
    colours: (palette) => ({ "line-color": edgeColour(palette) }),
    fixed: { "line-width": 1.1, "line-opacity": 0.85 },
  });
  return layers;
}
