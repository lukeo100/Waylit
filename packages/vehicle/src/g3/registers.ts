/**
 * The read registers Waylit asks a MAX G3 for. This list is also the allowlist: a read frame for
 * any other register cannot be built (see `guard.ts`).
 *
 * Register numbers come from the MAX G3 page of the reverse engineering documentation credited
 * in docs/THIRD_PARTY.md. That page gives each register's number and size but not its unit or
 * scale, and it does not say which board answers. Units here are provisional guesses that must
 * be checked against the scooter's own display (see docs/VEHICLE.md), and the answering board
 * is found by trying the candidates in `READ_TARGETS`.
 */

export type RegisterKey =
  | "speed"
  | "battery"
  | "totalMileage"
  | "tripMileage"
  | "range"
  | "gearMode"
  | "temperature"
  | "errorCode"
  | "warningCode";

export interface ReadRegister {
  readonly key: RegisterKey;
  /** Register number. */
  readonly index: number;
  /** Bytes to read. */
  readonly size: 2 | 4;
  /** Name in the documentation, for reading the docs next to the code. */
  readonly docName: string;
}

export const READ_REGISTERS: Readonly<Record<RegisterKey, ReadRegister>> = {
  speed: { key: "speed", index: 0x57, size: 2, docName: "rSpeed" },
  battery: { key: "battery", index: 0x55, size: 2, docName: "rBattery" },
  totalMileage: { key: "totalMileage", index: 0x62, size: 4, docName: "rMileage" },
  tripMileage: { key: "tripMileage", index: 0x68, size: 2, docName: "rSingleMileage" },
  range: { key: "range", index: 0x5f, size: 2, docName: "rLeftMileage" },
  gearMode: { key: "gearMode", index: 0x5a, size: 2, docName: "rGearMode" },
  temperature: { key: "temperature", index: 0x6b, size: 2, docName: "rBodyTemp" },
  errorCode: { key: "errorCode", index: 0x58, size: 2, docName: "rErrorCode" },
  warningCode: { key: "warningCode", index: 0x59, size: 2, docName: "rWarnCode" },
};

export const READ_REGISTER_LIST: readonly ReadRegister[] = Object.values(READ_REGISTERS);

/** Finds an allowlisted register by its number. */
export function findReadRegister(index: number): ReadRegister | undefined {
  return READ_REGISTER_LIST.find((register) => register.index === index);
}
