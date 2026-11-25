import { describe, expect, it, vi } from "vitest";
import { enterFullscreen, exitFullscreen, type FullscreenDocumentLike } from "./fullscreen";

function fakeDocument(
  request: () => Promise<void> = () => Promise.resolve(),
  fullscreenElement: unknown = null,
  exit: () => Promise<void> = () => Promise.resolve(),
) {
  const requestFullscreen = vi.fn(request);
  const exitFullscreen = vi.fn(exit);
  const doc: FullscreenDocumentLike = {
    fullscreenElement,
    documentElement: { requestFullscreen },
    exitFullscreen,
  };
  return { doc, requestFullscreen, exitFullscreen };
}

describe("enterFullscreen", () => {
  it("requests fullscreen for the page and hides navigation UI", async () => {
    const { doc, requestFullscreen } = fakeDocument();
    expect(await enterFullscreen({ document: doc, displayModeFullscreen: false })).toBe(true);
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: "hide" });
  });

  it("does nothing when the app is already fullscreen through its manifest", async () => {
    const { doc, requestFullscreen } = fakeDocument();
    expect(await enterFullscreen({ document: doc, displayModeFullscreen: true })).toBe(false);
    expect(requestFullscreen).not.toHaveBeenCalled();
  });

  it("does nothing when the page is already fullscreen", async () => {
    const { doc, requestFullscreen } = fakeDocument(() => Promise.resolve(), {});
    expect(await enterFullscreen({ document: doc, displayModeFullscreen: false })).toBe(false);
    expect(requestFullscreen).not.toHaveBeenCalled();
  });

  it("does nothing when the API is missing", async () => {
    expect(await enterFullscreen({ displayModeFullscreen: false })).toBe(false);
    expect(await enterFullscreen({ document: {}, displayModeFullscreen: false })).toBe(false);
    expect(
      await enterFullscreen({ document: { documentElement: {} }, displayModeFullscreen: false }),
    ).toBe(false);
  });

  it("fails silently when the browser refuses", async () => {
    const { doc } = fakeDocument(() => Promise.reject(new Error("TypeError")));
    expect(await enterFullscreen({ document: doc, displayModeFullscreen: false })).toBe(false);
  });
});

describe("exitFullscreen", () => {
  it("leaves fullscreen that the API entered", async () => {
    const { doc, exitFullscreen: exit } = fakeDocument(() => Promise.resolve(), {});
    expect(await exitFullscreen({ document: doc, displayModeFullscreen: false })).toBe(true);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the page is not in API fullscreen", async () => {
    const { doc, exitFullscreen: exit } = fakeDocument();
    expect(await exitFullscreen({ document: doc, displayModeFullscreen: true })).toBe(false);
    expect(await exitFullscreen({ displayModeFullscreen: false })).toBe(false);
    expect(exit).not.toHaveBeenCalled();
  });

  it("fails silently when the browser refuses", async () => {
    const { doc } = fakeDocument(
      () => Promise.resolve(),
      {},
      () => Promise.reject(new Error("TypeError")),
    );
    expect(await exitFullscreen({ document: doc, displayModeFullscreen: false })).toBe(false);
  });
});
