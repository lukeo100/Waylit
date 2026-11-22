import { describe, expect, it } from "vitest";
import { generateArtworkSvg, artworkDataUri } from "./artwork";
import { createManualClock } from "./clock";
import { MediaPlayer, type MediaState, type MediaTrack } from "./media";
import { MOCK_TRACKS } from "./mock-media";

const tracks: MediaTrack[] = MOCK_TRACKS.slice(0, 3).map((t, i) => ({
  ...t,
  durationSeconds: 10 * (i + 1),
}));

function make() {
  const clock = createManualClock(0);
  const player = new MediaPlayer({ tracks, clock });
  return { clock, player };
}

describe("MediaPlayer", () => {
  it("starts paused at the first track", () => {
    const { player } = make();
    const s = player.getState();
    expect(s.status).toBe("paused");
    expect(s.trackIndex).toBe(0);
    expect(s.positionSeconds).toBe(0);
  });

  it("advances progress only while playing", () => {
    const { clock, player } = make();
    clock.advance(5000);
    expect(player.getState().positionSeconds).toBe(0);
    player.play();
    clock.advance(4000);
    expect(player.getState().positionSeconds).toBeCloseTo(4, 6);
    expect(player.getState().progress).toBeCloseTo(0.4, 6);
    player.pause();
    clock.advance(4000);
    expect(player.getState().positionSeconds).toBeCloseTo(4, 6);
  });

  it("toggles", () => {
    const { player } = make();
    player.toggle();
    expect(player.getState().status).toBe("playing");
    player.toggle();
    expect(player.getState().status).toBe("paused");
  });

  it("moves to the next track at the end and wraps around", () => {
    const { clock, player } = make();
    player.play();
    clock.advance(11_000);
    let s = player.getState();
    expect(s.trackIndex).toBe(1);
    expect(s.positionSeconds).toBeCloseTo(1, 6);
    clock.advance(19_000 + 30_000 + 5000);
    s = player.getState();
    expect(s.trackIndex).toBe(0);
    expect(s.positionSeconds).toBeCloseTo(5, 6);
  });

  it("next and previous wrap and reset progress", () => {
    const { player } = make();
    player.previous();
    expect(player.getState().trackIndex).toBe(2);
    player.next();
    expect(player.getState().trackIndex).toBe(0);
    expect(player.getState().positionSeconds).toBe(0);
  });

  it("previous restarts the track when more than the threshold has played", () => {
    const { clock, player } = make();
    player.next();
    player.play();
    clock.advance(6000);
    player.previous();
    expect(player.getState().trackIndex).toBe(1);
    expect(player.getState().positionSeconds).toBe(0);
    clock.advance(1000);
    player.previous();
    expect(player.getState().trackIndex).toBe(0);
    expect(player.getState().status).toBe("playing");
  });

  it("seeks within the track and clamps", () => {
    const { player } = make();
    player.seek(4);
    expect(player.getState().positionSeconds).toBe(4);
    player.seek(999);
    expect(player.getState().positionSeconds).toBe(10);
    player.seek(-3);
    expect(player.getState().positionSeconds).toBe(0);
  });

  it("tells subscribers about changes and stops after unsubscribe", () => {
    const { clock, player } = make();
    const seen: MediaState[] = [];
    const off = player.subscribe((s) => seen.push(s));
    player.play();
    player.next();
    clock.advance(25_000);
    player.getState();
    expect(seen.length).toBe(3);
    off();
    player.pause();
    expect(seen.length).toBe(3);
  });

  it("rejects empty or zero length track lists", () => {
    expect(() => new MediaPlayer({ tracks: [] })).toThrow();
    expect(() => new MediaPlayer({ tracks: [{ ...tracks[0]!, durationSeconds: 0 }] })).toThrow();
  });
});

describe("mock tracks and artwork", () => {
  it("has unique ids and plausible values", () => {
    const ids = new Set(MOCK_TRACKS.map((t) => t.id));
    expect(ids.size).toBe(MOCK_TRACKS.length);
    for (const t of MOCK_TRACKS) {
      expect(t.durationSeconds).toBeGreaterThan(0);
      expect(t.tone.pattern.length).toBeGreaterThan(0);
      expect(Math.max(...t.tone.pattern)).toBeLessThan(t.tone.scale.length);
    }
  });

  it("generates repeatable, distinct artwork", () => {
    const [a, b] = MOCK_TRACKS;
    expect(generateArtworkSvg(a!.artwork)).toBe(generateArtworkSvg(a!.artwork));
    expect(generateArtworkSvg(a!.artwork)).not.toBe(generateArtworkSvg(b!.artwork));
    expect(generateArtworkSvg(a!.artwork).startsWith("<svg")).toBe(true);
    expect(artworkDataUri(a!.artwork).startsWith("data:image/svg+xml")).toBe(true);
  });

  it("ignores palette entries that are not plain hex colours", () => {
    const svg = generateArtworkSvg({ palette: ['"><script>x</script>', "red", "#fff"], seed: 1 });
    expect(svg).not.toContain("script");
  });
});
