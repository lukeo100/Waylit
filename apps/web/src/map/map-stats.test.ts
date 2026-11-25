import { describe, expect, it } from "vitest";
import { formatRideTime } from "./MapStats";

describe("formatRideTime", () => {
  it("shows minutes and seconds", () => {
    expect(formatRideTime(0)).toBe("0:00");
    expect(formatRideTime(247.9)).toBe("4:07");
    expect(formatRideTime(300)).toBe("5:00");
    expect(formatRideTime(-3)).toBe("0:00");
  });
});
