import { tokens } from "./tokens";

/** Prefix for every Waylit CSS custom property. */
export const CSS_VAR_PREFIX = "--wl";

const kebab = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([a-z])([0-9])/g, "$1-$2")
    .toLowerCase();

/**
 * Flattens the token tree into CSS custom property names and values,
 * for example color.voltSoft becomes --wl-color-volt-soft.
 */
export function toCssVariables(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [group, values] of Object.entries(tokens)) {
    for (const [key, value] of Object.entries(values as Record<string, string>)) {
      out[`${CSS_VAR_PREFIX}-${kebab(group)}-${kebab(key)}`] = value;
    }
  }
  return out;
}
