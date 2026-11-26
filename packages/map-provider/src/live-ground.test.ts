import { describe, expect, it } from "vitest";
import type { GroundHeightSource } from "./ground-height";
import { LiveGroundEstimator } from "./live-ground";

const fb = 85;

describe("LiveGroundEstimator", () => {
  it("uses the fallback until enough good samples, then the phone", () => {
    const g = new LiveGroundEstimator({ fallbackMetres: fb });
    expect(g.heightAt()).toBe(fb);
    expect(g.source).toBe("fallback");
    g.addSample(300, 8, 0);
    g.addSample(300, 8, 1000);
    expect(g.source).toBe("fallback");
    g.addSample(300, 8, 2000);
    expect(g.source).toBe("phone");
    // Phone height less the 1.2 m the phone sits above the ground.
    expect(g.heightAt()).toBeCloseTo(298.8, 6);
  });

  it("ignores samples with unknown or poor altitude accuracy, and bad numbers", () => {
    const g = new LiveGroundEstimator({ fallbackMetres: fb });
    for (let t = 0; t < 10; t++) {
      g.addSample(500, undefined, t * 1000);
      g.addSample(500, 45, t * 1000);
      g.addSample(Number.NaN, 5, t * 1000);
      g.addSample(undefined, 5, t * 1000);
    }
    expect(g.source).toBe("fallback");
    expect(g.heightAt()).toBe(fb);
  });

  it("is a slow average that cannot jump", () => {
    const g = new LiveGroundEstimator({ fallbackMetres: fb });
    for (let t = 0; t < 5; t++) g.addSample(100, 5, t * 1000);
    const before = g.heightAt();
    // A 30 m jump (inside the outlier limit) is eased in at no more than 1 m per second.
    g.addSample(130, 5, 5000);
    expect(g.heightAt() - before).toBeLessThanOrEqual(1.0001);
    expect(g.heightAt()).toBeGreaterThan(before);
  });

  it("ignores a sample far from the estimate", () => {
    const g = new LiveGroundEstimator({ fallbackMetres: fb });
    for (let t = 0; t < 5; t++) g.addSample(100, 5, t * 1000);
    const before = g.heightAt();
    g.addSample(900, 5, 6000);
    expect(g.heightAt()).toBe(before);
  });

  it("clamps to a sane range", () => {
    const g = new LiveGroundEstimator({ fallbackMetres: fb });
    for (let t = 0; t < 5; t++) g.addSample(3010, 5, t * 1000);
    expect(g.heightAt()).toBe(3000);
    const low = new LiveGroundEstimator({ fallbackMetres: fb });
    for (let t = 0; t < 5; t++) low.addSample(-110, 5, t * 1000);
    expect(low.heightAt()).toBe(-100);
  });

  it("follows a long climb at the slew limit", () => {
    const g = new LiveGroundEstimator({ fallbackMetres: fb });
    for (let t = 0; t < 4; t++) g.addSample(100, 5, t * 1000);
    let altitude = 100;
    for (let t = 4; t < 400; t++) {
      altitude += 0.1;
      g.addSample(altitude, 5, t * 1000);
    }
    // The phone climbed about 40 m. The estimate has followed most of it, not all, and not faster.
    expect(g.heightAt()).toBeGreaterThan(130);
    expect(g.heightAt()).toBeLessThan(altitude);
  });

  it("takes a new fallback, and forgets the phone on reset", () => {
    const g = new LiveGroundEstimator({ fallbackMetres: fb });
    g.setFallback(10);
    expect(g.heightAt()).toBe(10);
    for (let t = 0; t < 4; t++) g.addSample(100, 5, t * 1000);
    expect(g.source).toBe("phone");
    g.reset();
    expect(g.source).toBe("fallback");
    expect(g.heightAt()).toBe(10);
  });

  it("never needs a position, so it cannot read anything from tiles", () => {
    const g = new LiveGroundEstimator({ fallbackMetres: fb });
    const asSource: GroundHeightSource = g;
    expect(asSource.heightAt({ lat: 1, lng: 2 })).toBe(fb);
    expect(g.heightAt.length).toBe(0);
  });
});
