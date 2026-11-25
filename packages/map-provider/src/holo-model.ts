/**
 * Original low poly meshes for the hologram layer, built in code. No model file, no third party
 * asset, nothing copied from any vehicle maker. Metres, with x to the rider's right, y forward
 * and z up, and the origin on the ground under the middle of the vehicle.
 *
 * The scooter is a stylised kick scooter with the proportions of a large commuter scooter: a
 * long, wide deck, ten inch wheels, a raked stem and a wide handlebar. It has no logos, no
 * brand shapes and no copied surfaces, only boxes, rods and wheels.
 *
 * The rider is a standing mannequin, an abstract silhouette, in a relaxed riding stance.
 *
 * Every mesh has per vertex positions, normals and two parameters (`height`, the height of the
 * vertex above the ground in metres, and `gradient`, a value from 0 to 1 that fades a shape from
 * its middle to its edge or from its base to its tip). The shader uses them for scanlines, rim
 * light and fades. Meshes are plain typed arrays, so any renderer can upload them.
 */

export interface HoloMesh {
  /** x, y, z per vertex. */
  readonly positions: Float32Array;
  /** Unit normal per vertex. Flat shaded, so vertices are not shared between faces. */
  readonly normals: Float32Array;
  /** height (metres above the ground), gradient (0 to 1) per vertex. */
  readonly params: Float32Array;
  readonly indices: Uint16Array;
  /** Axis aligned bounds of the positions, in metres. */
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

type Vec3 = readonly [number, number, number];

/** Builds a mesh from flat shaded triangles. */
class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly params: number[] = [];
  private readonly indices: number[] = [];

  /** Adds one triangle (counter clockwise seen from outside). */
  triangle(a: Vec3, b: Vec3, c: Vec3, gradients: readonly [number, number, number] = [0, 0, 0]) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-12) return;
    nx /= length;
    ny /= length;
    nz /= length;
    const base = this.positions.length / 3;
    [a, b, c].forEach((p, i) => {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nx, ny, nz);
      this.params.push(p[2], gradients[i] ?? 0);
    });
    this.indices.push(base, base + 1, base + 2);
  }

  /** A quad a, b, c, d in counter clockwise order, with a gradient value for each corner. */
  quad(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    d: Vec3,
    gradients: readonly [number, number, number, number] = [0, 0, 0, 0],
  ) {
    this.triangle(a, b, c, [gradients[0], gradients[1], gradients[2]]);
    this.triangle(a, c, d, [gradients[0], gradients[2], gradients[3]]);
  }

  /** An axis aligned box from its centre and size. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) {
    const x0 = cx - sx / 2;
    const x1 = cx + sx / 2;
    const y0 = cy - sy / 2;
    const y1 = cy + sy / 2;
    const z0 = cz - sz / 2;
    const z1 = cz + sz / 2;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); // top
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]); // bottom
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]); // back
    this.quad([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]); // front
    this.quad([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]); // left
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]); // right
  }

  /** A rod (a prism with `sides` sides) from `p0` to `p1`, with optional end radii. */
  rod(p0: Vec3, p1: Vec3, r0: number, r1: number = r0, sides = 6, capped = true) {
    const axis = norm3(sub3(p1, p0));
    const helper: Vec3 = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = norm3(cross3(axis, helper));
    const v = cross3(axis, u);
    const ring = (centre: Vec3, radius: number, i: number): Vec3 => {
      const angle = (2 * Math.PI * i) / sides;
      const c = Math.cos(angle) * radius;
      const s = Math.sin(angle) * radius;
      return [
        centre[0] + u[0] * c + v[0] * s,
        centre[1] + u[1] * c + v[1] * s,
        centre[2] + u[2] * c + v[2] * s,
      ];
    };
    for (let i = 0; i < sides; i++) {
      const a0 = ring(p0, r0, i);
      const a1 = ring(p0, r0, i + 1);
      const b0 = ring(p1, r1, i);
      const b1 = ring(p1, r1, i + 1);
      this.quad(a0, a1, b1, b0);
      if (capped) {
        this.triangle(p1, b0, b1);
        this.triangle(p0, a1, a0);
      }
    }
  }

  /** A low poly ball. */
  ball(cx: number, cy: number, cz: number, radius: number) {
    const rings = 4;
    const sides = 8;
    const point = (ring: number, side: number): Vec3 => {
      const lat = Math.PI * (ring / rings - 0.5);
      const lon = (2 * Math.PI * side) / sides;
      return [
        cx + radius * Math.cos(lat) * Math.cos(lon),
        cy + radius * Math.cos(lat) * Math.sin(lon),
        cz + radius * Math.sin(lat),
      ];
    };
    for (let ring = 0; ring < rings; ring++) {
      for (let side = 0; side < sides; side++) {
        const a = point(ring, side);
        const b = point(ring, side + 1);
        const c = point(ring + 1, side + 1);
        const d = point(ring + 1, side);
        this.quad(a, b, c, d);
      }
    }
  }

  /**
   * A convex polygon in the x, y plane at heights `z0` to `z1`, with flat top and bottom and
   * straight sides. `points` run counter clockwise seen from above.
   */
  prism(points: readonly (readonly [number, number])[], z0: number, z1: number) {
    const n = points.length;
    for (let i = 1; i < n - 1; i++) {
      const a = points[0] as readonly [number, number];
      const b = points[i] as readonly [number, number];
      const c = points[i + 1] as readonly [number, number];
      this.triangle([a[0], a[1], z1], [b[0], b[1], z1], [c[0], c[1], z1]);
      this.triangle([a[0], a[1], z0], [c[0], c[1], z0], [b[0], b[1], z0]);
    }
    for (let i = 0; i < n; i++) {
      const a = points[i] as readonly [number, number];
      const b = points[(i + 1) % n] as readonly [number, number];
      this.quad([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]);
    }
  }

  build(): HoloMesh {
    const positions = new Float32Array(this.positions);
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const value = positions[i + k] as number;
        if (value < (min[k] as number)) min[k] = value;
        if (value > (max[k] as number)) max[k] = value;
      }
    }
    return {
      positions,
      normals: new Float32Array(this.normals),
      params: new Float32Array(this.params),
      indices: new Uint16Array(this.indices),
      min,
      max,
    };
  }
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm3(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** Wheel radius of the scooter in metres (a ten inch wheel). */
export const SCOOTER_WHEEL_RADIUS = 0.13;

/**
 * The scooter and its rider as one mesh. About 1.2 m long and 1.75 m tall in total, the rider
 * standing on the deck with the front foot ahead of the rear foot and both hands on the bar.
 */
export function buildRiderMesh(): HoloMesh {
  const m = new MeshBuilder();
  const r = SCOOTER_WHEEL_RADIUS;
  const deckTop = 0.2;

  // Wheels: a short rod along x, twelve sided, with a hub disc in the middle.
  const wheel = (y: number) => {
    m.rod([-0.045, y, r], [0.045, y, r], r, r, 12);
    m.rod([-0.06, y, r], [0.06, y, r], 0.045, 0.045, 8);
  };
  wheel(-0.5);
  wheel(0.5);

  // Deck: long and wide, with a raised rear fender over the back wheel.
  m.box(0, -0.06, deckTop - 0.025, 0.2, 0.78, 0.05);
  m.box(0, -0.5, r + 0.13, 0.13, 0.3, 0.025);
  m.rod([0, -0.4, deckTop - 0.025], [0, -0.5, r], 0.025, 0.025, 4);

  // Battery housing at the foot of the stem, and the head tube.
  m.box(0, 0.36, deckTop + 0.04, 0.12, 0.16, 0.1);
  // Raked stem: from the deck up and slightly back to the bar.
  m.rod([0, 0.4, deckTop + 0.02], [0, 0.34, 1.1], 0.03, 0.026, 6);
  // Front fork down to the front wheel.
  m.rod([0.055, 0.42, deckTop], [0.055, 0.5, r], 0.016, 0.016, 4);
  m.rod([-0.055, 0.42, deckTop], [-0.055, 0.5, r], 0.016, 0.016, 4);
  // Handlebar with two grips, and a small head lamp block.
  m.rod([-0.28, 0.34, 1.1], [0.28, 0.34, 1.1], 0.016, 0.016, 6);
  m.rod([-0.31, 0.34, 1.1], [-0.22, 0.34, 1.1], 0.022, 0.022, 6);
  m.rod([0.22, 0.34, 1.1], [0.31, 0.34, 1.1], 0.022, 0.022, 6);
  m.box(0, 0.4, 1.02, 0.1, 0.05, 0.05);
  m.box(0, 0.37, 1.14, 0.12, 0.06, 0.04);

  // Rider: feet on the deck, front foot ahead of the rear foot.
  const footRear: Vec3 = [-0.05, -0.12, deckTop + 0.03];
  const footFront: Vec3 = [0.05, 0.16, deckTop + 0.03];
  const hip: Vec3 = [0, -0.02, 0.95];
  const kneeRear: Vec3 = [-0.07, -0.02, 0.58];
  const kneeFront: Vec3 = [0.07, 0.1, 0.58];
  const shoulder: Vec3 = [0, 0.1, 1.47];
  const neck: Vec3 = [0, 0.12, 1.55];
  // Feet.
  m.box(footRear[0], footRear[1] + 0.03, deckTop + 0.04, 0.09, 0.26, 0.06);
  m.box(footFront[0], footFront[1] + 0.03, deckTop + 0.04, 0.09, 0.26, 0.06);
  // Legs.
  m.rod([footRear[0], footRear[1], footRear[2] + 0.04], kneeRear, 0.045, 0.058, 6);
  m.rod(kneeRear, [hip[0] - 0.08, hip[1], hip[2]], 0.058, 0.07, 6);
  m.rod([footFront[0], footFront[1], footFront[2] + 0.04], kneeFront, 0.045, 0.058, 6);
  m.rod(kneeFront, [hip[0] + 0.08, hip[1], hip[2]], 0.058, 0.07, 6);
  // Hips and torso, leaning a little forward.
  m.rod([-0.1, hip[1], hip[2]], [0.1, hip[1], hip[2]], 0.08, 0.08, 6);
  m.rod(hip, shoulder, 0.13, 0.15, 8);
  m.rod([-0.17, shoulder[1], shoulder[2]], [0.17, shoulder[1], shoulder[2]], 0.07, 0.07, 6);
  // Neck and head.
  m.rod(shoulder, neck, 0.04, 0.04, 6);
  m.ball(0, 0.13, 1.66, 0.1);
  // Arms to the grips.
  const gripLeft: Vec3 = [-0.27, 0.34, 1.12];
  const gripRight: Vec3 = [0.27, 0.34, 1.12];
  m.rod([-0.18, shoulder[1], shoulder[2]], [-0.25, 0.2, 1.28], 0.04, 0.036, 6);
  m.rod([-0.25, 0.2, 1.28], gripLeft, 0.036, 0.03, 6);
  m.rod([0.18, shoulder[1], shoulder[2]], [0.25, 0.2, 1.28], 0.04, 0.036, 6);
  m.rod([0.25, 0.2, 1.28], gripRight, 0.036, 0.03, 6);
  return m.build();
}

/**
 * A flat chevron that points forward (+y), about 2 m wide. Two slanted bars that meet at the
 * tip. It is drawn floating over the road.
 */
export function buildChevronMesh(): HoloMesh {
  const m = new MeshBuilder();
  const half = 1.0;
  const depth = 0.8;
  const stroke = 0.36;
  const thick = 0.06;
  // Right bar: from the back right corner to the tip, as a slanted parallelogram.
  m.prism(
    [
      [half, -depth],
      [half - stroke * 1.1, -depth],
      [0, depth - stroke],
      [0, depth],
    ],
    0,
    thick,
  );
  // Left bar, the mirror image, counter clockwise as well.
  m.prism(
    [
      [0, depth],
      [0, depth - stroke],
      [-half + stroke * 1.1, -depth],
      [-half, -depth],
    ],
    0,
    thick,
  );
  return m.build();
}

/**
 * The turn beacon: a thin vertical light column, hollow, with a ring on the ground at its foot.
 * `gradient` runs from 1 at the foot to 0 at the top so it fades upward.
 */
export const BEACON_HEIGHT_METRES = 14;

export function buildBeaconMesh(): HoloMesh {
  const m = new MeshBuilder();
  const sides = 12;
  const radius = 0.45;
  const h = BEACON_HEIGHT_METRES;
  for (let i = 0; i < sides; i++) {
    const a0 = (2 * Math.PI * i) / sides;
    const a1 = (2 * Math.PI * (i + 1)) / sides;
    const p0: Vec3 = [Math.cos(a0) * radius, Math.sin(a0) * radius, 0];
    const p1: Vec3 = [Math.cos(a1) * radius, Math.sin(a1) * radius, 0];
    const q1: Vec3 = [p1[0], p1[1], h];
    const q0: Vec3 = [p0[0], p0[1], h];
    // Visible from inside and outside, so both windings are added.
    m.quad(p0, p1, q1, q0, [1, 1, 0, 0]);
    m.quad(p1, p0, q0, q1, [1, 1, 0, 0]);
  }
  ring(m, 1.3, 1.7, 24, 0.04);
  return m.build();
}

/** A flat annulus in the x, y plane at height `z`, both sides. */
function ring(m: MeshBuilder, inner: number, outer: number, segments: number, z: number) {
  for (let i = 0; i < segments; i++) {
    const a0 = (2 * Math.PI * i) / segments;
    const a1 = (2 * Math.PI * (i + 1)) / segments;
    const i0: Vec3 = [Math.cos(a0) * inner, Math.sin(a0) * inner, z];
    const i1: Vec3 = [Math.cos(a1) * inner, Math.sin(a1) * inner, z];
    const o1: Vec3 = [Math.cos(a1) * outer, Math.sin(a1) * outer, z];
    const o0: Vec3 = [Math.cos(a0) * outer, Math.sin(a0) * outer, z];
    m.quad(i0, o0, o1, i1, [0, 1, 1, 0]);
    m.quad(i1, o1, o0, i0, [0, 1, 1, 0]);
  }
}

/**
 * The heading marker at the rider's base: a ring and a cone (a flat wedge) that points where
 * the rider is going. `gradient` is 0 at the ring and 1 at the tip of the cone.
 */
export function buildHeadingMesh(): HoloMesh {
  const m = new MeshBuilder();
  // The ring lies at 0.02 m and the cone at 0.05 m, so a shader can tell them apart by height.
  ring(m, 0.82, 0.95, 40, 0.02);
  // The cone: a fan of thin triangles from just outside the ring to a point ahead.
  const steps = 8;
  const spread = (24 * Math.PI) / 180;
  const near = 1.05;
  const far = 3.4;
  for (let i = 0; i < steps; i++) {
    const t0 = -spread + (2 * spread * i) / steps;
    const t1 = -spread + (2 * spread * (i + 1)) / steps;
    // Angles are measured from forward (+y), clockwise seen from above.
    const n0: Vec3 = [Math.sin(t0) * near, Math.cos(t0) * near, 0.05];
    const n1: Vec3 = [Math.sin(t1) * near, Math.cos(t1) * near, 0.05];
    const f0: Vec3 = [Math.sin(t0) * far, Math.cos(t0) * far, 0.05];
    const f1: Vec3 = [Math.sin(t1) * far, Math.cos(t1) * far, 0.05];
    m.quad(n0, f0, f1, n1, [0, 1, 1, 0]);
    m.quad(n1, f1, f0, n0, [0, 1, 1, 0]);
  }
  return m.build();
}

/** The mesh for each item kind. Built lazily and shared, because meshes never change. */
export function meshFor(kind: "rider" | "heading" | "chevron" | "beacon"): HoloMesh {
  const cached = cache.get(kind);
  if (cached) return cached;
  const built =
    kind === "rider"
      ? buildRiderMesh()
      : kind === "heading"
        ? buildHeadingMesh()
        : kind === "chevron"
          ? buildChevronMesh()
          : buildBeaconMesh();
  cache.set(kind, built);
  return built;
}
const cache = new Map<string, HoloMesh>();
