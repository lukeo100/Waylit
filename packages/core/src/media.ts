import { systemClock, type Clock } from "./clock";

/**
 * Media model shared by every platform. It describes tracks and holds the playback state
 * (play, pause, next, previous, progress). It plays no sound. A platform layer reads the
 * state and makes the sound, and also mirrors it to the system media controls. In the web
 * app that layer lives in `apps/web/src/media`.
 */

/** A short synthesised pattern a platform layer can play for a mock track. */
export interface ToneSpec {
  /** Root note in hertz. */
  readonly rootHz: number;
  /** Semitone offsets from the root that make up the scale. */
  readonly scale: readonly number[];
  /** Notes to play in order, as indexes into `scale`. A negative number is a rest. */
  readonly pattern: readonly number[];
  readonly bpm: number;
  readonly waveform: "sine" | "triangle" | "square" | "sawtooth";
}

export interface MediaArtworkSpec {
  /** Two or three CSS colours the generated artwork is built from. */
  readonly palette: readonly string[];
  /** Picks the shape layout. Any integer. */
  readonly seed: number;
}

export interface MediaTrack {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly durationSeconds: number;
  readonly artwork: MediaArtworkSpec;
  readonly tone: ToneSpec;
}

export type PlaybackStatus = "playing" | "paused";

export interface MediaState {
  readonly status: PlaybackStatus;
  readonly trackIndex: number;
  readonly track: MediaTrack;
  readonly trackCount: number;
  /** Seconds into the current track. */
  readonly positionSeconds: number;
  readonly durationSeconds: number;
  /** Progress through the current track, 0 to 1. */
  readonly progress: number;
}

export type MediaListener = (state: MediaState) => void;

/** What the UI and the system media controls can ask a player to do. */
export interface MediaControls {
  play(): void;
  pause(): void;
  toggle(): void;
  next(): void;
  previous(): void;
  /** Jumps to a position in the current track, in seconds. It is clamped to the track. */
  seek(seconds: number): void;
}

export interface MediaPlayerOptions {
  readonly tracks: readonly MediaTrack[];
  readonly clock?: Clock;
  /** Index of the first track. Default 0. */
  readonly startIndex?: number;
  /** Pressing previous after this many seconds restarts the track instead. Default 3. */
  readonly restartThresholdSeconds?: number;
}

/**
 * Playback state machine. Position is worked out from the clock, so the player needs no
 * timer: ask for `getState()` whenever you want fresh progress. When a track ends the player
 * moves on to the next one, and wraps from the last track to the first.
 */
export class MediaPlayer implements MediaControls {
  private readonly tracks: readonly MediaTrack[];
  private readonly clock: Clock;
  private readonly restartThreshold: number;
  private readonly listeners = new Set<MediaListener>();

  private index: number;
  private status: PlaybackStatus = "paused";
  /** Position in the current track as of `anchorMs`. */
  private anchorPosition = 0;
  private anchorMs: number;

  constructor(options: MediaPlayerOptions) {
    if (options.tracks.length === 0) {
      throw new Error("A media player needs at least one track.");
    }
    if (options.tracks.some((track) => !(track.durationSeconds > 0))) {
      throw new Error("Every track needs a duration above 0 seconds.");
    }
    this.tracks = options.tracks;
    this.clock = options.clock ?? systemClock;
    this.restartThreshold = options.restartThresholdSeconds ?? 3;
    this.index = Math.min(Math.max(options.startIndex ?? 0, 0), this.tracks.length - 1);
    this.anchorMs = this.clock.now();
  }

  /** Current state with up-to-date progress. Listeners hear about a track change it causes. */
  getState(): MediaState {
    const changed = this.sync();
    const state = this.snapshot();
    if (changed) this.notify(state);
    return state;
  }

  subscribe(listener: MediaListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  play(): void {
    this.sync();
    if (this.status === "playing") return;
    this.status = "playing";
    this.anchorMs = this.clock.now();
    this.notify(this.snapshot());
  }

  pause(): void {
    this.sync();
    if (this.status === "paused") return;
    this.anchorPosition = this.currentPosition();
    this.status = "paused";
    this.anchorMs = this.clock.now();
    this.notify(this.snapshot());
  }

  toggle(): void {
    if (this.getState().status === "playing") this.pause();
    else this.play();
  }

  next(): void {
    this.sync();
    this.goTo((this.index + 1) % this.tracks.length);
  }

  previous(): void {
    this.sync();
    if (this.currentPosition() > this.restartThreshold) {
      this.goTo(this.index);
    } else {
      this.goTo((this.index - 1 + this.tracks.length) % this.tracks.length);
    }
  }

  /** Pauses and goes back to the start of the first track. Listeners are told once. */
  stop(): void {
    this.sync();
    this.status = "paused";
    this.index = 0;
    this.anchorPosition = 0;
    this.anchorMs = this.clock.now();
    this.notify(this.snapshot());
  }

  seek(seconds: number): void {
    this.sync();
    const duration = this.currentTrack().durationSeconds;
    this.anchorPosition = Math.min(Math.max(seconds, 0), duration);
    this.anchorMs = this.clock.now();
    this.notify(this.snapshot());
  }

  private currentTrack(): MediaTrack {
    return this.tracks[this.index] as MediaTrack;
  }

  private currentPosition(): number {
    if (this.status !== "playing") return this.anchorPosition;
    return this.anchorPosition + (this.clock.now() - this.anchorMs) / 1000;
  }

  /** Moves to the next track when the current one has run out. Returns true if it did. */
  private sync(): boolean {
    if (this.status !== "playing") return false;
    let changed = false;
    let position = this.currentPosition();
    let duration = this.currentTrack().durationSeconds;
    // A while loop covers a long gap between calls, such as a hidden tab.
    while (position >= duration) {
      position -= duration;
      this.index = (this.index + 1) % this.tracks.length;
      duration = this.currentTrack().durationSeconds;
      changed = true;
    }
    if (changed) {
      this.anchorPosition = position;
      this.anchorMs = this.clock.now();
    }
    return changed;
  }

  private goTo(index: number): void {
    this.index = index;
    this.anchorPosition = 0;
    this.anchorMs = this.clock.now();
    this.notify(this.snapshot());
  }

  private snapshot(): MediaState {
    const track = this.currentTrack();
    const positionSeconds = Math.min(this.currentPosition(), track.durationSeconds);
    return {
      status: this.status,
      trackIndex: this.index,
      track,
      trackCount: this.tracks.length,
      positionSeconds,
      durationSeconds: track.durationSeconds,
      progress: track.durationSeconds > 0 ? positionSeconds / track.durationSeconds : 0,
    };
  }

  private notify(state: MediaState): void {
    for (const listener of this.listeners) listener(state);
  }
}
