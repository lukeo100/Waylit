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

  it("has a muted warning amber that reads on the dark background, and a separate red", () => {
    const rgb = (hex: string): [number, number, number] => [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ];
    const luminance = (hex: string): number => {
      const [r = 0, g = 0, b = 0] = rgb(hex).map((c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [r, g, b] = rgb(color.caution);
    // Amber: red high, green a little lower, blue much lower.
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b + 40);
    expect(r - g).toBeLessThan(80);
    const contrast = (luminance(color.caution) + 0.05) / (luminance(color.night950) + 0.05);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    expect(color.caution).not.toBe(color.danger);
  });

  it("keeps touch targets at 44 pixels or more", () => {
    expect(Number.parseInt(touch.min, 10)).toBeGreaterThanOrEqual(44);
  });
});
