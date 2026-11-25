import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveFxLevel } from "@waylit/map-provider";

// Cesium needs a browser. Stand-ins record whether a shader was ever constructed.
const created = vi.hoisted(() => ({ shaders: 0 }));

vi.mock("@cesium/core", () => ({
  Cartesian3: class {
    constructor(
      public x = 0,
      public y = 0,
      public z = 0,
    ) {}
  },
}));
vi.mock("@cesium/engine", () => ({
  CustomShader: class {
    constructor() {
      created.shaders += 1;
    }
    setUniform(): void {}
  },
  LightingModel: { UNLIT: "UNLIT" },
  UniformType: { VEC3: "VEC3" },
}));

import { TILE_SHADER_FRAGMENT, createTileShader, tileShaderWanted } from "./tile-shader";

describe("tile shader (night tint and street light lift)", () => {
  beforeEach(() => {
    created.shaders = 0;
  });

  it("is not created in Google mode with the effect off", () => {
    expect(createTileShader("off")).toBeUndefined();
    expect(created.shaders).toBe(0);
  });

  it("is not created in Google mode with the default setting or ?fx=off", () => {
    for (const search of ["", "?fx=off", "?map=cesium"]) {
      const level = resolveFxLevel(search, "cesium-google");
      expect(tileShaderWanted(level)).toBe(false);
      expect(createTileShader(level)).toBeUndefined();
    }
    expect(created.shaders).toBe(0);
  });

  it("is created when the effect is switched on with ?fx=low or ?fx=high", () => {
    for (const search of ["?fx=low", "?fx=high"]) {
      expect(createTileShader(resolveFxLevel(search, "cesium-google"))).toBeDefined();
    }
    expect(created.shaders).toBe(2);
  });

  it("recolours from the tile's own colour only", () => {
    expect(TILE_SHADER_FRAGMENT).toContain("material.diffuse");
    expect(TILE_SHADER_FRAGMENT).not.toMatch(/depth|pick|czm_(?!modelMaterial)|texture/i);
  });
});
