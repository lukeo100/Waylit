import type { LatLng, SolarPhase } from "@waylit/core";

/**
 * Map provider interface. Types only.
 *
 * A provider owns the whole renderer, because the primary (CesiumJS with Google Photorealistic
 * 3D Tiles) and the fallback (MapLibre GL JS on OpenFreeMap) are different engines. The app
 * tells a provider where the camera should be and what the light is like, and the provider
 * draws. Navigation logic never imports a provider.
 *
 * Provider SDK types (CesiumJS, MapLibre or others) must never appear here or in other shared
 * packages. Implementations live in `apps/web/src/map`.
 */

export type ProviderId = "cesium-google" | "maplibre-fallback";

/** Text and link a provider requires to be visible while its data is shown. */
export interface ProviderAttribution {
  /** Plain words shown before the linked text, such as "Data from". */
  readonly prefix?: string;
  readonly text: string;
  readonly url?: string;
}

/**
 * Third-person camera pose that follows the rider. The camera looks at `target` from
 * `rangeMetres` away, at `pitchDegrees` below the horizon, from behind the heading.
 * `target` is a point ahead of the rider, which is what puts the rider in the lower middle of
 * the screen. `rider` is where the rider actually is.
 */
export interface CameraPose {
  /** The point the camera looks at, ahead of the rider along the heading. */
  readonly target: LatLng;
  /** The rider's smoothed position. */
  readonly rider: LatLng;
  /** Degrees clockwise from true north. */
  readonly headingDegrees: number;
  /** Degrees below the horizon that the camera looks. */
  readonly pitchDegrees: number;
  /** Distance from camera to target in metres. */
  readonly rangeMetres: number;
  /** Vertical field of view in degrees. */
  readonly verticalFovDegrees: number;
}

/**
 * Scene lighting input. It is the sun's state from `@waylit/core` at the rider's place, for the
 * real time or the developer time override. A provider must not work out its own time of day.
 */
export interface SceneLighting {
  /** Milliseconds since the Unix epoch used to place the sun. */
  readonly timestamp: number;
  /** Where the rider is. */
  readonly position: LatLng;
  /** Sun elevation in degrees above the horizon. Negative at night. */
  readonly sunElevationDegrees: number;
  /** Sun azimuth as a compass bearing, degrees clockwise from true north. */
  readonly sunAzimuthDegrees: number;
  /** Day, golden hour, twilights or night. */
  readonly phase: SolarPhase;
  /** Smooth daylight from 0 (dark) to 1 (full day). */
  readonly daylightFactor: number;
  /** How warm and low the light is, from 0 to 1. Peaks at sunrise and sunset. */
  readonly warmth: number;
}

export interface ProviderCapabilities {
  /** True when the provider can show 3D buildings or reality mesh tiles. */
  readonly threeDimensional: boolean;
  /** True when the provider shows photorealistic imagery. */
  readonly photorealistic: boolean;
  /** True when the provider needs a token or key from the deployer. */
  readonly requiresKey: boolean;
  /** True when the provider may read ground heights from its own content. Google tiles: never. */
  readonly mayReadSurfaceHeights: boolean;
}

/**
 * Opaque handles to wherever the provider renders. On the web these are DOM elements, on
 * native they may be view references. Kept opaque so shared code stays platform neutral.
 */
export interface ProviderMountTarget {
  /** Where the 3D scene is drawn. */
  readonly scene: unknown;
  /** Where the provider renders its required credits and logos. Nothing may cover it. */
  readonly credits: unknown;
}

/** What the rider is doing, which sets how hard the provider works. */
export type ProviderActivity = "idle" | "riding" | "paused";

/** Why a provider could not run. Never contains a token or a URL with one. */
export type ProviderFailureKind =
  "unsupported" | "auth" | "quota" | "network" | "render" | "unknown";

export type ProviderStatus =
  | { readonly state: "loading" }
  | { readonly state: "ready" }
  | { readonly state: "failed"; readonly kind: ProviderFailureKind; readonly message: string };

export type ProviderStatusListener = (status: ProviderStatus) => void;

/** Called just before each frame. The app moves the camera in here. */
export type FrameListener = (nowMs: number) => void;

/** Numbers for the dev overlay, if the provider can supply them. */
export interface ProviderDiagnostics {
  readonly tilesLoaded?: number;
  readonly tilesPending?: number;
  readonly tilesTotal?: number;
  readonly requests?: number;
  readonly memoryMegabytes?: number;
  /** Cesium ion root tileset requests made by this page since it loaded. */
  readonly rootRequests?: number;
  readonly detail?: string;
}

/** Frame timing over the last minute, in frames per second and milliseconds. */
export interface FrameStatsSummary {
  /** Frames per second over the last second. */
  readonly currentFps: number;
  /** Median frames per second over the last 60 seconds. */
  readonly medianFps: number;
  /** Frames per second at the 99th percentile frame time (the slowest 1 percent of frames). */
  readonly onePercentLowFps: number;
  /** The most recent frame time in milliseconds. */
  readonly lastFrameMs: number;
  /** Frames counted in the window. */
  readonly sampleCount: number;
  /**
   * Median frames per second over the last 5 minutes. Success criterion 9 asks for a median of
   * at least 30 fps over a 5 minute ride, so this is the figure to read at the end of one.
   */
  readonly median5MinFps: number;
  /** Median frames per second since the ride started (the stats were last reset). */
  readonly medianRideFps: number;
  /** Seconds of drawn frames counted since the ride started. */
  readonly rideSeconds: number;
}

export interface MapProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  /** Credits the app can show as text. Providers also render their own live credits into the strip. */
  readonly attributions: readonly ProviderAttribution[];
  mount(target: ProviderMountTarget): Promise<void>;
  /** Releases the renderer, its WebGL context and everything it put in the credits strip. */
  unmount(): void;
  setCamera(pose: CameraPose): void;
  setLighting(lighting: SceneLighting): void;
  /** Idle (start screen) draws slowly, riding at the target rate, paused draws nothing. */
  setActivity(activity: ProviderActivity): void;
  /** Registers a callback that runs before each frame. Returns a function that removes it. */
  onFrame(listener: FrameListener): () => void;
  onStatus(listener: ProviderStatusListener): () => void;
  getDiagnostics(): ProviderDiagnostics;
  getFrameStats(): FrameStatsSummary;
}

/** Configuration passed to a provider factory. Keys come from the deployer's environment. */
export interface MapProviderConfig {
  readonly apiKey?: string;
}

export type MapProviderFactory = (config: MapProviderConfig) => MapProvider;
