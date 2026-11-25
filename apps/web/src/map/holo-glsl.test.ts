import { describe, expect, it } from "vitest";
import { HOLO_GLSL, holoFunctionFor } from "./holo-glsl";

describe("hologram shader source", () => {
  it("defines one function per item kind", () => {
    for (const kind of ["rider", "chevron", "beacon", "heading"] as const) {
      const name = holoFunctionFor(kind);
      expect(HOLO_GLSL).toContain(`vec4 ${name}(float h, float g, vec3 n, vec3 v,`);
    }
  });

  it("never reads the map: no textures, no scene depth, no picking, no Cesium built ins", () => {
    expect(HOLO_GLSL).not.toMatch(/texture|sampler|depth|czm_|pick|gl_FragCoord/i);
  });

  it("has no loops or branches", () => {
    expect(HOLO_GLSL).not.toMatch(/\b(for|while|if)\s*\(/);
  });

  it("never raises a possibly negative number to a power", () => {
    for (const match of HOLO_GLSL.matchAll(/pow\(([^,]+),/g)) {
      expect(match[1]).toMatch(/abs\(|^1\.0 - abs/);
    }
  });

  it("is plain ASCII without dashes or emoji", () => {
    // eslint-disable-next-line no-control-regex
    expect(HOLO_GLSL).toMatch(/^[\x00-\x7f]*$/);
  });

  it("uses only the one cyan family", () => {
    // 0.373, 0.784, 0.910 is #5fc8e8 and 0.404, 0.910, 0.976 is #67e8f9.
    expect(HOLO_GLSL).toContain("vec3(0.373, 0.784, 0.910)");
    expect(HOLO_GLSL).toContain("vec3(0.404, 0.910, 0.976)");
    expect(HOLO_GLSL).not.toMatch(/vec3\(1\.0, 0\.[0-6]/);
  });
});
