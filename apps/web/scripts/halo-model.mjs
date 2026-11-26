/**
 * The shadow contrast model that the layout check runs in the page, kept in its own file so a unit
 * test (`src/hud/halo-model.test.ts`) can check it gives the same numbers as the typed model in
 * `src/hud/readability.ts`. Each function is self contained (no outside names), because
 * `layout-check.mjs` sends them into the page with `Function.prototype.toString`.
 *
 * The model, in short: a glyph is one isolated stroke of a given width, a shadow layer is that
 * stroke moved by the layer's offset and blurred by a Gaussian of sigma blur / 2, and the pixel
 * looked at is the one touching the glyph (0.5 px outside its edge) on the worst of its four
 * sides. The shadow's black is composited over the scene colour in sRGB.
 */

/** Reads a computed `text-shadow` or `filter: drop-shadow(...)` value into layers. */
export function parseShadowLayers(value) {
  const layers = [];
  const parts = [];
  let depth = 0;
  let start = 0;
  const source = value.includes("drop-shadow(")
    ? [...value.matchAll(/drop-shadow\(((?:[^()]|\([^)]*\))*)\)/g)].map((m) => m[1]).join(",")
    : value;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(source.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(source.slice(start));
  for (const part of parts) {
    const colour = /rgba?\(([^)]*)\)/.exec(part);
    if (!colour) continue;
    const lengths = part
      .replace(colour[0], " ")
      .split(/\s+/)
      .filter(Boolean)
      .map((n) => Number.parseFloat(n));
    if (lengths.length < 3 || lengths.some((n) => !Number.isFinite(n))) continue;
    const channels = colour[1]
      .split(/[ ,/]+/)
      .filter(Boolean)
      .map(Number);
    layers.push({
      x: lengths[0],
      y: lengths[1],
      blur: lengths[2],
      alpha: channels.length > 3 ? channels[3] : 1,
    });
  }
  return layers;
}

/**
 * WCAG contrast of a glyph colour against what is right next to it, over a scene colour, with
 * the given shadow layers. `fg` and `scene` are [r, g, b] in 0 to 255.
 */
export function haloContrast(fg, scene, layers, stroke, probe = 0.5) {
  const cdf = (z) => {
    const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
    const poly =
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t;
    const erf = 1 - poly * Math.exp(-(z * z) / 2);
    return 0.5 * (1 + (z >= 0 ? erf : -erf));
  };
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const half = stroke / 2;
  let alpha = Infinity;
  for (const dir of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    let clear = 1;
    for (const layer of layers) {
      const d = half + probe - (dir[0] * layer.x + dir[1] * layer.y);
      const sigma = layer.blur / 2;
      const coverage =
        sigma === 0
          ? Math.abs(d) <= half
            ? 1
            : 0
          : cdf((half - d) / sigma) + cdf((half + d) / sigma) - 1;
      clear *= 1 - layer.alpha * coverage;
    }
    alpha = Math.min(alpha, 1 - clear);
  }
  const behind = [scene[0] * (1 - alpha), scene[1] * (1 - alpha), scene[2] * (1 - alpha)];
  const a = lum(fg);
  const b = lum(behind);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
