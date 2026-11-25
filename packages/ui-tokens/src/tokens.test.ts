import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CSS_VAR_PREFIX, toCssVariables } from "./css";
import { color, glow, touch } from "./tokens";

const cssPath = fileURLToPath(new URL("./tokens.css", import.meta.url));

function parseCssVariables(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const pattern = new RegExp(`(${CSS_VAR_PREFIX}-[a-z0-9-]+)\\s*:\\s*([^;]+);`, "g");
  for (const match of css.matchAll(pattern)) {
    const [, name, value] = match;
    if (name && value) out[name] = value.replace(/\s+/g, " ").trim();
  }
  return out;
}

describe("design tokens", () => {
  it("tokens.css matches tokens.ts exactly", () => {
    const fromCss = parseCssVariables(readFileSync(cssPath, "utf8"));
    expect(fromCss).toEqual(toCssVariables());
  });

  it("uses kebab-case names", () => {
    const vars = toCssVariables();
    expect(vars["--wl-color-night-950"]).toBe("#05070b");
    expect(vars["--wl-color-cyan-soft"]).toBe("#a5dff0");
    expect(vars["--wl-font-size-2xl"]).toBe("1.953rem");
  });

  it("has one accent colour and no second blue", () => {
    expect(color.cyan).toBe("#5fc8e8");
    expect(Object.keys(color).filter((name) => name.startsWith("volt"))).toEqual([]);
    expect(Object.keys(glow)).not.toContain("volt");
  });

  it("makes panels more solid in daylight than at night, around 85 percent in between", () => {
    const alpha = (value: string): number => Number(/,\s*([0-9.]+)\)$/.exec(value)?.[1]);
    expect(alpha(color.glassNight)).toBeLessThan(alpha(color.glass));
    expect(alpha(color.glass)).toBeLessThan(alpha(color.glassDay));
    expect(alpha(color.glass)).toBeCloseTo(0.85, 2);
  });

  it("keeps touch targets at 44 pixels or more", () => {
    expect(Number.parseInt(touch.min, 10)).toBeGreaterThanOrEqual(44);
  });
});
