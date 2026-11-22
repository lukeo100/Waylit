import { describe, expect, it, vi } from "vitest";
import { tryLockLandscape } from "./orientation";

describe("tryLockLandscape", () => {
  it("does nothing outside an installed app", async () => {
    const lock = vi.fn(() => Promise.resolve());
    const result = await tryLockLandscape({ screen: { orientation: { lock } }, standalone: false });
    expect(result).toBe(false);
    expect(lock).not.toHaveBeenCalled();
  });

  it("does nothing when the API is missing", async () => {
    expect(await tryLockLandscape({ screen: {}, standalone: true })).toBe(false);
    expect(await tryLockLandscape({ screen: undefined, standalone: true })).toBe(false);
  });

  it("locks to landscape in standalone", async () => {
    const lock = vi.fn(() => Promise.resolve());
    const result = await tryLockLandscape({ screen: { orientation: { lock } }, standalone: true });
    expect(result).toBe(true);
    expect(lock).toHaveBeenCalledWith("landscape");
  });

  it("fails silently when the browser refuses", async () => {
    const lock = vi.fn(() => Promise.reject(new Error("NotSupportedError")));
    const result = await tryLockLandscape({ screen: { orientation: { lock } }, standalone: true });
    expect(result).toBe(false);
  });
});
