export { createWebBluetoothAdapter } from "./adapter";
export type {
  AdapterStatus,
  BluetoothVehicleAdapter,
  CredentialStore,
  StatusDetail,
  WebBluetoothAdapterOptions,
} from "./adapter";
export {
  ALLOWED_UUIDS,
  DEVICE_NAME_PREFIX,
  SERVICE_UUID,
  createWebBluetoothTransport,
  detectSupport,
} from "./web-bluetooth";
export type { BluetoothLike, BrowserEnvironment } from "./web-bluetooth";
export { ChooserCancelledError } from "./transport";
export type {
  BleConnection,
  BleDeviceHandle,
  BleTransport,
  Timers,
  TransportSupport,
  UnsupportedReason,
} from "./transport";
export { createG3Simulator } from "./sim";
export type { G3Simulator, G3SimulatorOptions } from "./sim";
export { G3_LIMITS, G3_SCALES } from "./telemetry";
export { ForbiddenFrameError, READ_TARGETS, isAllowedRequest } from "./guard";
export { READ_REGISTER_LIST } from "./registers";
export type { ReadRegister, RegisterKey } from "./registers";
export type { AuthNeededReason } from "./session";
