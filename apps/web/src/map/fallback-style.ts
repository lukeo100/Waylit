import type { LightingParameters, ProviderAttribution, ScenePalette } from "@waylit/map-provider";
import type { LightSpecification, SkySpecification, StyleSpecification } from "maplibre-gl";

/**
 * The fallback map style, written for Waylit and drawn from OpenFreeMap's public vector tiles
 * (OpenMapTiles schema, data from OpenStreetMap). It has no labels, no icons and no sprite or
 * font requests: the HUD says where the rider is going, and the scene only needs ground, water,
 * roads and extruded buildings. Colours come from the lighting parameters, so the same style
 * is bright by day, orange at sunset and dark and quiet at night.
 *
 * This file is pure data and has no MapLibre runtime import, so tests can read it.
 */

/** OpenFreeMap's planet TileJSON. No key, no registration. See docs/THIRD_PARTY.md. */
export const OPENFREEMAP_TILEJSON = "https://tiles.openfreemap.org/planet";

/** Mapterhorn open terrain, Terrarium encoded, as TileJSON. No key. See docs/THIRD_PARTY.md. */
export const TERRAIN_TILEJSON = "https://tiles.mapterhorn.com/tilejson.json";

export const VECTOR_SOURCE_ID = "openmaptiles";
export const TERRAIN_SOURCE_ID = "terrain-dem";

/** Credits for the fallback, shown in the credits strip. Wording follows the providers' terms. */
export function fallbackAttributions(terrain: boolean): readonly ProviderAttribution[] {
  const credits: ProviderAttribution[] = [
    { text: "OpenFreeMap", url: "https://openfreemap.org" },
    { text: "© OpenMapTiles", url: "https://openmaptiles.org/" },
    {
      prefix: "Data from",
      text: "© OpenStreetMap contributors",
      url: "https://www.openstreetmap.org/copyright",
    },
  ];
  if (terrain) {
    credits.push({ text: "Terrain: Mapterhorn", url: "https://mapterhorn.com/attribution" });
  }
  return credits;
}

type Paint = Record<string, unknown>;

interface LayerDef {
  readonly id: string;
  readonly type: "fill" | "line" | "fill-extrusion";
  readonly sourceLayer: string;
  readonly filter?: unknown;
  readonly minzoom?: number;
  readonly layout?: Paint;
  /** Paint properties that hold a colour. They change with the light. */
  readonly colours: (palette: ScenePalette) => Record<string, string>;
  /** Paint properties that never change. */
  readonly fixed?: Paint;
}

const ROAD_NOT_TUNNEL = ["!=", ["get", "brunnel"], "tunnel"];

/**
 * A line width that stays a given number of metres wide on the ground as you zoom. The scale
 * is for about 52 degrees north, where a pixel at zoom 12 is about 19 m with 512 pixel tiles,
 * and is close enough elsewhere because the roads only have to look right, not measure right.
 */
function groundWidth(metres: number): unknown {
  const perPixelAtZoom12 = 19.1;
  const widthAtZoom12 = metres / perPixelAtZoom12;
  return ["interpolate", ["exponential", 2], ["zoom"], 12, widthAtZoom12, 22, widthAtZoom12 * 1024];
}

const LAYERS: readonly LayerDef[] = [
  {
    id: "landuse",
    type: "fill",
    sourceLayer: "landuse",
    colours: (p) => ({ "fill-color": p.landuse }),
  },
  {
    id: "landcover",
    type: "fill",
    sourceLayer: "landcover",
    filter: ["in", ["get", "class"], ["literal", ["wood", "grass", "farmland", "scrub"]]],
    colours: (p) => ({ "fill-color": p.park }),
    fixed: { "fill-opacity": 0.6 },
  },
  {
    id: "park",
    type: "fill",
    sourceLayer: "park",
    colours: (p) => ({ "fill-color": p.park }),
  },
  {
    id: "water",
    type: "fill",
    sourceLayer: "water",
    colours: (p) => ({ "fill-color": p.water }),
  },
  {
    id: "waterway",
    type: "line",
    sourceLayer: "waterway",
    colours: (p) => ({ "line-color": p.water }),
    fixed: { "line-width": groundWidth(4) },
  },
  {
    id: "rail",
    type: "line",
    sourceLayer: "transportation",
    filter: ["all", ["==", ["get", "class"], "rail"], ROAD_NOT_TUNNEL],
    minzoom: 12,
    colours: (p) => ({ "line-color": p.rail }),
    fixed: { "line-width": groundWidth(2) },
  },
  {
    id: "road-path",
    type: "line",
    sourceLayer: "transportation",
    filter: [
      "all",
      ["in", ["get", "class"], ["literal", ["path", "track", "pedestrian"]]],
      ROAD_NOT_TUNNEL,
    ],
    minzoom: 14,
    layout: { "line-cap": "round", "line-join": "round" },
    colours: (p) => ({ "line-color": p.path }),
    fixed: { "line-width": groundWidth(1.8) },
  },
  {
    id: "road-minor",
    type: "line",
    sourceLayer: "transportation",
    filter: [
      "all",
      ["in", ["get", "class"], ["literal", ["minor", "service", "tertiary", "busway"]]],
      ROAD_NOT_TUNNEL,
    ],
    minzoom: 12,
    layout: { "line-cap": "round", "line-join": "round" },
    colours: (p) => ({ "line-color": p.roadMinor }),
    fixed: { "line-width": groundWidth(5) },
  },
  {
    id: "road-major",
    type: "line",
    sourceLayer: "transportation",
    filter: [
      "all",
      ["in", ["get", "class"], ["literal", ["primary", "secondary", "trunk", "motorway"]]],
      ROAD_NOT_TUNNEL,
    ],
    layout: { "line-cap": "round", "line-join": "round" },
    colours: (p) => ({ "line-color": p.roadMajor }),
    fixed: { "line-width": groundWidth(9) },
  },
  {
    id: "building",
    type: "fill-extrusion",
    sourceLayer: "building",
    minzoom: 13,
    colours: (p) => ({ "fill-extrusion-color": p.building }),
    fixed: {
      "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
      "fill-extrusion-opacity": 0.96,
    },
  },
];

/** The ids of the layers whose colours change with the light. Exposed for tests. */
export const STYLE_LAYER_IDS: readonly string[] = ["background", ...LAYERS.map((l) => l.id)];

/** Every paint colour that changes with the light, as layer, property and value. */
export function paletteColours(
  palette: ScenePalette,
): readonly { layer: string; property: string; value: string }[] {
  const out = [{ layer: "background", property: "background-color", value: palette.land }];
  for (const def of LAYERS) {
    for (const [property, value] of Object.entries(def.colours(palette))) {
      out.push({ layer: def.id, property, value });
    }
  }
  return out;
}

/** The sky and haze for a lighting state. */
export function skyFor(params: LightingParameters): SkySpecification {
  return {
    "sky-color": params.sky.zenith,
    "horizon-color": params.sky.horizon,
    "fog-color": params.sky.fog,
    "sky-horizon-blend": 0.55,
    "horizon-fog-blend": 0.6,
    "fog-ground-blend": 0.6,
    "atmosphere-blend": 0,
  };
}

/** The light that shades the extruded buildings, from the sun's bearing and height. */
export function lightFor(params: LightingParameters): LightSpecification {
  return {
    anchor: "map",
    position: [...params.lightPosition],
    color: params.lightColor,
    intensity: params.lightIntensity,
  };
}

export interface FallbackStyleOptions {
  /** Add the open terrain source and ground the camera on it. */
  readonly terrain: boolean;
}

/** Builds the style for the first frame, painted for the given lighting. */
export function buildFallbackStyle(
  params: LightingParameters,
  options: FallbackStyleOptions,
): StyleSpecification {
  const layers: unknown[] = [
    {
      id: "background",
      type: "background",
      paint: { "background-color": params.palette.land },
    },
  ];
  for (const def of LAYERS) {
    layers.push({
      id: def.id,
      type: def.type,
      source: VECTOR_SOURCE_ID,
      "source-layer": def.sourceLayer,
      ...(def.filter === undefined ? {} : { filter: def.filter }),
      ...(def.minzoom === undefined ? {} : { minzoom: def.minzoom }),
      ...(def.layout === undefined ? {} : { layout: def.layout }),
      paint: { ...def.colours(params.palette), ...def.fixed },
    });
  }

  const sources: Record<string, unknown> = {
    [VECTOR_SOURCE_ID]: { type: "vector", url: OPENFREEMAP_TILEJSON },
  };
  if (options.terrain) {
    sources[TERRAIN_SOURCE_ID] = {
      type: "raster-dem",
      url: TERRAIN_TILEJSON,
      encoding: "terrarium",
      tileSize: 512,
    };
  }

  const style: Record<string, unknown> = {
    version: 8,
    name: "Waylit fallback",
    sources,
    layers,
    sky: skyFor(params),
    light: lightFor(params),
    ...(options.terrain ? { terrain: { source: TERRAIN_SOURCE_ID, exaggeration: 1 } } : {}),
  };
  return style as unknown as StyleSpecification;
}
