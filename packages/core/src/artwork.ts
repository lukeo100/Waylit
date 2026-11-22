import type { MediaArtworkSpec } from "./media";

/**
 * Generates original cover art as an SVG string. The picture is a few overlapping circles,
 * rings and bars placed by a seeded generator, so each track gets its own image and the same
 * spec always gives the same image. Pure string building, with no DOM and no image files.
 */

const SIZE = 512;

/** Small deterministic generator, so artwork does not depend on the random helper's state. */
function seededUnit(seed: number): () => number {
  let state = (seed * 2654435761) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const round = (n: number): number => Math.round(n * 10) / 10;

/** Only allow plain CSS colours so the spec can never inject markup into the SVG. */
function safeColour(value: string | undefined, fallback: string): string {
  return value !== undefined && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : fallback;
}

export function generateArtworkSvg(spec: MediaArtworkSpec): string {
  const next = seededUnit(spec.seed);
  const bg = safeColour(spec.palette[0], "#0b1d3a");
  const mid = safeColour(spec.palette[1], "#2f6bff");
  const light = safeColour(spec.palette[2], "#22d3ee");
  const shapes: string[] = [];

  for (let i = 0; i < 4; i++) {
    const cx = round(next() * SIZE);
    const cy = round(next() * SIZE);
    const r = round(70 + next() * 150);
    shapes.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${mid}" fill-opacity="0.35"/>`);
  }
  for (let i = 0; i < 3; i++) {
    const cx = round(120 + next() * 270);
    const cy = round(120 + next() * 270);
    const r = round(40 + next() * 110);
    shapes.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${light}" stroke-width="${round(3 + next() * 7)}" stroke-opacity="0.8"/>`,
    );
  }
  const barCount = 6 + Math.floor(next() * 5);
  const barWidth = SIZE / barCount;
  for (let i = 0; i < barCount; i++) {
    const h = round(20 + next() * 140);
    shapes.push(
      `<rect x="${round(i * barWidth + 4)}" y="${round(SIZE - h)}" width="${round(barWidth - 8)}" height="${h}" rx="6" fill="${light}" fill-opacity="0.25"/>`,
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">`,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${mid}" stop-opacity="0.6"/></linearGradient></defs>`,
    `<rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>`,
    ...shapes,
    `</svg>`,
  ].join("");
}

/** Wraps an SVG string as a data URI that an image element or the Media Session API accepts. */
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Artwork for a track as a ready-to-use data URI. */
export function artworkDataUri(spec: MediaArtworkSpec): string {
  return svgToDataUri(generateArtworkSvg(spec));
}
