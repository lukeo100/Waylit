import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

export const publicFile = (name: string) =>
  fileURLToPath(new URL(`../../public/${name}`, import.meta.url));
export const readPublic = (name: string) => readFileSync(publicFile(name), "utf8");

interface Strategy {
  VERSION: string;
  CACHES: { shell: string; static: string; pages: string };
  PRECACHE_URLS: string[];
  OFFLINE_URL: string;
  classifyRequest(
    input: { url: string; method?: string; mode?: string; headers?: Record<string, string> },
    origin: string,
  ): "navigation" | "static" | "bypass";
  isCacheableResponse(response: { status: number; type: string } | null): boolean;
  keysToEvict(keys: string[], max: number): string[];
  staleCacheNames(names: string[]): string[];
  acceptableWarmUrls(urls: unknown, origin: string): string[];
}

/** Loads the real classic script in a sandbox, the way a worker would. */
export function loadStrategy(): Strategy {
  const sandbox: { WaylitSwStrategy?: Strategy } = {};
  vm.runInNewContext(readPublic("sw-strategy.js"), { self: sandbox, URL });
  if (!sandbox.WaylitSwStrategy) throw new Error("sw-strategy.js did not export WaylitSwStrategy");
  return sandbox.WaylitSwStrategy;
}
