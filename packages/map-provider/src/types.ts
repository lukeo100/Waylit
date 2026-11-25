import type { LatLng, SolarPhase, TurnDirection, TurnPhase } from "@waylit/core";
import type { FxLevel } from "./fx";

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

/**
 * What the hologram layer draws, besides the map itself. Every item is placed from the
 * route and the rider, never from the map content, so a provider can draw it at a ground height
 * of its own choosing (a constant in Google mode, open terrain in the fallback).
 *
 *   rider    the holographic rider on the original kick scooter
 *   heading  a ring and a cone on the ground at the rider's base
 *   chevron  a floating arrow ahead on the route
 *   beacon   a vertical light column at the next turn
 */
export type HoloKind = "rider" | "heading" | "chevron" | "beacon";

export interface HoloItem {
  readonly kind: HoloKind;
  readonly position: LatLng;
  /** Degrees clockwise from true north. For a chevron this is the direction of travel. */
  readonly headingDegrees: number;
  /** Uniform scale. 1 is the model's own size. */
  readonly scale: number;
  /** Overall opacity from 0 to 1. */
  readonly alpha: number;
  /** A 0 to 1 value that travels along the route, which the shader turns into a soft pulse. */
  readonly pulse: number;
  /** Metres above the provider's ground, so chevrons float. */
  readonly liftMetres: number;
  /**
   * For a chevron, its whole number place along the route (distance divided by the spacing), which
   * never changes as the rider moves. A provider that draws fewer chevrons on a slow phone keeps
   * the ones whose slot divides evenly, so the same ones stay.
   */
  readonly slot?: number;
}

/** The turn beacon's state, for the countdown text the app draws next to the light column. */
export interface BeaconState {
  /** Where the column stands. */
  readonly position: LatLng;
  readonly direction: TurnDirection;
  readonly phase: TurnPhase;
  /** The countdown as text, for example "120 m". */
  readonly label: string;
  readonly distanceMetres: number;
  /** Height of the top of the column above the ground, in metres. */
  readonly heightMetres: number;
}

/** One frame of guidance: what to draw now. Built by `RouteGuide`, drawn by a provider. */
export interface GuidanceFrame {
  readonly nowMs: number;
  /** Distance along the route of the rider, in metres. */
  readonly alongMetres: number;
  /** True when the rider is far from the route, so no chevrons or beacon are drawn. */
  readonly offRoute: boolean;
  readonly items: readonly HoloItem[];
  readonly beacon: BeaconState | undefined;
}

/** The static route shape a provider draws as the glowing corridor. Built once per route. */
export interface CorridorShape {
  /** The route's own points, from start to end. */
  readonly centre: readonly LatLng[];
  readonly widthMetres: number;
  /** The corridor's left and right edges, as lines. */
  readonly leftRail: readonly LatLng[];
  readonly rightRail: readonly LatLng[];
  /** A closed ring that outlines the whole ribbon (left edge forward, right edge back). */
  readonly ribbon: readonly LatLng[];
  readonly railWidthMetres: number;
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
  /** The futuristic effect level in use now: off, low or high (see fx.ts). */
  readonly fxLevel?: string;
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
  /**
   * Optional. Changes the screen effect level on the running scene without starting it again,
   * which matters for Google tiles (a new start costs a Cesium ion root request). Returns true
   * when it was applied, false when the provider has to be started again. `pinned` is true when
   * the level was chosen, so the adaptive step down leaves it alone.
   */
  setFxLevel?(level: FxLevel, pinned: boolean): boolean;
  /** The route to draw as a glowing corridor on the road. Called once, before or after mount. */
  setRoute(corridor: CorridorShape): void;
  /** What the hologram layer draws this frame: rider, heading marker, chevrons and beacon. */
  setGuidance(frame: GuidanceFrame): void;
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
