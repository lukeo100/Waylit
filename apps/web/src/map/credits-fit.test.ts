import { describe, expect, it } from "vitest";
import { CREDITS_EXPAND_MARGIN_PX, nextCreditsMode } from "./credits-fit";

describe("nextCreditsMode", () => {
  it("keeps the text inline while it fits", () => {
    expect(
      nextCreditsMode({
        mode: "inline",
        textOverflows: false,
        widthPx: 640,
        collapsedAtWidthPx: undefined,
      }),
    ).toBe("inline");
  });

  it("moves the text behind the data attribution link when it does not fit", () => {
    expect(
      nextCreditsMode({
        mode: "inline",
        textOverflows: true,
        widthPx: 640,
        collapsedAtWidthPx: undefined,
      }),
    ).toBe("link");
  });

  it("stays collapsed until the strip is clearly wider, so it does not flicker", () => {
    const base = { mode: "link", textOverflows: false, collapsedAtWidthPx: 640 } as const;
    expect(nextCreditsMode({ ...base, widthPx: 700 })).toBe("link");
    expect(nextCreditsMode({ ...base, widthPx: 640 + CREDITS_EXPAND_MARGIN_PX - 1 })).toBe("link");
    expect(nextCreditsMode({ ...base, widthPx: 640 + CREDITS_EXPAND_MARGIN_PX })).toBe("inline");
  });
});
