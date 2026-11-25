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
];

describe("Google mode files", () => {
  for (const file of GOOGLE_MODE_FILES) {
    it(`${file} never reads heights, depth or geometry back from the tiles`, () => {
      const text = code(file);
      for (const name of FORBIDDEN) expect(text, `${file} uses ${name}`).not.toContain(name);
    });
  }

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
