import { lightingParameters, type SceneLighting } from "@waylit/map-provider";
import { describe, expect, it } from "vitest";
import {
  OPENFREEMAP_TILEJSON,
  STYLE_LAYER_IDS,
  TERRAIN_SOURCE_ID,
  buildFallbackStyle,
  fallbackAttributions,
  lightFor,
  paletteColours,
  skyFor,
} from "./fallback-style";

const lighting = (daylightFactor: number, warmth = 0): SceneLighting => ({
  timestamp: 0,
  position: { lat: 52.47, lng: 13.4 },
  sunElevationDegrees: daylightFactor > 0.5 ? 40 : -40,
  sunAzimuthDegrees: 200,
  phase: daylightFactor > 0.5 ? "day" : "night",
  daylightFactor,
  warmth,
});

const DAY = lightingParameters(lighting(1));
const NIGHT = lightingParameters(lighting(0));

describe("buildFallbackStyle", () => {
  const style = buildFallbackStyle(DAY, { terrain: true }) as unknown as {
    version: number;
    sources: Record<string, { type: string; url?: string; encoding?: string }>;
    layers: { id: string; type: string; source?: string; paint: Record<string, unknown> }[];
    terrain?: { source: string };
    sky: Record<string, unknown>;
    light: Record<string, unknown>;
    glyphs?: string;
    sprite?: string;
  };

  it("is a version 8 style that draws only from OpenFreeMap and the open terrain", () => {
    expect(style.version).toBe(8);
    expect(style.sources.openmaptiles).toEqual({ type: "vector", url: OPENFREEMAP_TILEJSON });
    expect(style.sources[TERRAIN_SOURCE_ID]?.type).toBe("raster-dem");
    expect(style.sources[TERRAIN_SOURCE_ID]?.encoding).toBe("terrarium");
    expect(Object.keys(style.sources).sort()).toEqual(["openmaptiles", TERRAIN_SOURCE_ID].sort());
  });

  it("uses https for every address, with no keys in them", () => {
    const text = JSON.stringify(style);
    for (const url of text.match(/https?:\/\/[^"]+/g) ?? []) {
      expect(url.startsWith("https://")).toBe(true);
      expect(url).not.toMatch(/key=|token=|apikey/i);
    }
  });

  it("asks for no fonts or sprites, because it draws no labels or icons", () => {
    expect(style.glyphs).toBeUndefined();
    expect(style.sprite).toBeUndefined();
    expect(style.layers.some((layer) => layer.type === "symbol")).toBe(false);
  });

  it("extrudes buildings and has terrain, sky and light", () => {
    expect(style.layers.find((layer) => layer.id === "building")?.type).toBe("fill-extrusion");
    expect(style.terrain?.source).toBe(TERRAIN_SOURCE_ID);
    expect(style.sky["sky-color"]).toBe(DAY.sky.zenith);
    expect(style.light.anchor).toBe("map");
  });

  it("leaves the terrain out when asked", () => {
    const flat = buildFallbackStyle(DAY, { terrain: false }) as unknown as {
      sources: Record<string, unknown>;
      terrain?: unknown;
    };
    expect(flat.terrain).toBeUndefined();
    expect(Object.keys(flat.sources)).toEqual(["openmaptiles"]);
  });

  it("has unique layer ids that match the exported list", () => {
    const ids = style.layers.map((layer) => layer.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...STYLE_LAYER_IDS]);
  });

  it("has a night version that is darker than the day version", () => {
    const night = buildFallbackStyle(NIGHT, { terrain: false }) as unknown as typeof style;
    const colour = (s: typeof style, id: string, prop: string) =>
      style === s ? s.layers.find((l) => l.id === id)?.paint[prop] : undefined;
    expect(colour(style, "background", "background-color")).toBe(DAY.palette.land);
    expect(night.layers[0]?.paint["background-color"]).toBe(NIGHT.palette.land);
    expect(NIGHT.palette.land).not.toBe(DAY.palette.land);
  });
});

describe("paletteColours", () => {
  it("names a real layer for every colour, so a later paint update cannot miss", () => {
    for (const change of paletteColours(NIGHT.palette)) {
      expect(STYLE_LAYER_IDS).toContain(change.layer);
      expect(change.value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("changes with the lighting", () => {
    const day = paletteColours(DAY.palette).map((c) => c.value);
    const night = paletteColours(NIGHT.palette).map((c) => c.value);
    expect(day).not.toEqual(night);
  });
});

describe("sky and light", () => {
  it("take their colours and angles from the lighting parameters", () => {
    const sky = skyFor(NIGHT);
    expect(sky["sky-color"]).toBe(NIGHT.sky.zenith);
    expect(sky["horizon-color"]).toBe(NIGHT.sky.horizon);
    const light = lightFor(DAY);
    expect(light.position).toEqual([...DAY.lightPosition]);
    expect(light.intensity).toBe(DAY.lightIntensity);
  });
});

describe("fallbackAttributions", () => {
  it("credits OpenFreeMap, OpenMapTiles and OpenStreetMap contributors with links", () => {
    const credits = fallbackAttributions(false);
    const text = credits.map((c) => `${c.prefix ?? ""} ${c.text}`).join(" ");
    expect(text).toContain("OpenFreeMap");
    expect(text).toContain("© OpenMapTiles");
    expect(text).toContain("© OpenStreetMap contributors");
    const osm = credits.find((c) => c.text.includes("OpenStreetMap"));
    expect(osm?.url).toBe("https://www.openstreetmap.org/copyright");
    expect(credits.every((c) => c.url?.startsWith("https://"))).toBe(true);
  });

  it("credits the terrain only when it is used", () => {
    expect(fallbackAttributions(false).some((c) => c.text.includes("Mapterhorn"))).toBe(false);
    expect(fallbackAttributions(true).some((c) => c.text.includes("Mapterhorn"))).toBe(true);
  });
});
