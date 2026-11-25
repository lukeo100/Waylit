import {
  fromLocalMetres,
  normaliseDegrees,
  shortestAngleDelta,
  toLocalMetres,
  type LatLng,
  type LocalMetres,
} from "@waylit/core";
import type { CameraPose } from "./types";

/**
 * The third-person follow camera, as plain maths with no renderer.
 *
 * The camera sits behind and above the rider and looks along the heading at a point a little
 * ahead of the rider. Looking ahead of the rider, not at them, is what puts the rider in the
 * lower middle of the screen with the road ahead above them and the horizon in the upper third.
 *
 *            camera
 *              o.
 *              |  ` .  pitch
 *     height   |      ` .           look at point
 *              |          ` . _ _ _ _ _ _ _ _ _ x   (ground level)
 *              +-----------+---------+
 *               behind      rider     look ahead
 *
 * The GPS simulator fixes once a second, so this class smooths: it extrapolates the rider's
 * position from the last two fixes between fixes, then chases that with an exponential filter
 * on the position and on the heading (taking the shortest way round). Call `setFix` when a fix
 * arrives and `step` once per rendered frame. It keeps no timers and reads no clock, so the
 * caller passes in a steadily increasing time in milliseconds (the frame time).
 */

export interface FollowCameraProfile {
  /** How far behind the rider the camera is, in metres, when stopped. */
  readonly distanceBehindMetres: number;
  /** How far above the rider the camera is, in metres. */
  readonly heightMetres: number;
  /** How far ahead of the rider the camera looks, in metres. */
  readonly lookAheadMetres: number;
  /** Vertical field of view in degrees. */
  readonly verticalFovDegrees: number;
  /** Extra distance behind the rider per metre per second of speed, so speed feels faster. */
  readonly pullbackMetresPerMps: number;
  /** Smoothing time constant for the position, in seconds. Lower is tighter. */
  readonly positionTimeConstantS: number;
  /** Smoothing time constant for the heading, in seconds. Higher turns more lazily. */
  readonly headingTimeConstantS: number;
  /** The longest the rider's position is extrapolated past the last fix, in seconds. */
  readonly maxExtrapolationS: number;
  /** A fix further than this from the smoothed position makes the camera jump, in metres. */
  readonly snapDistanceMetres: number;
}

/**
 * Tuned so that on a landscape phone the rider sits at about two thirds of the screen height
 * and the horizon at about a quarter (see `framing`). Task 10 may retune from a device test.
 */
export const DEFAULT_FOLLOW_PROFILE: FollowCameraProfile = {
  distanceBehindMetres: 11,
  heightMetres: 4,
  lookAheadMetres: 9,
  verticalFovDegrees: 45,
  pullbackMetresPerMps: 0.25,
  positionTimeConstantS: 0.3,
  headingTimeConstantS: 0.55,
  maxExtrapolationS: 1.5,
  snapDistanceMetres: 150,
};

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/** Pitch (degrees below the horizon) and range (metres) for a profile at a given speed. */
export function rigGeometry(
  profile: FollowCameraProfile,
  speedMps = 0,
): { pitchDegrees: number; rangeMetres: number; behindMetres: number } {
  const behind =
    profile.distanceBehindMetres + profile.pullbackMetresPerMps * Math.max(0, speedMps);
  const horizontal = behind + profile.lookAheadMetres;
  return {
    behindMetres: behind,
    pitchDegrees: toDegrees(Math.atan2(profile.heightMetres, horizontal)),
    rangeMetres: Math.hypot(horizontal, profile.heightMetres),
  };
}

/**
 * Where things land on the screen for a profile, as fractions of the screen height from the top
 * (0) to the bottom (1). The vertical field of view fixes this, so the screen width does not
 * matter. A flat world is assumed, which is all the horizon needs.
 */
export function framing(
  profile: FollowCameraProfile,
  speedMps = 0,
): { riderY: number; horizonY: number } {
  const { pitchDegrees, behindMetres } = rigGeometry(profile, speedMps);
  const halfTan = Math.tan(toRadians(profile.verticalFovDegrees / 2));
  const riderBelowHorizon = Math.atan2(profile.heightMetres, behindMetres);
  const belowAxis = riderBelowHorizon - toRadians(pitchDegrees);
  return {
    riderY: 0.5 + (0.5 * Math.tan(belowAxis)) / halfTan,
    horizonY: 0.5 - (0.5 * Math.tan(toRadians(pitchDegrees))) / halfTan,
  };
}

/**
 * The horizontal field of view, in degrees, that gives a vertical field of view on a screen of
 * the given aspect ratio (width over height). Cesium takes its field of view along the longer
 * side, so a landscape screen needs this and a portrait screen uses the vertical value as it is.
 */
export function longSideFovDegrees(verticalFovDegrees: number, aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 1) return verticalFovDegrees;
  return toDegrees(2 * Math.atan(Math.tan(toRadians(verticalFovDegrees / 2)) * aspect));
}

/** A position fix as the camera needs it. */
export interface FollowFix {
  readonly position: LatLng;
  /** Degrees clockwise from true north, when known. */
  readonly headingDegrees?: number | undefined;
}

const MAX_SPEED_MPS = 80;

export class FollowCamera {
  private readonly profile: FollowCameraProfile;
  private origin: LatLng | undefined;
  private pos: LocalMetres = { east: 0, north: 0 };
  private fixPos: LocalMetres = { east: 0, north: 0 };
  private vel: LocalMetres = { east: 0, north: 0 };
  private fixAtMs: number | undefined;
  private heading = 0;
  private targetHeading = 0;
  private speedMps = 0;
  private lastStepMs: number | undefined;
  private hasFix = false;

  constructor(profile: FollowCameraProfile = DEFAULT_FOLLOW_PROFILE) {
    this.profile = profile;
  }

  /** True once the camera has a position to follow. */
  get ready(): boolean {
    return this.hasFix;
  }

  /** Puts the camera at a position and heading at once, with no smoothing and no velocity. */
  snapTo(fix: FollowFix, nowMs: number): void {
    this.origin = fix.position;
    this.pos = { east: 0, north: 0 };
    this.fixPos = { east: 0, north: 0 };
    this.vel = { east: 0, north: 0 };
    this.fixAtMs = nowMs;
    this.speedMps = 0;
    if (fix.headingDegrees !== undefined) {
      this.heading = normaliseDegrees(fix.headingDegrees);
      this.targetHeading = this.heading;
    }
    this.lastStepMs = nowMs;
    this.hasFix = true;
  }

  /** Feeds a new position fix. `nowMs` is the same steadily increasing time that `step` gets. */
  setFix(fix: FollowFix, nowMs: number): void {
    if (this.origin === undefined) {
      this.snapTo(fix, nowMs);
      return;
    }
    const next = toLocalMetres(this.origin, fix.position);
    if (
      Math.hypot(next.east - this.pos.east, next.north - this.pos.north) >
      this.profile.snapDistanceMetres
    ) {
      this.snapTo(fix, nowMs);
      return;
    }
    const previousAt = this.fixAtMs;
    // A fix that arrives within 50 ms of the last one says nothing reliable about speed, so
    // the velocity is kept. The position and the time are still taken.
    if (previousAt !== undefined && nowMs - previousAt >= 50) {
      const seconds = (nowMs - previousAt) / 1000;
      const measured = {
        east: (next.east - this.fixPos.east) / seconds,
        north: (next.north - this.fixPos.north) / seconds,
      };
      const blended = {
        east: 0.6 * measured.east + 0.4 * this.vel.east,
        north: 0.6 * measured.north + 0.4 * this.vel.north,
      };
      const speed = Math.hypot(blended.east, blended.north);
      const scale = speed > MAX_SPEED_MPS ? MAX_SPEED_MPS / speed : 1;
      this.vel = { east: blended.east * scale, north: blended.north * scale };
    }
    this.fixPos = next;
    this.fixAtMs = nowMs;
    if (fix.headingDegrees !== undefined) {
      this.targetHeading = normaliseDegrees(fix.headingDegrees);
    } else if (Math.hypot(this.vel.east, this.vel.north) > 0.5) {
      this.targetHeading = normaliseDegrees(toDegrees(Math.atan2(this.vel.east, this.vel.north)));
    }
    this.hasFix = true;
  }

  /** Advances the smoothing to `nowMs` and returns the pose for this frame. */
  step(nowMs: number): CameraPose | undefined {
    const origin = this.origin;
    if (origin === undefined || !this.hasFix) return undefined;
    const last = this.lastStepMs ?? nowMs;
    const gapS = Math.max(0, (nowMs - last) / 1000);
    this.lastStepMs = nowMs;

    // The rider's expected position now: the last fix plus the velocity since it arrived.
    const sinceFixS = Math.min(
      this.profile.maxExtrapolationS,
      Math.max(0, (nowMs - (this.fixAtMs ?? nowMs)) / 1000),
    );
    const expected = {
      east: this.fixPos.east + this.vel.east * sinceFixS,
      north: this.fixPos.north + this.vel.north * sinceFixS,
    };

    // After a long gap (a hidden tab) catch up at once instead of gliding for seconds.
    if (gapS > 1.5) {
      this.pos = expected;
      this.heading = this.targetHeading;
    } else {
      const alphaPos = 1 - Math.exp(-gapS / this.profile.positionTimeConstantS);
      this.pos = {
        east: this.pos.east + (expected.east - this.pos.east) * alphaPos,
        north: this.pos.north + (expected.north - this.pos.north) * alphaPos,
      };
      const alphaHead = 1 - Math.exp(-gapS / this.profile.headingTimeConstantS);
      this.heading = normaliseDegrees(
        this.heading + shortestAngleDelta(this.heading, this.targetHeading) * alphaHead,
      );
      const rawSpeed = Math.hypot(this.vel.east, this.vel.north);
      const alphaSpeed = 1 - Math.exp(-gapS / 1.0);
      this.speedMps += (rawSpeed - this.speedMps) * alphaSpeed;
    }

    const { pitchDegrees, rangeMetres } = rigGeometry(this.profile, this.speedMps);
    const headingRad = toRadians(this.heading);
    const ahead = {
      east: this.pos.east + Math.sin(headingRad) * this.profile.lookAheadMetres,
      north: this.pos.north + Math.cos(headingRad) * this.profile.lookAheadMetres,
    };
    return {
      target: fromLocalMetres(origin, ahead),
      rider: fromLocalMetres(origin, this.pos),
      headingDegrees: this.heading,
      pitchDegrees,
      rangeMetres,
      verticalFovDegrees: this.profile.verticalFovDegrees,
    };
  }
}
