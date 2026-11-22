import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CSS_VAR_PREFIX, toCssVariables } from "./css";

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
    expect(vars["--wl-color-night-950"]).toBe("#05080f");
    expect(vars["--wl-color-volt-soft"]).toBe("#7fb6ff");
    expect(vars["--wl-font-size-2xl"]).toBe("1.953rem");
  });
});
