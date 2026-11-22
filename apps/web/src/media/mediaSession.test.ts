import { describe, expect, it } from "vitest";
import { MOCK_TRACKS, MediaPlayer, createManualClock } from "@waylit/core";
import { bindMediaSession } from "./mediaSession";

type Handler = (() => void) | null;

function fakeSession() {
  const handlers = new Map<string, Handler>();
  const positions: unknown[] = [];
  const session = {
    metadata: null as unknown,
    playbackState: "none",
    setActionHandler: (action: string, handler: Handler) => {
      handlers.set(action, handler);
    },
    setPositionState: (s: unknown) => {
      positions.push(s);
    },
  };
  return { session: session as unknown as MediaSession, raw: session, handlers, positions };
}

const createMetadata = (init: MediaMetadataInit) => init as unknown as MediaMetadata;

function setup() {
  const clock = createManualClock(0);
  const player = new MediaPlayer({ tracks: MOCK_TRACKS, clock });
  const fake = fakeSession();
  const dispose = bindMediaSession(player, { mediaSession: fake.session, createMetadata });
  return { clock, player, fake, dispose };
}

describe("bindMediaSession", () => {
  it("publishes metadata and generated artwork for the current track", () => {
    const { fake } = setup();
    const meta = fake.raw.metadata as {
      title: string;
      artist: string;
      artwork: { src: string; type: string }[];
    };
    expect(meta.title).toBe(MOCK_TRACKS[0]?.title);
    expect(meta.artist).toBe(MOCK_TRACKS[0]?.artist);
    expect(meta.artwork[0]?.src.startsWith("data:image/svg+xml")).toBe(true);
    expect(meta.artwork[0]?.type).toBe("image/svg+xml");
    expect(fake.raw.playbackState).toBe("paused");
  });

  it("registers play, pause, nexttrack, previoustrack and seekto handlers", () => {
    const { fake } = setup();
    for (const action of ["play", "pause", "nexttrack", "previoustrack", "seekto"]) {
      expect(typeof fake.handlers.get(action)).toBe("function");
    }
  });

  it("drives the player from the handlers and keeps the session in step", () => {
    const { player, fake } = setup();
    fake.handlers.get("play")?.();
    expect(player.getState().status).toBe("playing");
    expect(fake.raw.playbackState).toBe("playing");
    fake.handlers.get("nexttrack")?.();
    expect(player.getState().trackIndex).toBe(1);
    expect((fake.raw.metadata as { title: string }).title).toBe(MOCK_TRACKS[1]?.title);
    fake.handlers.get("previoustrack")?.();
    expect(player.getState().trackIndex).toBe(0);
    fake.handlers.get("pause")?.();
    expect(fake.raw.playbackState).toBe("paused");
  });

  it("reports duration and position", () => {
    const { clock, player, fake } = setup();
    player.play();
    clock.advance(12_000);
    player.pause();
    const last = fake.positions.at(-1) as {
      duration: number;
      position: number;
      playbackRate: number;
    };
    expect(last.duration).toBe(MOCK_TRACKS[0]?.durationSeconds);
    expect(last.position).toBeCloseTo(12, 6);
    expect(last.playbackRate).toBe(1);
  });

  it("removes handlers and metadata on dispose, and stops following the player", () => {
    const { player, fake, dispose } = setup();
    dispose();
    expect(fake.raw.metadata).toBeNull();
    expect(fake.handlers.get("play")).toBeNull();
    player.play();
    expect(fake.raw.playbackState).toBe("none");
  });

  it("seeks the player from the seekto handler", () => {
    const { player, fake } = setup();
    (fake.handlers.get("seekto") as unknown as (d: { seekTime?: number }) => void)({
      seekTime: 42,
    });
    expect(player.getState().positionSeconds).toBe(42);
    expect(() => (fake.handlers.get("seekto") as unknown as (d: object) => void)({})).not.toThrow();
    expect(player.getState().positionSeconds).toBe(42);
  });

  describe("PNG artwork", () => {
    const rasterise = async (_svg: string, size: number): Promise<string | undefined> =>
      `data:image/png;base64,size${size}`;
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    type Art = { src: string; sizes: string; type: string }[];

    function withPng(raster = rasterise) {
      const clock = createManualClock(0);
      const player = new MediaPlayer({ tracks: MOCK_TRACKS, clock });
      const fake = fakeSession();
      const dispose = bindMediaSession(player, {
        mediaSession: fake.session,
        createMetadata,
        rasterise: raster,
      });
      return { player, fake, dispose };
    }

    it("shows the SVG straight away, then offers PNG copies ahead of it", async () => {
      const { fake } = withPng();
      const first = (fake.raw.metadata as { artwork: Art }).artwork;
      expect(first.map((a) => a.type)).toEqual(["image/svg+xml"]);
      await flush();
      const upgraded = (fake.raw.metadata as { artwork: Art }).artwork;
      expect(upgraded.map((a) => a.sizes)).toEqual(["512x512", "256x256", "512x512"]);
      expect(upgraded.map((a) => a.type)).toEqual(["image/png", "image/png", "image/svg+xml"]);
      expect(upgraded[0]?.src).toBe("data:image/png;base64,size512");
    });

    it("keeps the SVG when drawing the PNG fails", async () => {
      const { fake } = withPng(async () => undefined);
      await flush();
      const art = (fake.raw.metadata as { artwork: Art }).artwork;
      expect(art.map((a) => a.type)).toEqual(["image/svg+xml"]);
    });

    it("does not put old artwork on a newer track or on a closed session", async () => {
      const { player, fake, dispose } = withPng();
      player.next();
      await flush();
      const meta = fake.raw.metadata as { title: string; artwork: Art };
      expect(meta.title).toBe(MOCK_TRACKS[1]?.title);
      expect(meta.artwork[0]?.type).toBe("image/png");
      dispose();
      await flush();
      expect(fake.raw.metadata).toBeNull();
    });
  });

  it("does nothing when the browser has no Media Session", () => {
    const player = new MediaPlayer({ tracks: MOCK_TRACKS });
    const dispose = bindMediaSession(player, { mediaSession: undefined });
    expect(() => dispose()).not.toThrow();
  });
});
