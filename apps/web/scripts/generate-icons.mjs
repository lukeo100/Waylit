/**
 * Generates the Waylit app icons from one original logo definition.
 *
 * Run from the repository root with `pnpm --filter @waylit/web icons`. It has no
 * dependencies: shapes are rasterised with signed distance fields and encoded with
 * Node's built-in zlib, so the output is the same on every machine.
 *
 * The logo is three stacked route chevrons on the night base colour.
 * It echoes the glowing corridor of the riding view and uses only Waylit design tokens.
 * Everything lives inside the central 80 percent circle, which is the maskable safe zone,
 * so one drawing serves both the "any" and "maskable" purposes.
 *
 * Outputs (in apps/web/public/icons):
 *   icon.svg                 vector logo, rounded corners
 *   icon-192.png, icon-512.png            purpose "any", rounded corners
 *   icon-maskable-192.png, icon-maskable-512.png   purpose "maskable", full bleed square
 *   apple-touch-icon.png     180px, full bleed (iOS applies its own mask)
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

// App icon colours. They are fixed brand colours for the launcher icon and do not follow the
// HUD tokens in packages/ui-tokens.
const BASE = "#05080f";
const VOLT = "#2e8bff";
const CYAN = "#35e0ff";
const CYAN_SOFT = "#a6f1ff";

/** Logo geometry on a 512 unit canvas. Chevrons are polylines with round caps. */
const STROKE = 36;
const CHEVRONS = [
  {
    points: [
      [156, 214],
      [256, 124],
      [356, 214],
    ],
    color: CYAN_SOFT,
  },
  {
    points: [
      [156, 304],
      [256, 214],
      [356, 304],
    ],
    color: CYAN,
  },
  {
    points: [
      [156, 394],
      [256, 304],
      [356, 394],
    ],
    color: VOLT,
  },
];
const CORNER_RADIUS = 112;
const GLOW_RADIUS = 20;
const GLOW_STRENGTH = 0.45;
const SUPERSAMPLE = 3;

const hex = (value) => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
];

/** Distance from point p to segment a-b. */
function segmentDistance(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Signed distance to a chevron stroke (negative inside). */
function chevronDistance(px, py, chevron) {
  const [a, b, c] = chevron.points;
  return Math.min(segmentDistance(px, py, a, b), segmentDistance(px, py, b, c)) - STROKE / 2;
}

/** Inside test for a rounded square covering the whole canvas. */
function insideRoundedSquare(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  return Math.hypot(x - cx, y - cy) <= radius;
}

/** Colour and alpha of the logo at a point of the 512 canvas. Returns [r, g, b, a]. */
function sample(x, y) {
  let rgb = hex(BASE);
  // Soft glow first, then the crisp shapes on top.
  for (const chevron of CHEVRONS) {
    const d = chevronDistance(x, y, chevron);
    if (d > 0) {
      const k = GLOW_STRENGTH * Math.exp(-((d / GLOW_RADIUS) ** 2));
      rgb = mix(rgb, hex(chevron.color), k);
    }
  }
  for (const chevron of CHEVRONS) {
    const d = chevronDistance(x, y, chevron);
    if (d <= 0) rgb = hex(chevron.color);
  }
  return rgb;
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Rasterises the logo at `size` pixels. `rounded` makes the corners transparent. */
function render(size, rounded) {
  const scale = 512 / size;
  const pixels = Buffer.alloc(size * size * 4);
  const n = SUPERSAMPLE;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const x = (px + (sx + 0.5) / n) * scale;
          const y = (py + (sy + 0.5) / n) * scale;
          if (rounded && !insideRoundedSquare(x, y, 512, CORNER_RADIUS)) continue;
          const [cr, cg, cb] = sample(x, y);
          r += cr;
          g += cg;
          b += cb;
          a += 1;
        }
      }
      const o = (py * size + px) * 4;
      if (a > 0) {
        pixels[o] = Math.round(r / a);
        pixels[o + 1] = Math.round(g / a);
        pixels[o + 2] = Math.round(b / a);
        pixels[o + 3] = Math.round((a / (n * n)) * 255);
      }
    }
  }
  return pixels;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encodes RGBA pixels as a PNG. Fixed filter and compression level keep it reproducible. */
function encodePng(pixels, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** The same drawing as SVG. The glow is a blurred copy of the chevrons. */
function svg() {
  const lines = (extra) =>
    CHEVRONS.map(
      (c) =>
        `    <polyline points="${c.points.map((p) => p.join(",")).join(" ")}" stroke="${c.color}"${extra}/>`,
    ).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Waylit">
  <defs>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="${GLOW_RADIUS / 2}"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="${CORNER_RADIUS}" fill="${BASE}"/>
  <g fill="none" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">
    <g filter="url(#glow)" opacity="${GLOW_STRENGTH + 0.2}">
${lines("")}
    </g>
${lines("")}
  </g>
</svg>
`;
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "icon.svg"), svg());

const targets = [
  ["icon-192.png", 192, true],
  ["icon-512.png", 512, true],
  ["icon-maskable-192.png", 192, false],
  ["icon-maskable-512.png", 512, false],
  ["apple-touch-icon.png", 180, false],
];
for (const [name, size, rounded] of targets) {
  writeFileSync(join(outDir, name), encodePng(render(size, rounded), size));
  console.log(`wrote ${name} (${size}x${size})`);
}
