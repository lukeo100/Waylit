import type { MediaTrack } from "./media";

/**
 * Placeholder tracks for the mock media player. Everything here is original to Waylit:
 * the titles, artists and albums are invented, any resemblance to a real act or release is
 * coincidence, and the "music" is a short pattern of notes that the web app synthesises.
 * There are no recordings, no real artists and no third party artwork.
 */
export const MOCK_TRACKS: readonly MediaTrack[] = [
  {
    id: "mock-001",
    title: "Lantern Lap",
    artist: "The Placeholders",
    album: "Demo Reel One",
    durationSeconds: 184,
    artwork: { palette: ["#0b1d3a", "#2f6bff", "#22d3ee"], seed: 11 },
    tone: {
      rootHz: 220,
      scale: [0, 2, 3, 5, 7, 8, 10],
      pattern: [0, 2, 4, 2, 5, 4, 2, -1],
      bpm: 96,
      waveform: "triangle",
    },
  },
  {
    id: "mock-002",
    title: "Quiet Crosswalk",
    artist: "Sample Rate",
    album: "Demo Reel One",
    durationSeconds: 212,
    artwork: { palette: ["#1a1033", "#7c3aed", "#f0abfc"], seed: 23 },
    tone: {
      rootHz: 196,
      scale: [0, 2, 4, 7, 9],
      pattern: [0, 1, 2, 4, 3, 2, 1, -1],
      bpm: 84,
      waveform: "sine",
    },
  },
  {
    id: "mock-003",
    title: "Tailwind Static",
    artist: "Mock Orchestra",
    album: "Test Signal",
    durationSeconds: 157,
    artwork: { palette: ["#06231f", "#10b981", "#a7f3d0"], seed: 37 },
    tone: {
      rootHz: 246.94,
      scale: [0, 2, 4, 5, 7, 9, 11],
      pattern: [0, 4, 2, 5, 4, 6, 5, 2],
      bpm: 118,
      waveform: "square",
    },
  },
  {
    id: "mock-004",
    title: "Low Battery Waltz",
    artist: "Nobody in Particular",
    album: "Test Signal",
    durationSeconds: 198,
    artwork: { palette: ["#2b1205", "#f97316", "#fde68a"], seed: 41 },
    tone: {
      rootHz: 174.61,
      scale: [0, 3, 5, 7, 10],
      pattern: [0, 2, 4, -1, 3, 2, 1, -1],
      bpm: 72,
      waveform: "triangle",
    },
  },
  {
    id: "mock-005",
    title: "Green Light Loop",
    artist: "The Placeholders",
    album: "Demo Reel Two",
    durationSeconds: 143,
    artwork: { palette: ["#0f172a", "#38bdf8", "#e0f2fe"], seed: 53 },
    tone: {
      rootHz: 261.63,
      scale: [0, 2, 4, 7, 9],
      pattern: [4, 3, 2, 0, 2, 3, 4, 4],
      bpm: 108,
      waveform: "sine",
    },
  },
];
