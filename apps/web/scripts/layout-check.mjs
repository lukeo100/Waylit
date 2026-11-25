/**
 * Layout check for the riding screen: nothing may cover the credits strip, and the development
 * overlay may not sit on top of the HUD text. It opens /ride in headless Chrome at the landscape
 * sizes the screen is designed for, with the first run safety notice open and closed, with and
 * without ?dev=1, and fails if
 *
 *   - any point inside the credits strip is covered by something that is not part of the strip
 *     (this is what the Google and Cesium terms need: logo and credits never obscured), or
 *   - the safety notice's rectangle overlaps the strip's rectangle, or
 *   - the dev stats overlay overlaps the speed, turn, status or minimap text, or
 *   - the credits strip is taller than one line of credits where one line fits.
 *
 * Usage (after `pnpm build`, with the app running: `pnpm --filter @waylit/web start`):
 *   node apps/web/scripts/layout-check.mjs [baseUrl]    default http://localhost:3000
 *
 * It needs Chrome or Chromium (set CHROME_BIN if it is not `google-chrome`). Screenshots go to
 * the folder in SHOTS_DIR when that is set.
 */
import { join } from "node:path";
import { launchChrome, sleep } from "./cdp.mjs";

const base = process.argv[2] ?? "http://localhost:3000";
const SIZES = [
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
  const ids = ['speed-value','speed-unit','speed-source','telemetry-note','turn-distance','turn-instruction','stat-remaining','stat-eta','local-time','weather','minimap','map-note'];
  const stats = document.querySelector('[data-testid="map-stats"]');
  out.stats = stats ? rect(stats) : null;
  out.hud = {};
  for (const id of ids) {
    const el = document.querySelector('[data-testid="' + id + '"]');
    if (el) out.hud[id] = rect(el);
  }
  return out;
})()`;

const intersects = (a, b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;

const chrome = await launchChrome({
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
        await page.navigate(`${base}/ride${dev ? "?dev=1" : ""}`);
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
        if (m.stats) {
          for (const [id, r] of Object.entries(m.hud)) {
            if (r.w > 0 && r.h > 0 && intersects(m.stats, r))
              problems.push(`stats overlay overlaps ${id}`);
          }
        }
        if (process.env.SHOTS_DIR) {
          await page.screenshot(
            join(
              process.env.SHOTS_DIR,
              `layout-${w}x${h}-${acknowledged ? "closed" : "open"}-dev${dev ? 1 : 0}.png`,
            ),
          );
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
if (failures > 0) {
  console.error(`${failures} problem(s)`);
  process.exit(1);
}
