import { bearingDegrees, haversineDistance, toLocalMetres, type LatLng } from "@waylit/core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_FOLLOW_PROFILE,
  FollowCamera,
  framing,
  longSideFovDegrees,
  rigGeometry,
} from "./follow-camera";

const START: LatLng = { lat: 52.4709, lng: 13.3995 };
// About 111.2 km per degree of latitude.
const METRES_PER_DEGREE = 111_195;

function northOf(origin: LatLng, metres: number): LatLng {
  return { lat: origin.lat + metres / METRES_PER_DEGREE, lng: origin.lng };
}

/** Steps the camera every `stepMs` from `fromMs` up to (not including) `toMs`. Returns the last pose. */
function run(camera: FollowCamera, fromMs: number, toMs: number, stepMs = 1000 / 30) {
  let pose;
  for (let t = fromMs; t < toMs; t += stepMs) pose = camera.step(t);
  return pose;
}

describe("rig geometry and framing", () => {
  it("puts the rider in the lower middle and the horizon in the upper third", () => {
    const { riderY, horizonY } = framing(DEFAULT_FOLLOW_PROFILE);
    // Lower middle: below the centre, but clear of the dock along the bottom.
    expect(riderY).toBeGreaterThan(0.6);
    expect(riderY).toBeLessThan(0.74);
    // Upper third.
    expect(horizonY).toBeGreaterThan(0.15);
    expect(horizonY).toBeLessThan(1 / 3);
  });

  it("keeps that framing at the top speed of a scooter (25 km/h)", () => {
    const { riderY, horizonY } = framing(DEFAULT_FOLLOW_PROFILE, 25 / 3.6);
    expect(riderY).toBeGreaterThan(0.58);
    expect(riderY).toBeLessThan(0.76);
    expect(horizonY).toBeLessThan(1 / 3);
  });

  it("looks down at a shallow angle with the camera behind and above", () => {
    const { pitchDegrees, rangeMetres, behindMetres } = rigGeometry(DEFAULT_FOLLOW_PROFILE);
    expect(pitchDegrees).toBeGreaterThan(5);
    expect(pitchDegrees).toBeLessThan(25);
    expect(behindMetres).toBe(DEFAULT_FOLLOW_PROFILE.distanceBehindMetres);
    expect(rangeMetres).toBeCloseTo(
      Math.hypot(
        DEFAULT_FOLLOW_PROFILE.distanceBehindMetres + DEFAULT_FOLLOW_PROFILE.lookAheadMetres,
        DEFAULT_FOLLOW_PROFILE.heightMetres,
      ),
      6,
    );
  });

  it("pulls back as the speed rises", () => {
    expect(rigGeometry(DEFAULT_FOLLOW_PROFILE, 7).rangeMetres).toBeGreaterThan(
      rigGeometry(DEFAULT_FOLLOW_PROFILE, 0).rangeMetres,
    );
    expect(rigGeometry(DEFAULT_FOLLOW_PROFILE, -5).rangeMetres).toBe(
      rigGeometry(DEFAULT_FOLLOW_PROFILE, 0).rangeMetres,
    );
  });
});

describe("longSideFovDegrees", () => {
  it("widens the field of view for a landscape screen", () => {
    // A 915 by 412 screen (a Galaxy A35 held sideways) with a 45 degree vertical field.
    const fov = longSideFovDegrees(45, 915 / 412);
    expect(fov).toBeGreaterThan(80);
    expect(fov).toBeLessThan(90);
    // The vertical field comes back from it.
    const vertical =
      (2 * Math.atan(Math.tan(((fov / 2) * Math.PI) / 180) / (915 / 412)) * 180) / Math.PI;
    expect(vertical).toBeCloseTo(45, 6);
  });

  it("leaves a portrait or square screen alone", () => {
    expect(longSideFovDegrees(45, 0.5)).toBe(45);
    expect(longSideFovDegrees(45, 1)).toBe(45);
    expect(longSideFovDegrees(45, Number.NaN)).toBe(45);
  });
});

describe("FollowCamera", () => {
  it("has no pose until it has a fix", () => {
    const camera = new FollowCamera();
    expect(camera.ready).toBe(false);
    expect(camera.step(0)).toBeUndefined();
  });

  it("starts on the first fix, looking ahead of the rider along the heading", () => {
    const camera = new FollowCamera();
    camera.setFix({ position: START, headingDegrees: 90 }, 0);
    const pose = camera.step(0);
    expect(pose).toBeDefined();
    expect(pose!.rider.lat).toBeCloseTo(START.lat, 7);
    expect(pose!.headingDegrees).toBeCloseTo(90, 6);
    // The target is the look ahead distance east of the rider.
    expect(haversineDistance(pose!.rider, pose!.target)).toBeCloseTo(
      DEFAULT_FOLLOW_PROFILE.lookAheadMetres,
      1,
    );
    expect(bearingDegrees(pose!.rider, pose!.target)).toBeCloseTo(90, 1);
    expect(pose!.verticalFovDegrees).toBe(DEFAULT_FOLLOW_PROFILE.verticalFovDegrees);
  });

  it("keeps the rider where the fix is when stopped", () => {
    const camera = new FollowCamera();
    camera.setFix({ position: START, headingDegrees: 0 }, 0);
    for (let t = 0; t <= 5000; t += 16) camera.step(t);
    const pose = camera.step(5016)!;
    expect(haversineDistance(pose.rider, START)).toBeLessThan(0.01);
  });

  it("glides between one second fixes instead of jumping", () => {
    const camera = new FollowCamera();
    // A rider at 6 m/s heading north, fixes once a second, frames at 30 fps.
    camera.setFix({ position: START, headingDegrees: 0 }, 0);
    let previous = camera.step(0)!.rider;
    let largestStep = 0;
    for (let second = 1; second <= 20; second++) {
      for (let frame = 0; frame < 30; frame++) {
        const t = (second - 1) * 1000 + (frame + 1) * (1000 / 30);
        if (frame === 29)
          camera.setFix({ position: northOf(START, 6 * second), headingDegrees: 0 }, second * 1000);
        const pose = camera.step(t)!;
        // Skip the very first second, while the camera still has no speed to go on.
        if (second > 2)
          largestStep = Math.max(largestStep, haversineDistance(previous, pose.rider));
        previous = pose.rider;
      }
    }
    // A raw one second fix would jump 6 m. The camera never moves more than a fraction of that.
    expect(largestStep).toBeLessThan(0.5);
    // And it keeps up: within a few metres of the rider after 20 seconds.
    expect(haversineDistance(previous, northOf(START, 120))).toBeLessThan(6);
  });

  it("settles on a rider that has stopped", () => {
    const camera = new FollowCamera();
    camera.setFix({ position: START, headingDegrees: 0 }, 0);
    run(camera, 0, 1000);
    camera.setFix({ position: northOf(START, 6), headingDegrees: 0 }, 1000);
    run(camera, 1000, 2000);
    camera.setFix({ position: northOf(START, 12), headingDegrees: 0 }, 2000);
    // The rider then stops: no more fixes arrive. Extrapolation is capped, so it settles.
    const pose = run(camera, 2000, 12_000)!;
    const toNorth = toLocalMetres(START, pose.rider).north;
    expect(toNorth).toBeGreaterThan(12);
    expect(toNorth).toBeLessThan(22);
    const later = run(camera, 12_000, 14_000)!;
    expect(toLocalMetres(START, later.rider).north).toBeCloseTo(toNorth, 1);
  });

  it("turns the short way round through north", () => {
    const camera = new FollowCamera();
    camera.setFix({ position: START, headingDegrees: 350 }, 0);
    run(camera, 0, 1000);
    camera.setFix({ position: northOf(START, 5), headingDegrees: 10 }, 1000);
    let minimum = 360;
    let maximum = 0;
    for (let t = 1000; t < 3000; t += 16) {
      const heading = camera.step(t)!.headingDegrees;
      // Never swings through south: the heading stays within 30 degrees of north.
      const away = Math.min(heading, 360 - heading);
      minimum = Math.min(minimum, away);
      maximum = Math.max(maximum, away);
    }
    expect(maximum).toBeLessThan(30);
    expect(minimum).toBeLessThan(10);
  });

  it("smooths the heading, so a corner does not snap", () => {
    const camera = new FollowCamera();
    camera.setFix({ position: START, headingDegrees: 0 }, 0);
    run(camera, 0, 1000);
    camera.setFix({ position: northOf(START, 5), headingDegrees: 90 }, 1000);
    const first = camera.step(1016)!;
    expect(first.headingDegrees).toBeGreaterThan(0);
    expect(first.headingDegrees).toBeLessThan(15);
    const pose = run(camera, 1032, 8000, 16)!;
    expect(pose.headingDegrees).toBeCloseTo(90, 0);
  });

  it("jumps instead of gliding across the map when the rider is far away", () => {
    const camera = new FollowCamera();
    camera.setFix({ position: START, headingDegrees: 0 }, 0);
    run(camera, 0, 1000);
    const far = northOf(START, 5000);
    camera.setFix({ position: far, headingDegrees: 0 }, 1000);
    const pose = camera.step(1016)!;
    expect(haversineDistance(pose.rider, far)).toBeLessThan(1);
  });

  it("catches up at once after a long gap such as a hidden tab", () => {
    const camera = new FollowCamera();
    camera.setFix({ position: START, headingDegrees: 0 }, 0);
    run(camera, 0, 1000);
    camera.setFix({ position: northOf(START, 6), headingDegrees: 0 }, 1000);
    run(camera, 1000, 2000);
    camera.setFix({ position: northOf(START, 12), headingDegrees: 0 }, 2000);
    run(camera, 2000, 2100);
    const pose = camera.step(60_000)!;
    // The expected position is capped at 1.5 s of travel past the last fix.
    expect(toLocalMetres(START, pose.rider).north).toBeGreaterThan(12);
    expect(toLocalMetres(START, pose.rider).north).toBeLessThan(22);
  });

  it("derives the heading from the motion when a fix has none", () => {
    const camera = new FollowCamera();
    camera.setFix({ position: START }, 0);
    run(camera, 0, 1000);
    camera.setFix({ position: { lat: START.lat, lng: START.lng + 0.0001 } }, 1000);
    const pose = run(camera, 1000, 5000, 16)!;
    expect(pose.headingDegrees).toBeCloseTo(90, 0);
  });

  it("can be snapped to a start position", () => {
    const camera = new FollowCamera();
    camera.setFix({ position: START, headingDegrees: 0 }, 0);
    run(camera, 0, 1000);
    camera.setFix({ position: northOf(START, 8), headingDegrees: 0 }, 1000);
    run(camera, 1000, 1100);
    camera.snapTo({ position: START, headingDegrees: 180 }, 2000);
    const pose = camera.step(2000)!;
    expect(haversineDistance(pose.rider, START)).toBeLessThan(0.01);
    expect(pose.headingDegrees).toBeCloseTo(180, 6);
  });
});
