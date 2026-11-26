import type { Unsubscribe } from "../types";

/**
 * The Bluetooth seam. The adapter and the session only see these interfaces, so tests and the
 * desk simulator can stand in for a real radio and the real Web Bluetooth code stays small.
 */

/** Why Bluetooth cannot be used here. */
export type UnsupportedReason = "no-web-bluetooth" | "insecure-context" | "ios";

export type TransportSupport =
  { readonly supported: true } | { readonly supported: false; readonly reason: UnsupportedReason };

/** One open GATT link to a scooter, already subscribed to notifications. */
export interface BleConnection {
  /** Largest piece to write at once, in bytes. */
  readonly writePieceSize: number;
  /** Writes one piece. The session makes sure only one write is ever in flight. */
  write(piece: Uint8Array): Promise<void>;
  /** Notification pieces from the vehicle. */
  onNotify(listener: (piece: Uint8Array) => void): Unsubscribe;
  /** Fires once when the link drops, for any reason, including `close`. */
  onDisconnect(listener: () => void): Unsubscribe;
  /** Drops the link and removes every listener. Safe to call twice. */
  close(): Promise<void>;
}

/** A scooter the rider picked in the chooser. Reconnecting does not need the chooser again. */
export interface BleDeviceHandle {
  /** The advertised name. It is part of the key for the handshake, and is never shown or logged. */
  readonly name: string;
  connect(): Promise<BleConnection>;
}

export interface BleTransport {
  support(): TransportSupport;
  /** Shows the chooser. In a browser this only works from a tap. */
  requestDevice(): Promise<BleDeviceHandle>;
}

/** The chooser was closed with nothing picked. This is not an error. */
export class ChooserCancelledError extends Error {
  constructor() {
    super("No scooter was picked");
    this.name = "ChooserCancelledError";
  }
}

export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const defaultTimers: Timers = {
  setTimeout: (callback, ms) => (globalThis as unknown as BareTimers).setTimeout(callback, ms),
  clearTimeout: (handle) => {
    (globalThis as unknown as BareTimers).clearTimeout(handle);
  },
};

interface BareTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
