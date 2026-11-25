import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fxFragmentShader } from "@/map/fx-shader";
import { shadow, tokens } from "@waylit/ui-tokens";

/**
 * Guard for the HUD redesign: the riding screen must never again lay a darkening layer over the
 * scene. A rider found the old daylight scrim (a dark gradient over the top 60 percent of the
 * screen) and the post process vignette jarring, so readability now comes only from local aids:
 * small plates behind text, glass behind controls and a two pixel text edge.
 *
 * This test fails if a full screen or screen wide gradient, scrim or vignette is added back to
 * the CSS, to the riding screen's components, to the design tokens or to the scene's post
 * process. A new gradient anywhere in the app's CSS has to be added to the allow list below with
 * a reason, which makes the choice visible in review.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const css = readFileSync(join(SRC, "app/globals.css"), "utf8");

/** Innermost CSS rules as selector and body. Good enough for this file, which has no strings with braces. */
function cssRules(text: string): { selector: string; body: string }[] {
  const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? "").trim(),
    body: m[2] ?? "",
  }));
}

/**
 * Gradients that are allowed, and why. None of them is on the riding screen's HUD layer.
 */
const GRADIENT_ALLOWED: Record<string, string> = {
  ".wl-corridor::after": "home page decoration, not the riding screen",
  ".wl-corridor-road": "home page decoration, not the riding screen",
  ".wl-scene": "the placeholder scene itself, drawn behind the 3D canvas, never over it",
  ".wl-scanband": "the hologram scan band (Amendment 7): additive cyan light, never darkening",
};

/** Rules that may cover the whole screen with a solid fill, and why. */
const FULL_SCREEN_FILL_ALLOWED: Record<string, string> = {
  ".wl-rotate-overlay": "the rotate prompt, shown only in portrait instead of the ride",
  ".wl-scene": "the placeholder scene itself, behind the 3D canvas",
  ".wl-corridor::after": "home page decoration, not the riding screen",
  ".wl-corridor-road": "home page decoration, inside its own perspective plane",
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

describe("no screen wide darkening on the riding screen", () => {
  it("has no scrim or vignette class in the CSS", () => {
    for (const rule of cssRules(css)) {
      expect(rule.selector).not.toMatch(/scrim|vignette|shade|overlay-dark/i);
    }
  });

  it("allows a CSS gradient only where the allow list says why", () => {
    const found = cssRules(css)
      .filter((rule) => /gradient\(/.test(rule.body))
      .map((rule) => rule.selector);
    for (const selector of found) {
      expect(Object.keys(GRADIENT_ALLOWED), `new gradient in ${selector}`).toContain(selector);
    }
  });

  it("lets nothing but the allow list fill the whole screen", () => {
    for (const rule of cssRules(css)) {
      const full = /(^|;)\s*inset:\s*0\s*;/.test(rule.body);
      const fill = /background(-color)?:\s*(?!transparent)[^;]+;/.test(rule.body);
      if (full && fill) {
        expect(Object.keys(FULL_SCREEN_FILL_ALLOWED), rule.selector).toContain(rule.selector);
      }
    }
  });

  it("keeps the plates free of gradients and blur", () => {
    const plate = cssRules(css).find((rule) => rule.selector === ".wl-plate");
    expect(plate).toBeDefined();
    expect(plate?.body).not.toMatch(/gradient|blur|filter|inset/);
  });

  it("uses no gradient or scrim in the app's components", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file);
      // The dev preview pages and the home page decoration are not the riding screen.
      if (rel.startsWith("app/dev/") || rel === "components/Corridor.tsx") continue;
      const text = readFileSync(file, "utf8");
      if (/(linear|radial|conic)-gradient\(|\bbg-(linear|radial|conic|gradient)-/.test(text)) {
        offenders.push(`${rel}: gradient`);
      }
      if (/wl-scrim|data-testid="scrim"|vignette\s*[:=]/.test(text)) {
        offenders.push(`${rel}: scrim or vignette`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no scrim or vignette token", () => {
    expect(Object.keys(tokens)).not.toContain("scrim");
    expect(Object.keys(tokens)).not.toContain("vignette");
  });

  it("keeps the text shadow tight: no blur over 2 pixels", () => {
    // Each layer is "x y blur colour". The third length is the blur radius.
    const blurs = shadow.text
      .split(/,(?![^(]*\))/)
      .map((layer) => layer.trim().split(/\s+/))
      .map((parts) => Number.parseFloat(parts[2] ?? "NaN"));
    expect(blurs.length).toBeGreaterThan(0);
    for (const blur of blurs) {
      expect(Number.isFinite(blur)).toBe(true);
      expect(blur).toBeLessThanOrEqual(2);
    }
  });

  it("keeps the scene's post process free of a vignette", () => {
    for (const variant of [1, 2] as const) {
      expect(fxFragmentShader(variant)).not.toMatch(/vignette|haze|length\(\s*\(?\s*uv\s*-/i);
    }
  });
});
