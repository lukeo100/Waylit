/**
 * Layout check for the riding screen: nothing may cover the credits strip, and the development
 * overlay may not sit on top of the HUD text. The map settings button must be a 44 pixel target, and
 * its open sheet may not cover the credits strip or the speed and turn text. It opens /ride in headless Chrome at the landscape
 * sizes the screen is designed for, with the first run safety notice open and closed, with and
 * without ?dev=1, and fails if
 *
 *   - any point inside the credits strip is covered by something that is not part of the strip
 *     (this is what the Google and Cesium terms need: logo and credits never obscured), or
 *   - the safety notice's rectangle overlaps the strip's rectangle, or
 *   - the dev stats overlay overlaps the speed, turn, status or minimap text, or
 *   - with FAKE_CREDITS=1, the credits (drawn like Cesium draws them) are on more than one line or
 *     a logo is hidden. That run also adds a 640 pixel wide size, or
 *   - (riding, after Start trip) any HUD part overlaps another, or
 *   - anything that is not the scene, the credits strip or an opened dialog paints a fill or a
 *     gradient over more than 20 percent of the screen, or as a band across 97 percent of its
 *     width (no scrim, no vignette, no wide backdrop), or
 *   - a piece of text over the scene is below WCAG AA (4.5:1, or 3:1 for the speed and the turn
 *     distance). Text on a plate is checked with the plate composited over pure white and pure
 *     black. The top left navigation text and the top right status text have no plate: they are
 *     checked with the shadow model in `halo-model.mjs` (the pixel touching the glyph, with the
 *     computed text-shadow or drop-shadow filter) over pure white, a light sky (#bcd9ee) and pure
 *     black. All colours are the ones the browser actually computed. The dev runs use
 *     `time=night`, where a plate is lightest, or
 *   - the navigation or status group paints a fill, border, box shadow or backdrop filter, or has
 *     no glyph shadow (they must stay plate free).
 *
 * Usage (after `pnpm build`, with the app running: `pnpm --filter @waylit/web start`):
 *   node apps/web/scripts/layout-check.mjs [baseUrl]    default http://localhost:3000
 *
 * It needs Chrome or Chromium (set CHROME_BIN if it is not `google-chrome`, and CDP_PORT if port
 * 9333 is taken). Screenshots go to the folder in SHOTS_DIR when that is set.
 */
import { join } from "node:path";
import { launchChrome, sleep } from "./cdp.mjs";
import { haloContrast, parseShadowLayers } from "./halo-model.mjs";

const base = process.argv[2] ?? "http://localhost:3000";
const SIZES = [
  ...(process.env.FAKE_CREDITS === "1" ? [[640, 360]] : []),
  [915, 412],
  [740, 360],
  [667, 375],
  [800, 360],
  [1280, 720],
];
const NOTICE_KEY = "waylit:safety-notice-ack:v1";

/** Runs in the page. Returns the rectangles and the covering test results. */
const MEASURE = `(() => {
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom };
  };
  const strip = document.querySelector('[data-testid="attribution-slot"]');
  const notice = document.querySelector('[role="dialog"]');
  const out = { strip: strip ? rect(strip) : null, notice: notice ? rect(notice) : null, covered: 0, probes: 0 };
  if (strip) {
    const r = strip.getBoundingClientRect();
    for (let ix = 1; ix < 24; ix++) {
      for (let iy = 1; iy < 4; iy++) {
        const x = r.left + (r.width * ix) / 24;
        const y = r.top + (r.height * iy) / 4;
        const top = document.elementsFromPoint(x, y)[0];
        out.probes += 1;
        if (top && !strip.contains(top)) out.covered += 1;
      }
    }
    const credits = strip.querySelector('[data-testid="map-credit-mount"]');
    out.creditsHeight = credits ? credits.getBoundingClientRect().height : 0;
  }
  const ids = ['speed-value','speed-unit','speed-source','telemetry-note','turn-distance','turn-instruction','stat-remaining','stat-eta','local-time','weather','minimap','map-note','start-prompt','dev-controls','dock','map-settings-button'];
  // Credits as Cesium draws them, with the long Google data line, to check the strip stays on one
  // line and the logos stay visible. Only when the page asks for it.
  if (window.__fakeCredits) {
    const mount = strip && strip.querySelector('[data-testid="map-credit-mount"]');
    if (mount) {
      mount.innerHTML = '<div class="cesium-widget-credits"><div class="cesium-credit-logoContainer"><img alt="Google" style="height:17px;width:60px;background:#888"><img alt="Cesium ion" style="height:17px;width:70px;background:#888"></div><div class="cesium-credit-textContainer"><span>Data SIO, NOAA, U.S. Navy, NGA, GEBCO | Landsat / Copernicus | Imagery 2026 Airbus, CNES / Airbus, Maxar Technologies, Vexcel Imaging US Inc</span><a class="cesium-credit-expand-link" href="#">Data attribution</a></div></div>';
      const r = strip.getBoundingClientRect();
      const logos = [...mount.querySelectorAll('img')].map((i) => i.getBoundingClientRect());
      out.logosVisible = logos.every((l) => l.width > 0 && l.right <= r.right && l.left >= r.left);
      out.stripHeight = r.height;
      out.textClipped = (() => { const t = mount.querySelector('.cesium-credit-textContainer'); return t.scrollWidth > t.clientWidth + 1; })();
    }
  }
  const stats = document.querySelector('[data-testid="map-stats"]');
  out.stats = stats ? rect(stats) : null;
  out.hud = {};
  for (const id of ids) {
    const el = document.querySelector('[data-testid="' + id + '"]');
    if (el) out.hud[id] = rect(el);
  }
  return out;
})()`;

/**
 * Runs in the page. Readability of the text over the scene on its own plate, against pure white
 * and pure black behind the plate, and any element that paints a large area.
 */
const READABILITY = `(() => {
  const parseShadowLayers = ${parseShadowLayers.toString()};
  const haloContrast = ${haloContrast.toString()};
  const parse = (c) => {
    const srgb = c.match(/color\\(srgb ([^)]+)\\)/);
    if (srgb) { const p = srgb[1].split(/[ \\/]+/).filter(Boolean).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 }; }
    const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (under, top) => ({ r: under.r * (1 - top.a) + top.r * top.a, g: under.g * (1 - top.a) + top.g * top.a, b: under.b * (1 - top.a) + top.b * top.a });
  const texts = { 'speed-value': 3, 'turn-distance': 3, 'speed-unit': 4.5, 'speed-source': 4.5, 'turn-instruction': 4.5, 'stat-remaining': 4.5, 'stat-eta': 4.5, 'local-time': 4.5, 'weather': 4.5, 'telemetry-note': 4.5, 'map-note': 4.5, 'turn-arrow': 4.5 };
  const out = { text: [], large: [], bare: [] };
  const SCENES = { white: [255, 255, 255], 'light sky': [188, 217, 238], black: [0, 0, 0] };
  for (const [id, need] of Object.entries(texts)) {
    const el = document.querySelector('[data-testid="' + id + '"]');
    if (!el || el.getBoundingClientRect().width === 0) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    let node = el, bg = null;
    while (node && node !== document.body) {
      const c = parse(getComputedStyle(node).backgroundColor);
      // Only a local fill counts as a plate. The page root's own background is the scene's.
      const box = node.getBoundingClientRect();
      if (c && c.a > 0 && box.width * box.height < 0.4 * innerWidth * innerHeight) { bg = c; break; }
      node = node.parentElement;
    }
    if (!bg) {
      // Bare on the scene: the glyph shadow is the only aid. The stroke is the font size times a
      // stem of 0.1 em (0.12 em from semibold), or 0.1 of the width for the 24 unit icon.
      const isIcon = id === 'turn-arrow';
      const stroke = isIcon ? el.getBoundingClientRect().width * 0.1 : parseFloat(cs.fontSize) * (Number(cs.fontWeight) >= 600 ? 0.12 : 0.1);
      const source = cs.textShadow !== 'none' && !isIcon ? cs.textShadow : cs.filter;
      const layers = parseShadowLayers(source === 'none' ? '' : source);
      const perScene = {};
      for (const [name, scene] of Object.entries(SCENES)) {
        perScene[name] = layers.length ? haloContrast([fg.r, fg.g, fg.b], scene, layers, stroke) : 1;
      }
      const worstName = Object.keys(perScene).sort((a, b) => perScene[a] - perScene[b])[0];
      out.bare.push({ id, need, layers: layers.length, stroke: Math.round(stroke * 100) / 100, perScene, worst: Math.round(perScene[worstName] * 100) / 100, worstScene: worstName });
      continue;
    }
    const worst = Math.min(ratio(fg, over({ r: 255, g: 255, b: 255 }, bg)), ratio(fg, over({ r: 0, g: 0, b: 0 }, bg)));
    out.text.push({ id, need, worst: Math.round(worst * 100) / 100, plate: bg.a });
  }
  // The navigation and status groups must stay plate free.
  out.plateFree = [];
  for (const id of ['navigation-panel', 'status-cluster']) {
    const el = document.querySelector('[data-testid="' + id + '"]');
    if (!el || el.getBoundingClientRect().width === 0) continue;
    const cs = getComputedStyle(el);
    const fill = parse(cs.backgroundColor);
    const problems = [];
    if (fill && fill.a > 0) problems.push('background fill');
    if (cs.backgroundImage !== 'none') problems.push('background image');
    if (['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(cs['border' + side + 'Width']) > 0 && cs['border' + side + 'Style'] !== 'none')) problems.push('border');
    if (cs.boxShadow !== 'none') problems.push('box shadow');
    if (cs.backdropFilter && cs.backdropFilter !== 'none') problems.push('backdrop filter');
    if (cs.textShadow === 'none') problems.push('no glyph shadow');
    out.plateFree.push({ id, problems });
  }
  const area = innerWidth * innerHeight;
  // The dev controls row is a development tool, never shown to riders, and can be nearly as wide
  // as the smallest screens.
  const skip = (el) => el.closest('[data-testid="scene"], .wl-map, [data-testid="attribution-slot"], [role="dialog"], .wl-rotate-overlay, [data-testid="dev-controls"]') || el.tagName === 'MAIN' || el.tagName === 'HTML' || el.tagName === 'BODY' || el.tagName === 'CANVAS';
  for (const el of document.querySelectorAll('main *, main')) {
    if (skip(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const fill = parse(cs.backgroundColor);
    const painted = (fill && fill.a > 0) || cs.backgroundImage !== 'none' || cs.boxShadow.includes('inset');
    if (!painted) continue;
    const r = el.getBoundingClientRect();
    const share = (Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0))) / area;
    const band = r.width > innerWidth * 0.97 && r.height > innerHeight * 0.08;
    if (share > 0.2 || band) out.large.push((el.getAttribute('data-testid') || el.className || el.tagName).toString().slice(0, 60) + ' ' + Math.round(share * 100) + '%');
  }
  return out;
})()`;

/** Problems from a READABILITY result. */
function readabilityProblems(result) {
  const problems = [];
  for (const t of result.text) {
    if (t.worst < t.need) problems.push(`${t.id} contrast ${t.worst} under ${t.need}`);
  }
  // The navigation and status text must be measured as bare glyphs, not as text on a plate.
  for (const id of ["speed-value", "local-time"]) {
    if (!result.bare.some((t) => t.id === id))
      problems.push(`${id} was not checked as a bare glyph`);
  }
  for (const t of result.bare) {
    if (t.layers === 0) problems.push(`${t.id} has no glyph shadow`);
    else if (t.worst < t.need)
      problems.push(`${t.id} shadow contrast ${t.worst} over ${t.worstScene} under ${t.need}`);
  }
  for (const g of result.plateFree) {
    for (const p of g.problems) problems.push(`${g.id} is not plate free: ${p}`);
  }
  for (const name of result.large) problems.push(`large painted area: ${name}`);
  return problems;
}

/** The lowest contrast seen per text id (and scene), for the summary at the end. */
const lowest = {};
const lowestBare = {};

const intersects = (a, b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;

const chrome = await launchChrome({
  // Set CDP_PORT when another script or worker already uses the default debugging port.
  port: Number(process.env.CDP_PORT ?? 9333),
  extraArgs: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
let failures = 0;
try {
  const page = await chrome.newPage();
  for (const acknowledged of [false, true]) {
    for (const dev of [false, true]) {
      for (const [w, h] of SIZES) {
        await page.setViewport(w, h);
        await page.call("Page.addScriptToEvaluateOnNewDocument", {
          source: acknowledged
            ? `localStorage.setItem("${NOTICE_KEY}", "1")`
            : `localStorage.removeItem("${NOTICE_KEY}")`,
        });
        await page.call("Page.addScriptToEvaluateOnNewDocument", {
          source: `window.__fakeCredits = ${process.env.FAKE_CREDITS === "1"}`,
        });
        const query = [
          dev ? "dev=1&time=night" : "",
          process.env.GPS ? `gps=${process.env.GPS}` : "",
        ]
          .filter(Boolean)
          .join("&");
        await page.navigate(`${base}/ride${query ? `?${query}` : ""}`);
        await sleep(1200);
        const m = await page.evaluate(MEASURE);
        const label = `${w}x${h} notice ${acknowledged ? "closed" : "open"} dev=${dev ? 1 : 0}`;
        const problems = [];
        if (!m.strip) problems.push("no credits strip");
        if (m.covered > 0)
          problems.push(`${m.covered} of ${m.probes} probe points in the strip are covered`);
        if (m.notice && m.strip && intersects(m.notice, m.strip))
          problems.push("notice overlaps the strip");
        if (acknowledged && m.notice) problems.push("notice still shown after acknowledging");
        if (!acknowledged && !m.notice) problems.push("notice missing");
        if (m.stripHeight !== undefined) {
          if (!m.logosVisible) problems.push("a credit logo is hidden or outside the strip");
          if (m.stripHeight > 40)
            problems.push(`credits strip is ${m.stripHeight}px tall (more than one line)`);
        }
        // Nothing on the HUD may sit on top of anything else: the stats overlay, the note, the
        // start prompt, the dev controls, the dock and every piece of text.
        const all = { ...m.hud, ...(m.stats ? { "map-stats": m.stats } : {}) };
        const names = Object.keys(all);
        for (let i = 0; i < names.length; i++) {
          for (let j = i + 1; j < names.length; j++) {
            const a = all[names[i]];
            const b = all[names[j]];
            if (a.w > 0 && a.h > 0 && b.w > 0 && b.h > 0 && intersects(a, b)) {
              problems.push(`${names[i]} overlaps ${names[j]}`);
            }
          }
        }
        // The map settings button is a 44 pixel target, and its open sheet may not cover the
        // credits strip (checked with the notice closed, when the sheet can be opened).
        const button = m.hud["map-settings-button"];
        if (!button) problems.push("map settings button missing");
        else if (button.w < 44 - 0.5 || button.h < 44 - 0.5)
          problems.push(`map settings button is ${button.w}x${button.h}px (under 44)`);
        if (acknowledged && button) {
          await page.evaluate(
            `document.querySelector('[data-testid="map-settings-button"]').click()`,
          );
          await sleep(300);
          const o = await page.evaluate(MEASURE);
          const sheet = await page.evaluate(
            `(() => { const e = document.querySelector('[data-testid="map-settings-sheet"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; })()`,
          );
          if (!sheet) problems.push("map settings sheet did not open");
          else {
            if (o.covered > 0) problems.push(`open sheet covers ${o.covered} strip probe points`);
            if (o.strip && intersects(sheet, o.strip))
              problems.push("open sheet overlaps the strip");
            // The dock (vehicle stats, End trip), the start prompt and the dev controls sit low, and
            // the sheet has to stop above them as well as above the strip.
            const leftHud = [
              "speed-value",
              "turn-distance",
              "turn-instruction",
              "dock",
              "start-prompt",
              "dev-controls",
            ];
            for (const id of leftHud) {
              const r = o.hud[id];
              if (r && r.w > 0 && intersects(sheet, r)) problems.push(`open sheet overlaps ${id}`);
            }
          }
          if (process.env.SHOTS_DIR) {
            await page.screenshot(
              join(process.env.SHOTS_DIR, `layout-${w}x${h}-sheet-dev${dev ? 1 : 0}.png`),
            );
          }
          await page.evaluate(
            `document.querySelector('[data-testid="map-settings-close"]')?.click()`,
          );
        }
        if (process.env.SHOTS_DIR) {
          await page.screenshot(
            join(
              process.env.SHOTS_DIR,
              `layout-${w}x${h}-${acknowledged ? "closed" : "open"}-dev${dev ? 1 : 0}.png`,
            ),
          );
        }
        // Readability and large areas on the start screen, then the same while riding.
        const idle = await page.evaluate(READABILITY);
        problems.push(...readabilityProblems(idle).map((p) => `start: ${p}`));
        if (acknowledged) {
          await page.evaluate(`document.querySelector('[data-testid="start-trip"]')?.click()`);
          await sleep(1500);
          const r = await page.evaluate(MEASURE);
          const riding = { ...r.hud, ...(r.stats ? { "map-stats": r.stats } : {}) };
          const keys = Object.keys(riding);
          for (let i = 0; i < keys.length; i++) {
            for (let j = i + 1; j < keys.length; j++) {
              const a = riding[keys[i]];
              const b = riding[keys[j]];
              if (a.w > 0 && a.h > 0 && b.w > 0 && b.h > 0 && intersects(a, b)) {
                problems.push(`riding: ${keys[i]} overlaps ${keys[j]}`);
              }
            }
          }
          if (r.covered > 0) problems.push(`riding: ${r.covered} strip probe points covered`);
          const read = await page.evaluate(READABILITY);
          problems.push(...readabilityProblems(read).map((p) => `riding: ${p}`));
          for (const t of read.text) {
            if (lowest[t.id] === undefined || t.worst < lowest[t.id]) lowest[t.id] = t.worst;
          }
          for (const t of read.bare) {
            const seen = (lowestBare[t.id] ??= {});
            for (const [scene, value] of Object.entries(t.perScene)) {
              const rounded = Math.round(value * 100) / 100;
              if (seen[scene] === undefined || rounded < seen[scene]) seen[scene] = rounded;
            }
          }
          if (process.env.SHOTS_DIR) {
            await page.screenshot(
              join(process.env.SHOTS_DIR, `layout-${w}x${h}-riding-dev${dev ? 1 : 0}.png`),
            );
          }
        }
        console.log(
          `${problems.length ? "FAIL" : "ok  "} ${label}${problems.length ? ": " + problems.join("; ") : ""}`,
        );
        failures += problems.length;
      }
    }
  }
} finally {
  await chrome.close();
}
console.log(
  "lowest contrast of text on a plate over white or black, riding: " +
    Object.entries(lowest)
      .map(([id, v]) => `${id} ${v}`)
      .join(", "),
);
console.log("lowest contrast of bare glyphs with the shadow, riding (white / light sky / black):");
for (const [id, scenes] of Object.entries(lowestBare)) {
  console.log(`  ${id}: ${scenes.white} / ${scenes["light sky"]} / ${scenes.black}`);
}
if (failures > 0) {
  console.error(`${failures} problem(s)`);
  process.exit(1);
}
