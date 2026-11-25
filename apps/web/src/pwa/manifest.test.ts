import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { color, toCssVariables } from "@waylit/ui-tokens";
import manifest from "../app/manifest";
import { readPublic } from "./test-helpers";

const publicPath = (url: string) => fileURLToPath(new URL(`../../public${url}`, import.meta.url));

function pngSize(path: string): { width: number; height: number } {
  const data = readFileSync(path);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

describe("web app manifest", () => {
  const m = manifest();

  it("describes a fullscreen landscape app that falls back to standalone", () => {
    expect(m.name).toBe("Waylit");
    expect(m.display).toBe("fullscreen");
    expect(m.display_override).toEqual(["fullscreen", "standalone"]);
    expect(m.orientation).toBe("landscape");
    expect(m.start_url).toBeTruthy();
    expect(m.scope).toBe("/");
  });

  it("starts inside its scope", () => {
    expect(m.start_url?.startsWith(m.scope ?? "/")).toBe(true);
  });

  it("takes its colours from the design tokens", () => {
    expect(m.theme_color).toBe(color.night950);
    expect(m.background_color).toBe(color.night950);
  });

  it("has any and maskable icons at 192 and 512 that exist with the right size", () => {
    const icons = m.icons ?? [];
    for (const purpose of ["any", "maskable"] as const) {
      for (const size of [192, 512]) {
        const icon = icons.find((i) => i.purpose === purpose && i.sizes === `${size}x${size}`);
        if (!icon) throw new Error(`missing ${purpose} icon at ${size}`);
        const path = publicPath(icon.src);
        expect(existsSync(path)).toBe(true);
        expect(pngSize(path)).toEqual({ width: size, height: size });
      }
    }
  });
});

describe("offline page", () => {
  const html = readPublic("offline.html");

  it("uses the same token values as the design system", () => {
    const tokens = toCssVariables();
    const declared = [...html.matchAll(/(--wl-[a-z0-9-]+)\s*:\s*([^;]+);/g)];
    expect(declared.length).toBeGreaterThan(5);
    for (const [, name = "", value = ""] of declared) {
      expect(tokens[name], name).toBeDefined();
      expect(value.replace(/\s+/g, " ").trim(), name).toBe(tokens[name]);
    }
  });

  it("is self contained: no scripts and no external requests", () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).toMatch(/viewport-fit=cover/);
  });
});
