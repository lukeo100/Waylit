import type { FxParameters } from "@waylit/map-provider";

/**
 * The GLSL for the futuristic post process, and the packing of its uniforms. Original code,
 * written for Waylit. It runs as ONE full screen pass in CesiumJS (a `PostProcessStage`).
 *
 * Hard rules this file keeps (see docs/ARCHITECTURE.md, "Visual effects and the Google terms"):
 *
 *  - COLOUR ONLY. The only input is `colorTexture`, the picture rendered so far. There is no
 *    `depthTexture`, no `czm_idTexture`, no picking and no depth based fog or edges, so nothing
 *    is ever read about the height or shape of the Google tiles. The edge glow is a Sobel filter
 *    on the picture's luminance, which finds edges in the colours, not in the geometry.
 *  - It is a few texture reads: 3 in the cheap variant (the pixel and two neighbours) and 9 in
 *    the full one (the pixel and its eight neighbours). Everything else is arithmetic on screen
 *    coordinates.
 *  - It never touches the credits strip or the Google and Cesium logos: those are DOM elements
 *    outside the canvas, so a post process on the canvas cannot reach them.
 *
 * The look, in order: a colour grade (slight desaturation, controlled contrast, deep navy darks
 * and cool lights, a warm magenta to cyan split at sunset), a cyan edge glow that traces the
 * edges of buildings and roads and is strongest at night, the holographic scan band and grid,
 * and a very faint scanline shimmer. Strengths all come from `fxParameters` (the daylight state).
 *
 * It never darkens the picture by screen position: there is no vignette, no horizon haze band and
 * no other term that depends on the distance to the middle or the edge of the screen. Every
 * darkening the grade does is the same for every pixel of the same colour. `fx-shader.test.ts`
 * and `no-screen-darkening.test.ts` fail if a position based darkening comes back.
 */

/** The names of the uniforms the shader reads. */
export const FX_UNIFORMS = [
  "u_grade",
  "u_shadow",
  "u_highlight",
  "u_edge",
  "u_edgeControl",
  "u_holo",
  "u_motion",
] as const;

export type FxUniformName = (typeof FX_UNIFORMS)[number];

/** The uniform values as plain arrays, ready for `Cartesian4` or `Cartesian3`. */
export type PackedFxUniforms = Readonly<Record<FxUniformName, readonly number[]>>;

/** Packs the parameters into the shader's vectors. */
export function packFxUniforms(p: FxParameters): PackedFxUniforms {
  return {
    // gradeMix, saturation, contrast, unused
    u_grade: [p.gradeMix, p.saturation, p.contrast, 0],
    // shadow tone rgb, unused
    u_shadow: [...p.shadowTone, 0],
    // highlight tone rgb, scanline strength
    u_highlight: [...p.highlightTone, p.scanline],
    // edge colour rgb, edge strength
    u_edge: [...p.edgeColour, p.edgeStrength],
    // edge gain, edge threshold, horizon height on screen (for the grid), unused
    u_edgeControl: [p.edgeGain, p.edgeThreshold, p.horizonY, 0],
    // scan band centre (set every frame), band half height, band strength, grid strength
    u_holo: [-1, p.scanHalfWidth, p.scanStrength, p.gridStrength],
    // grid scroll (set every frame), unused, unused, unused
    u_motion: [0, 0, 0, 0],
  };
}

/** The extra texture reads in the edge detector for a variant: 2 (cheap) or 8 (full). */
const EDGE_READS = { 1: 2, 2: 8 } as const;

const HEADER = `
uniform sampler2D colorTexture;
uniform vec2 colorTextureDimensions;
uniform vec4 u_grade;
uniform vec4 u_shadow;
uniform vec4 u_highlight;
uniform vec4 u_edge;
uniform vec4 u_edgeControl;
uniform vec4 u_holo;
uniform vec4 u_motion;
in vec2 v_textureCoordinates;

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
`;

/** Edge signal from the pixel and one step right and up: two extra reads, cheap. */
const EDGE_CHEAP = `
  vec2 px = 1.0 / colorTextureDimensions;
  float lRight = luma(texture(colorTexture, uv + vec2(px.x, 0.0)).rgb);
  float lUp = luma(texture(colorTexture, uv + vec2(0.0, px.y)).rgb);
  float magnitude = length(vec2(lRight - l, lUp - l)) * 0.7;
`;

/** Sobel on luminance, eight extra reads. */
const EDGE_SOBEL = `
  vec2 px = 1.0 / colorTextureDimensions;
  float tl = luma(texture(colorTexture, uv + vec2(-px.x,  px.y)).rgb);
  float tc = luma(texture(colorTexture, uv + vec2( 0.0,   px.y)).rgb);
  float tr = luma(texture(colorTexture, uv + vec2( px.x,  px.y)).rgb);
  float ml = luma(texture(colorTexture, uv + vec2(-px.x,  0.0)).rgb);
  float mr = luma(texture(colorTexture, uv + vec2( px.x,  0.0)).rgb);
  float bl = luma(texture(colorTexture, uv + vec2(-px.x, -px.y)).rgb);
  float bc = luma(texture(colorTexture, uv + vec2( 0.0,  -px.y)).rgb);
  float br = luma(texture(colorTexture, uv + vec2( px.x, -px.y)).rgb);
  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
  float magnitude = length(vec2(gx, gy)) * 0.25;
`;

/**
 * The holographic grid, full variant only. It is drawn from screen coordinates alone: below the
 * horizon line a screen height stands for a distance over a flat ground plane, so equal steps in
 * that distance and in the sideways direction make a grid in perspective. It reads nothing from
 * the picture and nothing about the scene, and it scrolls toward the rider with the time.
 */
const GRID = `
  // 4. Faint ground grid, from screen coordinates only, in perspective below the horizon.
  float below = max(u_edgeControl.z - uv.y, 0.02);
  float range = 0.05 / below;
  vec2 cell = vec2((uv.x - 0.5) * range * 2.4, range - u_motion.x);
  vec2 nearest = 0.5 - abs(fract(cell) - 0.5);
  vec2 soften = fwidth(cell) * 1.3 + 0.004;
  vec2 gridLine = 1.0 - smoothstep(vec2(0.0), soften, nearest);
  float gridFade = smoothstep(0.03, 0.2, below) * smoothstep(0.0, 0.3, uv.y);
  float gridCalm = 1.0 - smoothstep(0.35, 1.0, max(soften.x, soften.y));
  c += u_edge.rgb * max(gridLine.x, gridLine.y) * gridFade * gridCalm * u_holo.w;`;

/**
 * The fragment shader for a variant: 1 is the cheap one, 2 is the full one with the Sobel edge
 * detector and the scanline. Variant 0 (off) has no shader because the stage is not added.
 */
export function fxFragmentShader(variant: 1 | 2): string {
  const edges = variant === 2 ? EDGE_SOBEL : EDGE_CHEAP;
  const scan =
    variant === 2
      ? `
  // Faint scanline shimmer: a very slow, very low contrast stripe every three pixels.
  float stripe = 0.5 + 0.5 * sin(gl_FragCoord.y * 2.0944);
  c *= 1.0 - u_highlight.w * stripe;`
      : "";
  const grid = variant === 2 ? GRID : "";
  return `${HEADER}
void main() {
  vec2 uv = v_textureCoordinates;
  vec4 source = texture(colorTexture, uv);
  vec3 c = source.rgb;
  float l = luma(c);

  // 1. Colour grade: less saturated, more contrast, navy darks, cool lights.
  vec3 g = mix(vec3(l), c, u_grade.y);
  g = (g - 0.5) * u_grade.z + 0.5;
  float lg = clamp(luma(g), 0.0, 1.0);
  g = g * mix(vec3(1.0), u_highlight.rgb, lg) + u_shadow.rgb * (1.0 - lg);
  c = mix(c, g, u_grade.x);

  // 2. Cyan edge glow from the luminance edges of the picture.
${edges}
  float edge = smoothstep(u_edgeControl.y, u_edgeControl.y + 0.14, magnitude * u_edgeControl.x);
  c += u_edge.rgb * edge * u_edge.w;

  // 3. Scan band: one soft band that sweeps up the picture, lifting the glow it passes over.
  // The centre is a screen height, negative while the band rests between sweeps.
  float bandOffset = (uv.y - u_holo.x) / u_holo.y;
  float bandShape = exp(-bandOffset * bandOffset) * u_holo.z * step(0.0, u_holo.x);
  c += u_edge.rgb * bandShape * (0.1 + edge * 1.4);
${grid}
${scan}

  out_FragColor = vec4(clamp(c, 0.0, 1.0), source.a);
}
`;
}

/** How many `texture(` reads a variant makes per pixel, counting the pixel itself. */
export function textureReadsFor(variant: 1 | 2): number {
  return 1 + EDGE_READS[variant];
}
