import type { MediaState, MediaTrack } from "@waylit/core";

/**
 * Makes the mock tracks audible with the Web Audio API. Each track is a short looping
 * pattern of synthesised notes (see `ToneSpec` in `@waylit/core`), so there are no audio
 * files and nothing third party. It is quiet and simple on purpose.
 *
 * Browsers only start audio after a user gesture. Call `apply` from a click or a Media
 * Session action, which count as gestures, and the first call unlocks audio.
 */

export interface ToneEngine {
  /** Brings the sound in line with the player state: starts, stops or restarts as needed. */
  apply(state: MediaState): void;
  /** Stops the sound and releases the audio resources. */
  dispose(): void;
}

const LOOKAHEAD_SECONDS = 0.4;
const SCHEDULE_INTERVAL_MS = 100;
const MASTER_GAIN = 0.12;
/** If the player position drifts from the sound by more than this, restart the sound. */
const RESYNC_SECONDS = 1;

interface ActiveRun {
  readonly trackId: string;
  /** Position in the track, in seconds, when this run began. */
  readonly offsetSeconds: number;
  /** Audio clock time when this run began. */
  readonly startedAt: number;
  nextNoteTime: number;
  noteIndex: number;
  timer: number;
}

/** Returns undefined where Web Audio is not available. */
export function createToneEngine(): ToneEngine | undefined {
  const Context =
    typeof window === "undefined"
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Context) return undefined;

  let context: AudioContext | undefined;
  let output: AudioNode | undefined;
  let element: HTMLAudioElement | undefined;
  let run: ActiveRun | undefined;

  const ensureContext = (): AudioContext => {
    if (context) return context;
    const ctx = new Context();
    const master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    // Route through a media element so the browser treats the page as playing media, which
    // is what makes the Media Session controls appear. Fall back to the speakers directly.
    if (typeof ctx.createMediaStreamDestination === "function" && typeof Audio !== "undefined") {
      const destination = ctx.createMediaStreamDestination();
      master.connect(destination);
      element = new Audio();
      element.srcObject = destination.stream;
    } else {
      master.connect(ctx.destination);
    }
    output = master;
    context = ctx;
    return ctx;
  };

  const stepSeconds = (track: MediaTrack): number => 60 / track.tone.bpm / 2;

  const scheduleNote = (
    ctx: AudioContext,
    track: MediaTrack,
    index: number,
    time: number,
    step: number,
  ): void => {
    const { tone } = track;
    const slot = index % tone.pattern.length;
    const degree = tone.pattern[slot] ?? -1;
    if (output === undefined) return;
    const play = (hz: number, type: OscillatorType, peak: number, length: number): void => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(hz, time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(peak, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
      osc.connect(gain).connect(output as AudioNode);
      osc.start(time);
      osc.stop(time + length + 0.02);
    };
    if (degree >= 0) {
      const semitones = tone.scale[degree % tone.scale.length] ?? 0;
      play(tone.rootHz * 2 ** (semitones / 12), tone.waveform, 0.5, step * 1.6);
    }
    if (slot === 0) play(tone.rootHz / 2, "sine", 0.7, step * 6);
  };

  const stopRun = (): void => {
    if (run) {
      window.clearInterval(run.timer);
      run = undefined;
    }
    element?.pause();
  };

  const startRun = (track: MediaTrack, offsetSeconds: number): void => {
    stopRun();
    const ctx = ensureContext();
    void ctx.resume();
    void element?.play().catch(() => undefined);
    const step = stepSeconds(track);
    const first = Math.floor(offsetSeconds / step);
    const current: ActiveRun = {
      trackId: track.id,
      offsetSeconds,
      startedAt: ctx.currentTime,
      nextNoteTime: ctx.currentTime + 0.05,
      noteIndex: first,
      timer: 0,
    };
    const pump = (): void => {
      while (current.nextNoteTime < ctx.currentTime + LOOKAHEAD_SECONDS) {
        scheduleNote(ctx, track, current.noteIndex, current.nextNoteTime, step);
        current.nextNoteTime += step;
        current.noteIndex += 1;
      }
    };
    pump();
    current.timer = window.setInterval(pump, SCHEDULE_INTERVAL_MS);
    run = current;
  };

  return {
    apply(state) {
      if (state.status === "paused") {
        stopRun();
        return;
      }
      if (run && run.trackId === state.track.id && context) {
        const expected = run.offsetSeconds + (context.currentTime - run.startedAt);
        if (Math.abs(expected - state.positionSeconds) <= RESYNC_SECONDS) return;
      }
      startRun(state.track, state.positionSeconds);
    },
    dispose() {
      stopRun();
      if (element) element.srcObject = null;
      void context?.close();
      context = undefined;
      output = undefined;
      element = undefined;
    },
  };
}
