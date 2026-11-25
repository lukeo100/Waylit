import type { HoloKind } from "@waylit/map-provider";

/**
 * The GLSL for the hologram look of the rider, the chevrons, the turn beacon and the heading
 * marker. Original code written for Waylit. It is plain shading maths on values the app supplies
 * itself (height above the ground in the model's own metres, a 0 to 1 gradient, the surface
 * normal, the view direction, the time and a pulse), so the same functions run inside a Cesium
 * material and inside the MapLibre custom layer.
 *
 * It never reads the map: not the picture behind it, not any depth, not any tile. These are
 * meshes Waylit builds itself, drawn over the scene.
 *
 * Every function returns a colour and an opacity (not premultiplied). No loops, no branches.
 */

/** The cyan family as 0 to 1 channels, from `#5fc8e8` and `#67e8f9`. */
const BASE = "vec3(0.373, 0.784, 0.910)";
const BRIGHT = "vec3(0.404, 0.910, 0.976)";

export const HOLO_GLSL = `
float holoRim(vec3 n, vec3 v) {
  return pow(1.0 - abs(dot(normalize(n), normalize(v))), 1.8);
}

// Rider and scooter: scanlines that climb the body, a rim light and a bright band that travels
// up the figure. The feet fade into the ground.
vec4 holoRider(float h, float g, vec3 n, vec3 v, float t, float pulse, float alpha) {
  float rim = holoRim(n, v);
  float lines = 0.5 + 0.5 * sin(h * 95.0 - t * 2.4);
  float travel = fract(t * 0.3) * 2.4 - 0.3;
  float away = (travel - h) * 5.0;
  float sweep = exp(-away * away);
  float feet = smoothstep(0.0, 0.2, h);
  float strength = 0.2 + 0.18 * lines + rim * 0.75 + sweep * 0.45;
  vec3 colour = mix(${BASE} * 0.8, ${BRIGHT}, clamp(rim + sweep * 0.7, 0.0, 1.0));
  return vec4(colour, clamp(strength * feet * alpha, 0.0, 0.93));
}

// Chevron: a flat arrow with a soft pulse, brighter at its edges.
vec4 holoChevron(float h, float g, vec3 n, vec3 v, float t, float pulse, float alpha) {
  float rim = holoRim(n, v);
  float glow = 0.5 + 0.5 * pulse;
  vec3 colour = mix(${BASE}, ${BRIGHT}, clamp(pulse * 0.8 + rim * 0.4, 0.0, 1.0));
  return vec4(colour, clamp(alpha * (0.35 + 0.55 * glow), 0.0, 0.95));
}

// Turn beacon: a hollow column that fades up and into the sky, with stripes that rise, and a
// bright ring on the ground at its foot (the ring is the part below 0.2 m).
vec4 holoBeacon(float h, float g, vec3 n, vec3 v, float t, float pulse, float alpha) {
  float foot = 1.0 - smoothstep(0.1, 0.3, h);
  float stripes = 0.65 + 0.35 * sin(h * 5.0 - t * 3.2);
  float column = g * g * stripes * (0.55 + 0.45 * pulse);
  float strength = mix(0.05 + 0.5 * column, 0.65 + 0.3 * pulse, foot);
  return vec4(mix(${BASE}, ${BRIGHT}, foot * 0.8 + g * 0.2), clamp(strength * alpha, 0.0, 0.95));
}

// Heading marker: a thin ring at the rider's base and a cone that fades out ahead of it. The
// ring is lower than the cone (0.02 m against 0.05 m).
vec4 holoHeading(float h, float g, vec3 n, vec3 v, float t, float pulse, float alpha) {
  float cone = step(0.035, h);
  float ring = 0.6 + 0.3 * pulse;
  float wedge = (1.0 - g) * (1.0 - g) * 0.55;
  float strength = mix(ring, wedge, cone);
  return vec4(mix(${BRIGHT}, ${BASE}, cone), clamp(strength * alpha, 0.0, 0.92));
}
`;

/** The function to call for an item kind. */
export function holoFunctionFor(kind: HoloKind): string {
  switch (kind) {
    case "rider":
      return "holoRider";
    case "chevron":
      return "holoChevron";
    case "beacon":
      return "holoBeacon";
    case "heading":
      return "holoHeading";
  }
}
