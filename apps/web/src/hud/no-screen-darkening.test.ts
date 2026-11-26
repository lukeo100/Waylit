import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fxFragmentShader } from "@/map/fx-shader";
import { shadow, tokens } from "@waylit/ui-tokens";
import { parseDropShadows, parseTextShadow, type ShadowLayer } from "./readability";

/**
 * Guard for the HUD redesign: the riding screen must never again lay a darkening layer over the
 * scene. A rider found the old daylight scrim (a dark gradient over the top 60 percent of the
 * screen) and the post process vignette jarring, so readability now comes only from local aids:
 * glass behind controls, a few small plates, and, for the top left navigation text and the top
 * right status text, a shadow that follows the glyphs and nothing else (no plate, no box).
 *
 * That shadow may be soft but not wide: no layer blurs past 12 pixels, none is offset more than
 * 2 pixels and none is more than 0.9 opaque. The numbers live in the tokens, the CSS only refers
 * to them, and a test below fails when a layer goes past the cap.
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

const SHADOW_LIMITS = { blurPx: 12, offsetPx: 2, alpha: 0.9 } as const;

/** What is over the cap in a list of local shadow layers (empty when all are within it). */
function shadowProblems(layers: readonly ShadowLayer[]): string[] {
  const problems: string[] = [];
  for (const layer of layers) {
    if (layer.blur > SHADOW_LIMITS.blurPx) problems.push(`blur ${layer.blur}px`);
    if (Math.max(Math.abs(layer.x), Math.abs(layer.y)) > SHADOW_LIMITS.offsetPx)
      problems.push(`offset ${layer.x}px ${layer.y}px`);
    if (layer.alpha > SHADOW_LIMITS.alpha) problems.push(`alpha ${layer.alpha}`);
  }
  return problems;
}

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

  it("caps the local glyph shadow: blur at most 12 px, offset at most 2 px, at most 0.9 opaque", () => {
    const sets: Record<string, ShadowLayer[]> = {
      "shadow.text": parseTextShadow(shadow.text),
      "shadow.scene": parseTextShadow(shadow.scene),
      "shadow.sceneIcon": parseDropShadows(shadow.sceneIcon),
    };
    const expectedCount: Record<string, number> = {
      "shadow.text": shadow.text.split("rgba(").length - 1,
      "shadow.scene": shadow.scene.split("rgba(").length - 1,
      "shadow.sceneIcon": shadow.sceneIcon.split("rgba(").length - 1,
    };
    for (const [name, layers] of Object.entries(sets)) {
      // A layer the parser could not read would slip past the cap, so count them.
      expect(layers.length, `${name} layers parsed`).toBe(expectedCount[name]);
      expect(layers.length).toBeGreaterThan(0);
      expect(shadowProblems(layers), name).toEqual([]);
    }
  });

  it("fails when a layer goes past the cap", () => {
    expect(shadowProblems(parseTextShadow("0 0 12px rgba(0, 0, 0, 0.5)"))).toEqual([]);
    expect(shadowProblems(parseTextShadow("0 0 13px rgba(0, 0, 0, 0.5)"))).toHaveLength(1);
    expect(shadowProblems(parseTextShadow("0 0 40px rgba(0, 0, 0, 0.5)"))).toHaveLength(1);
    expect(shadowProblems(parseTextShadow("3px 0 2px rgba(0, 0, 0, 0.5)"))).toHaveLength(1);
    expect(shadowProblems(parseTextShadow("0 0 8px rgba(0, 0, 0, 0.95)"))).toHaveLength(1);
    expect(
      shadowProblems(parseDropShadows("drop-shadow(0 0 20px rgba(0, 0, 0, 0.5))")),
    ).toHaveLength(1);
  });

  it("applies the glyph shadow only through the tokens, so the cap cannot be dodged", () => {
    for (const selector of [".wl-hud-text", ".wl-hud-shadow", ".wl-hud-icon"]) {
      const rule = cssRules(css).find((r) => r.selector === selector);
      expect(rule, selector).toBeDefined();
      expect(rule?.body).toMatch(/(text-shadow|filter):\s*var\(--wl-shadow-[a-z-]+\);/);
      expect(rule?.body).not.toMatch(/\d+(px|em|rem)/);
      expect(rule?.body).not.toMatch(
        /background|border|box-shadow|backdrop-filter|gradient|inset|width|height/,
      );
    }
  });

  it("has no backdrop filter and no box shadow on the HUD's own rules or components", () => {
    // The only box shadows in the app CSS are the keyboard focus ring and the home page
    // decoration, neither on the riding screen's top HUD.
    expect(css).not.toMatch(/backdrop-filter/);
    for (const selector of [".wl-plate", ".wl-hud-text", ".wl-hud-shadow", ".wl-hud-icon"]) {
      const rule = cssRules(css).find((r) => r.selector === selector);
      expect(rule?.body, selector).not.toMatch(/box-shadow|backdrop-filter/);
    }
    for (const file of sourceFiles(join(SRC, "hud")).filter((f) => f.endsWith(".tsx"))) {
      expect(readFileSync(file, "utf8"), relative(SRC, file)).not.toMatch(
        /backdrop-|\bshadow-|drop-shadow-|text-shadow|box-shadow|\bblur-/,
      );
    }
  });

  it("leaves no plate, fill, border or box on the top left navigation and the top right status", () => {
    for (const name of ["NavigationPanel", "StatusCluster"]) {
      const source = readFileSync(join(SRC, "hud", `${name}.tsx`), "utf8");
      const classes = [...source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)]
        .flatMap((m) => (m[1] ?? m[2] ?? "").split(/\s+/))
        .map((c) => c.replace(/^\$\{.*$/, ""))
        .filter(Boolean);
      expect(classes.length).toBeGreaterThan(5);
      for (const cls of classes) {
        // The 7 pixel connectivity dot is the one filled shape: a status light, not a plate.
        if (cls === "bg-ok" || cls === "bg-caution" || cls === "rounded-full") continue;
        expect(cls, `${name}: ${cls}`).not.toMatch(
          /^(wl-plate|wl-glass|bg-|border|rounded|ring|outline|shadow|backdrop|from-|via-|to-)/,
        );
      }
      expect(classes).toContain("wl-hud-shadow");
    }
  });

  it("keeps the scene's post process free of a vignette", () => {
    for (const variant of [1, 2] as const) {
      expect(fxFragmentShader(variant)).not.toMatch(/vignette|haze|length\(\s*\(?\s*uv\s*-/i);
    }
  });
});
