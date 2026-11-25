/**
 * Just enough 4 by 4 matrix maths to place a hologram item in a renderer that wants a matrix.
 * Column major, as WebGL expects. Original code, no library.
 */

export type Mat4 = Float64Array;

export function identity(): Mat4 {
  const m = new Float64Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

/** `a` times `b`, written to `out`. The result applies `b` first, then `a`. */
export function multiply(out: Mat4, a: ArrayLike<number>, b: ArrayLike<number>): Mat4 {
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += (a[k * 4 + row] as number) * (b[col * 4 + k] as number);
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/**
 * The matrix that places a model in a renderer's world. The model is in metres with x right,
 * y forward and z up. It is turned clockwise by `headingDegrees` (so forward points along the
 * heading, with north up and east right) and scaled, then moved to `origin`. `metresX`,
 * `metresY` and `metresZ` are the sizes of one metre along each world axis, which lets a
 * renderer whose world is not in metres (such as web mercator, where y points south) place
 * models without a second conversion.
 */
export function modelMatrix(
  out: Mat4,
  origin: readonly [number, number, number],
  headingDegrees: number,
  uniformScale: number,
  metresX: number,
  metresY: number,
  metresZ: number,
): Mat4 {
  const angle = (headingDegrees * Math.PI) / 180;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // The model's x axis (right) points east-ish rotated by the heading, y (forward) points north-ish.
  // In east, north coordinates: right = (c, -s), forward = (s, c).
  const e = uniformScale;
  out.fill(0);
  out[0] = c * e * metresX;
  out[1] = -s * e * metresY;
  out[2] = 0;
  out[4] = s * e * metresX;
  out[5] = c * e * metresY;
  out[10] = e * metresZ;
  out[12] = origin[0];
  out[13] = origin[1];
  out[14] = origin[2];
  out[15] = 1;
  return out;
}

/** Transforms a point by a matrix. For tests and small jobs. */
export function transformPoint(
  m: ArrayLike<number>,
  p: readonly [number, number, number],
): [number, number, number] {
  const w =
    (m[3] as number) * p[0] +
    (m[7] as number) * p[1] +
    (m[11] as number) * p[2] +
    (m[15] as number);
  return [
    ((m[0] as number) * p[0] +
      (m[4] as number) * p[1] +
      (m[8] as number) * p[2] +
      (m[12] as number)) /
      w,
    ((m[1] as number) * p[0] +
      (m[5] as number) * p[1] +
      (m[9] as number) * p[2] +
      (m[13] as number)) /
      w,
    ((m[2] as number) * p[0] +
      (m[6] as number) * p[1] +
      (m[10] as number) * p[2] +
      (m[14] as number)) /
      w,
  ];
}
