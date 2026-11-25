import { lightingParameters, type SceneLighting } from "@waylit/map-provider";
import { describe, expect, it } from "vitest";
import { buildFallbackStyle, layersFor, paletteColours, styleLayerIds } from "./fallback-style";
import {
  FLOOR_LINE_METRES,
  FLOOR_METRES,
  ROOF_EDGE_METRES,
  edgeColour,
  glassColour,
  holoBuildingLayers,
} from "./holo-style";

const night: SceneLighting = {
  timestamp: 0,
  position: { lat: 52.47, lng: 13.4 },
  sunElevationDegrees: -40,
  sunAzimuthDegrees: 0,
  phase: "night",
  daylightFactor: 0,
  warmth: 0,
};
const params = lightingParameters(night);

interface StyleLayer {
  id: string;
  type: string;
  source?: string;
  "source-layer"?: string;
  paint: Record<string, unknown>;
}
const styleOf = (holo: "off" | "low" | "high") =>
  buildFallbackStyle(params, { terrain: true, holo }) as unknown as { layers: StyleLayer[] };

describe("holographic buildings", () => {
  it("keep the plain look at off, with the single building layer", () => {
    const ids = styleOf("off").layers.map((l) => l.id);
    expect(ids).toContain("building");
    expect(ids).not.toContain("building-roof");
    expect(ids).not.toContain("building-outline");
  });

  it("have glass, a roof edge and an outline at low", () => {
    const ids = styleOf("low").layers.map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining(["building", "building-roof", "building-outline"]));
    expect(ids).not.toContain("building-floor-1");
    expect(ids).not.toContain("building-outline-glow");
  });

  it("add floor lines and a glow at high", () => {
    const ids = styleOf("high").layers.map((l) => l.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "building",
        "building-floor-1",
        "building-glass-1",
        "building-floor-2",
        "building-glass-2",
        "building-roof",
        "building-outline-glow",
        "building-outline",
      ]),
    );
  });

  it("have unique layer ids that match the exported list for each level", () => {
    for (const level of ["off", "low", "high"] as const) {
      const ids = styleOf(level).layers.map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual([...styleLayerIds(level)]);
    }
  });

  it("slice the height into bands that never overlap, so nothing fights for pixels", () => {
    const bands = holoBuildingLayers("high")
      .filter((l) => l.type === "fill-extrusion" && l.id !== "building-roof")
      .map((l) => {
        const filter = l.filter as unknown[];
        const upper = (filter[2] as unknown[])[2] as number;
        const lower = (filter[1] as unknown[])[2] as number;
        return { id: l.id, from: lower - 0.05, to: upper + 0.05 };
      })
      .sort((a, b) => a.from - b.from);
    expect(bands.length).toBe(5);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i]!.from).toBeCloseTo(bands[i - 1]!.to, 6);
    }
    // The floor lines are the thin ones and sit nine metres apart.
    const lines = bands.filter((b) => b.id.includes("floor"));
    expect(lines).toHaveLength(2);
    expect(lines[1]!.from - lines[0]!.from).toBeCloseTo(FLOOR_METRES, 6);
    for (const line of lines) expect(line.to - line.from).toBeCloseTo(FLOOR_LINE_METRES, 6);
  });

  it("extrude every body only up to the roof edge, which is its own bright band", () => {
    const roof = holoBuildingLayers("low").find((l) => l.id === "building-roof")!;
    const fixed = roof.fixed as Record<string, unknown>;
    expect(JSON.stringify(fixed["fill-extrusion-base"])).toContain(String(ROOF_EDGE_METRES));
    const body = holoBuildingLayers("low").find((l) => l.id === "building")!;
    expect(
      JSON.stringify((body.fixed as Record<string, unknown>)["fill-extrusion-height"]),
    ).toContain(String(ROOF_EDGE_METRES));
  });

  it("use dark glass and a cyan edge, with edges lighter than glass", () => {
    const glass = glassColour(params.palette);
    const edge = edgeColour(params.palette);
    expect(glass).toMatch(/^#[0-9a-f]{6}$/);
    expect(edge).toMatch(/^#[0-9a-f]{6}$/);
    const luma = (hex: string) =>
      parseInt(hex.slice(1, 3), 16) * 0.2126 +
      parseInt(hex.slice(3, 5), 16) * 0.7152 +
      parseInt(hex.slice(5, 7), 16) * 0.0722;
    expect(luma(edge)).toBeGreaterThan(luma(glass) * 2);
    // The edge leans cyan: more blue and green than red.
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(edge.slice(i, i + 2), 16)) as [
      number,
      number,
      number,
    ];
    expect(g).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(r);
  });

  it("have a colour update for every layer they add", () => {
    const names = new Set(styleLayerIds("high"));
    for (const change of paletteColours(params.palette, "high")) {
      expect(names.has(change.layer)).toBe(true);
    }
    const coloured = new Set(paletteColours(params.palette, "high").map((c) => c.layer));
    for (const layer of layersFor("high")) expect(coloured.has(layer.id)).toBe(true);
  });

  it("draw only OpenFreeMap data from the building layer, with no labels or icons", () => {
    for (const layer of styleOf("high").layers) {
      expect(layer.type).not.toBe("symbol");
      if (layer.id.startsWith("building")) {
        expect(layer.source).toBe("openmaptiles");
        expect(layer["source-layer"]).toBe("building");
      }
    }
  });
});
