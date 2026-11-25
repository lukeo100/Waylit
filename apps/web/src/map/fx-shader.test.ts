import { describe, expect, it } from "vitest";
import { fxParameters } from "@waylit/map-provider";
import { FX_UNIFORMS, fxFragmentShader, packFxUniforms, textureReadsFor } from "./fx-shader";

const NIGHT = {
  timestamp: 0,
  position: { lat: 52.47, lng: 13.4 },
  sunElevationDegrees: -40,
  sunAzimuthDegrees: 0,
  phase: "night",
  daylightFactor: 0,
  warmth: 0,
} as const;

describe("fx shader source", () => {
  for (const variant of [1, 2] as const) {
    describe(`variant ${String(variant)}`, () => {
      const source = fxFragmentShader(variant);

      it("reads colour only: no depth, no picking, no ids", () => {
        expect(source).not.toMatch(/depth/i);
        expect(source).not.toMatch(/czm_/);
        expect(source).not.toMatch(/pick/i);
        expect(source).toContain("uniform sampler2D colorTexture;");
        expect(source.match(/uniform sampler2D/g)).toHaveLength(1);
      });

      it("makes a small, fixed number of texture reads", () => {
        const reads = source.match(/texture\(/g)?.length ?? 0;
        expect(reads).toBe(textureReadsFor(variant));
        expect(reads).toBe(variant === 2 ? 9 : 3);
      });

      it("declares every uniform it uses and writes one output", () => {
        for (const name of FX_UNIFORMS) expect(source).toContain(name);
        expect(source.match(/out_FragColor =/g)).toHaveLength(1);
      });

      it("has no loops or branches that cost on a mobile GPU", () => {
        expect(source).not.toMatch(/\bfor\s*\(/);
        expect(source).not.toMatch(/\bwhile\s*\(/);
        expect(source).not.toMatch(/\bif\s*\(/);
      });
    });
  }

  it("keeps the scanline for the full variant only", () => {
    expect(fxFragmentShader(2)).toContain("sin(gl_FragCoord.y");
    expect(fxFragmentShader(1)).not.toContain("sin(");
  });

  it("has the scan band in both variants and the ground grid in the full variant only", () => {
    expect(fxFragmentShader(1)).toContain("bandShape");
    expect(fxFragmentShader(2)).toContain("bandShape");
    expect(fxFragmentShader(2)).toContain("gridLine");
    expect(fxFragmentShader(1)).not.toContain("gridLine");
    expect(fxFragmentShader(1)).not.toContain("fwidth");
  });

  it("builds the grid and the band from screen coordinates, never from the scene", () => {
    const source = fxFragmentShader(2);
    expect(source).toContain("v_textureCoordinates");
    // The only texture reads are the colour picture's own pixels.
    expect(source.match(/texture\(/g)).toHaveLength(9);
    expect(source).not.toMatch(/viewport|czm_|inverse|eye|world/i);
  });

  it("uses no dash characters or non ASCII text", () => {
    for (const variant of [1, 2] as const) {
      // eslint-disable-next-line no-control-regex
      expect(fxFragmentShader(variant)).toMatch(/^[\x00-\x7f]*$/);
    }
  });
});

describe("packFxUniforms", () => {
  it("packs the daylight driven parameters into the shader vectors", () => {
    const p = fxParameters(NIGHT, "high");
    const packed = packFxUniforms(p);
    expect(packed.u_grade).toEqual([p.gradeMix, p.saturation, p.contrast, p.vignette]);
    expect(packed.u_edge[3]).toBe(p.edgeStrength);
    expect(packed.u_edgeControl[0]).toBe(p.edgeGain);
    expect(packed.u_shadow).toHaveLength(4);
    expect(packed.u_highlight).toHaveLength(4);
    expect(packed.u_haze).toHaveLength(3);
    expect(packed.u_holo).toEqual([-1, p.scanHalfWidth, p.scanStrength, p.gridStrength]);
    expect(packed.u_motion).toHaveLength(4);
    for (const name of FX_UNIFORMS) {
      for (const value of packed[name]) expect(Number.isFinite(value)).toBe(true);
    }
  });
});
