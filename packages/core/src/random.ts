/** A function that returns a number in the range 0 (inclusive) to 1 (exclusive). */
export type RandomSource = () => number;

/** Small seeded generator (mulberry32). Same seed, same sequence, on every platform. */
export function createRng(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One sample from a normal distribution, using the Box-Muller transform. */
export function gaussian(random: RandomSource, mean = 0, standardDeviation = 1): number {
  const u = Math.max(random(), Number.EPSILON);
  const v = random();
  return mean + standardDeviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
