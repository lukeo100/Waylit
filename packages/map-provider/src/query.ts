/**
 * A tiny query string reader. Shared packages must not rely on DOM globals, and
 * `URLSearchParams` is not complete on every platform a native app may run on.
 */
export function readQuery(search: string): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  const text = search.startsWith("?") ? search.slice(1) : search;
  if (text === "") return result;
  for (const part of text.split("&")) {
    if (part === "") continue;
    const equals = part.indexOf("=");
    const rawKey = equals === -1 ? part : part.slice(0, equals);
    const rawValue = equals === -1 ? "" : part.slice(equals + 1);
    const key = safeDecode(rawKey);
    // The first value wins, like URLSearchParams.get.
    if (!result.has(key)) result.set(key, safeDecode(rawValue));
  }
  return result;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}
