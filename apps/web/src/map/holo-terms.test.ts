import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards for the Google Photorealistic 3D Tiles rules (Amendment 3, docs/ARCHITECTURE.md). The
 * files that run in Google mode must never read heights, depth or geometry back from the tiles.
 * Comments are removed before matching, because the files explain what they avoid.
 */

const dir = new URL(".", import.meta.url).pathname;

function code(file: string): string {
  const source = readFileSync(join(dir, file), "utf8");
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const GOOGLE_MODE_FILES = [
  "cesium-google.ts",
  "cesium-holo.ts",
  "fx-stage.ts",
  "fx-shader.ts",
  "tile-shader.ts",
  "holo-glsl.ts",
  "beacon-label.ts",
];

const FORBIDDEN = [
  "sampleHeight",
  "sampleTerrain",
  "clampToHeight",
  "clampToGround",
  "getHeight",
  "pickPosition",
  "drillPick",
  "scene.pick(",
  "pickFromRay",
  "globe.getHeight",
  "readPixels",
  "depthTexture",
  "queryTerrainElevation",
  "queryRenderedFeatures",
  "useDepthPicking = true",
  "createWorldTerrain",
  "GroundPrimitive",
  "GroundPolylinePrimitive",
  "czm_globeDepthTexture",
  "czm_readDepth",
  "tileVisible",
];

/** A call to any `.pick(` method, whatever the object is called. */
const PICK_CALL = /\.pick\(/;

/**
 * Tile events hand over the tile and its content. The new files never subscribe to them. The one
 * existing subscriber (cesium-google.ts, a loaded tile counter for the error fallback) must keep a
 * handler that takes no argument, so it cannot look at what a tile holds.
 */
const TILE_EVENTS = ["tileLoad"];

describe("Google mode files", () => {
  for (const file of GOOGLE_MODE_FILES) {
    it(`${file} never reads heights, depth or geometry back from the tiles`, () => {
      const text = code(file);
      for (const name of FORBIDDEN) expect(text, `${file} uses ${name}`).not.toContain(name);
      expect(text, `${file} calls .pick(`).not.toMatch(PICK_CALL);
      if (file === "cesium-google.ts") return;
      for (const name of TILE_EVENTS) expect(text, `${file} uses ${name}`).not.toContain(name);
    });
  }

  it("cesium-google.ts only counts loaded tiles and never looks at one", () => {
    const text = code("cesium-google.ts");
    expect(text).toMatch(/const tileLoad = \(\): void => \{\s*this\.loadedTiles \+= 1;\s*\};/);
    for (const use of text.match(/tileset\.tileLoad\.\w+/g) ?? []) {
      expect(use).toMatch(/\.(add|remove)EventListener$/);
    }
    expect(text).not.toMatch(/\.content\b/);
  });

  it("uses no ClassificationType other than CESIUM_3D_TILE", () => {
    for (const file of GOOGLE_MODE_FILES) {
      const uses = code(file).match(/ClassificationType\.\w+/g) ?? [];
      for (const use of uses) expect(use, file).toBe("ClassificationType.CESIUM_3D_TILE");
    }
    expect(code("cesium-holo.ts")).toMatch(/ClassificationType\.CESIUM_3D_TILE/);
  });

  it("draws the corridor as a classification of the 3D tiles only", () => {
    const text = code("cesium-holo.ts");
    expect(text).toContain("ClassificationPrimitive");
    expect(text).toContain("ClassificationType.CESIUM_3D_TILE");
    expect(text).not.toContain("ClassificationType.BOTH");
    expect(text).not.toContain("ClassificationType.TERRAIN");
  });

  it("places items from the ground height source and its documented constant", () => {
    const text = code("cesium-holo.ts");
    expect(text).toContain("this.ground.heightAt");
    expect(text).toContain("fallbackGroundMetres");
  });

  it("makes no network request of its own and adds no base layer, globe or terrain", () => {
    for (const file of ["cesium-holo.ts", "fx-stage.ts", "beacon-label.ts"]) {
      const text = code(file);
      expect(text).not.toMatch(/\bfetch\(|XMLHttpRequest|new Resource|imageryProvider|baseLayer/);
    }
  });

  it("caches nothing: no storage, no cache API, no IndexedDB", () => {
    for (const file of GOOGLE_MODE_FILES) {
      expect(code(file)).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\.|CacheStorage/);
    }
  });
});

describe("the hologram code", () => {
  const files = readdirSync(dir).filter((f) => /holo|beacon/.test(f) && !f.endsWith(".test.ts"));

  it("exists", () => {
    expect(files).toEqual(expect.arrayContaining(["cesium-holo.ts", "maplibre-holo.ts"]));
  });

  it("has no dash characters or emoji in code or comments", () => {
    for (const file of [...files, "fx-shader.ts", "fx-stage.ts"]) {
      const source = readFileSync(join(dir, file), "utf8");
      expect(source, file).not.toMatch(/[‒-―−]/);
      expect(source, file).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
