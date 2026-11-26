import type { AdapterStatus, StatusDetail, UnsupportedReason } from "@waylit/vehicle";

/**
 * The rider's vehicle choice and the words the Vehicle section shows. Pure functions and a small
 * store, so they run in tests with no browser.
 *
 * - `mock` is the default: simulated MAX G3 telemetry.
 * - `g3` is the real scooter over Bluetooth, read only.
 * - `g3sim` is a desk simulator of that Bluetooth link, for development. It can only be chosen
 *   with `?vehicle=g3sim` in the address.
 *
 * The choice is remembered in localStorage (a blocked store just means it is not remembered),
 * and `?vehicle=mock|g3|g3sim` in the address wins over it.
 */

export type VehicleChoice = "mock" | "g3";
export type VehicleMode = "mock" | "g3" | "g3sim";

export const VEHICLE_STORAGE_KEY = "waylit:vehicle:v1";

export interface VehicleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Reads `?vehicle=`. Anything else is ignored. */
export function parseVehicleParam(search: string): VehicleMode | undefined {
  const value = new URLSearchParams(search).get("vehicle");
  return value === "mock" || value === "g3" || value === "g3sim" ? value : undefined;
}

export function parseStoredVehicle(raw: string | null | undefined): VehicleChoice | undefined {
  if (!raw) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return undefined;
    const choice = (value as Record<string, unknown>)["vehicle"];
    return choice === "mock" || choice === "g3" ? choice : undefined;
  } catch {
    return undefined;
  }
}

export function readStoredVehicle(storage: VehicleStorage | null): VehicleChoice | undefined {
  try {
    return parseStoredVehicle(storage?.getItem(VEHICLE_STORAGE_KEY));
  } catch {
    return undefined;
  }
}

export interface ResolvedVehicle {
  readonly mode: VehicleMode;
  /** True when `?vehicle=` decides, so the sheet cannot change it. */
  readonly lockedByAddress: boolean;
}

/** The address wins, then the stored choice, then the mock. */
export function resolveVehicle(search: string, stored: VehicleChoice | undefined): ResolvedVehicle {
  const fromAddress = parseVehicleParam(search);
  if (fromAddress !== undefined) return { mode: fromAddress, lockedByAddress: true };
  return { mode: stored ?? "mock", lockedByAddress: false };
}

export function writeStoredVehicle(storage: VehicleStorage | null, choice: VehicleChoice): void {
  try {
    storage?.setItem(VEHICLE_STORAGE_KEY, JSON.stringify({ vehicle: choice }));
  } catch {
    // Storage can be blocked. The choice still holds for this page.
  }
}

/** How a status line is coloured. Amber needs attention, red is a real error, the rest is quiet. */
export type StatusTone = "quiet" | "attention" | "error" | "ok";

export const VEHICLE_TEXT = {
  title: "Vehicle",
  mockOption: "Mock",
  g3Option: "MAX G3 (Bluetooth)",
  choiceLabel: "Vehicle",
  mockNote: "Simulated scooter data. This is the default.",
  readOnly: "Reads only. Waylit never sends control commands.",
  screenOn: "Keep the screen on while riding.",
  officialApp:
    "Close the official Segway app first, it may hold the connection. Pairing with a real scooter is unverified.",
  locked: "The address sets the vehicle (?vehicle=). Remove it to change the vehicle here.",
  simulator: "Desk simulator. No real scooter is used.",
  connect: "Connect",
  disconnect: "Disconnect",
  pair: "Pair this phone",
  forget: "Forget pairing",
  pairWarning:
    "Pairing stores a new secret on the scooter. It may sign the official app out of it, and you may need to press the scooter's button. Only do this if you accept that.",
  whileRiding: "Connecting is off while riding fast.",
  trademark: "Not affiliated with Segway. The name only says which vehicle is supported.",
} as const;

const UNSUPPORTED_TEXT: Readonly<Record<UnsupportedReason, string>> = {
  ios: "Bluetooth is not available in iPhone and iPad browsers. Use Chrome on an Android phone.",
  "insecure-context": "Bluetooth needs a secure (HTTPS) page.",
  "no-web-bluetooth": "This browser has no Web Bluetooth. Use Chrome on an Android phone.",
};

const DETAIL_TEXT: Readonly<Partial<Record<StatusDetail, string>>> = {
  "not-paired": "This phone is not paired with the scooter yet.",
  rejected: "The scooter did not accept this phone's pairing.",
  "pairing-timeout":
    "Pairing timed out. If the scooter asks for a button press, press it and try again.",
  "chooser-cancelled": "No scooter was picked.",
  "link-lost": "Link lost. Using GPS speed.",
  "needs-tap": "Not connected. Tap Connect to try again. Using GPS speed.",
  "no-answer": "The scooter did not answer. Check that it is switched on and close by.",
  "no-telemetry": "Connected, but the scooter did not answer telemetry requests. Using GPS speed.",
  "connect-failed":
    "Could not connect. Check that it is switched on, close by, and not held by another app.",
  protocol: "The scooter sent something unexpected, so Waylit stopped. Using GPS speed.",
};

export interface StatusLine {
  readonly text: string;
  readonly tone: StatusTone;
}

/** The quiet state line for the Vehicle section. */
export function describeVehicleStatus(status: AdapterStatus): StatusLine {
  switch (status.state) {
    case "idle":
      return { text: "Not connected.", tone: "quiet" };
    case "connecting":
      return { text: "Connecting", tone: "quiet" };
    case "authenticating":
      return { text: "Setting up a secure link", tone: "quiet" };
    case "connected":
      return { text: "Connected. Reading speed, battery and range.", tone: "ok" };
    case "auth-needed":
      return {
        text: DETAIL_TEXT[status.detail ?? "not-paired"] ?? "Pairing is needed.",
        tone: "attention",
      };
    case "disconnected":
      if (status.detail === "needs-tap")
        return { text: DETAIL_TEXT["needs-tap"] ?? "", tone: "attention" };
      if (status.detail === "link-lost")
        return { text: DETAIL_TEXT["link-lost"] ?? "", tone: "attention" };
      return { text: "Not connected.", tone: "quiet" };
    case "unsupported": {
      const reason = status.detail as UnsupportedReason | undefined;
      return {
        text:
          (reason !== undefined ? UNSUPPORTED_TEXT[reason] : undefined) ??
          UNSUPPORTED_TEXT["no-web-bluetooth"],
        tone: "quiet",
      };
    }
    case "error":
      return {
        text: DETAIL_TEXT[status.detail ?? "connect-failed"] ?? DETAIL_TEXT["connect-failed"] ?? "",
        tone: "error",
      };
  }
}

export interface VehicleActionState {
  readonly connectDisabled: boolean;
  readonly connectLabel: string;
  readonly showPair: boolean;
  /** Why connecting is off, when it is for a reason the rider can act on. */
  readonly hint: string | undefined;
}

/** Which buttons the section shows, given the status and whether the speed guard is on. */
export function vehicleActions(status: AdapterStatus, guarded: boolean): VehicleActionState {
  const busy = status.state === "connecting" || status.state === "authenticating";
  const unsupported = status.state === "unsupported";
  const connected = status.state === "connected";
  return {
    connectDisabled: unsupported || busy || guarded,
    connectLabel: connected ? VEHICLE_TEXT.disconnect : VEHICLE_TEXT.connect,
    showPair: status.state === "auth-needed",
    hint: guarded && !unsupported ? VEHICLE_TEXT.whileRiding : undefined,
  };
}
