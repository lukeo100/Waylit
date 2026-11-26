import { bearingDegrees, type LatLng, type Route } from "@waylit/core";
import {
  FollowCamera,
  type FxLevel,
  RouteGuide,
  freeRideFrame,
  type MapProvider,
  type ProviderActivity,
  type ProviderDiagnostics,
  type ProviderId,
  type ProviderSelection,
  type ProviderStatus,
  type RenderTuning,
  type SceneLighting,
} from "@waylit/map-provider";

/**
 * Runs the 3D scene for the riding screen, with no React in it. It owns three things and keeps
 * navigation apart from rendering:
 *
 *   - the follow camera (pure maths) that is fed rider fixes and gives one pose per frame,
 *   - the route guide (pure maths) that turns the route and that pose into what the hologram
 *     layer draws: the corridor, the chevrons, the turn beacon with its countdown, the rider and
 *     the heading marker,
 *   - the current provider, which draws and knows nothing about the route or the HUD,
 *   - the fallback rule: if the Cesium provider fails to start or fails while running, it is
 *     dropped once and the MapLibre fallback starts in its place, with a short note. It never
 *     retries Cesium, because each attempt can use some of the monthly allowance.
 *
 * Providers are created through `createProvider`, so tests can pass fakes.
 */

export interface RiderFix {
  readonly position: LatLng;
  readonly headingDegrees?: number | undefined;
}

export interface SceneState {
  readonly selection: ProviderSelection;
  /** The provider that is running, once there is one. */
  readonly providerId: ProviderId | undefined;
  readonly status: ProviderStatus["state"];
  /** A quiet note for the rider, such as that the fallback map is in use. */
  readonly note: string | undefined;
  /** True when the note is a warning (amber), false when it is just information. */
  readonly warning: boolean;
}

export interface SceneControllerOptions {
  readonly sceneElement: unknown;
  readonly creditsElement: unknown;
  readonly selection: ProviderSelection;
  /**
   * The route to guide along. Its corridor is drawn by whichever provider is running. Undefined
   * for a free ride (live GPS): then there is no corridor, no chevrons and no turn beacon, only
   * the rider and the heading marker.
   */
  readonly route: Route | undefined;
  readonly tuningFor: (id: ProviderId) => RenderTuning;
  readonly createProvider: (id: ProviderId, tuning: RenderTuning) => Promise<MapProvider>;
  /** Where the camera starts, before the first fix. */
  readonly startFix: RiderFix;
  /** A steadily increasing time in milliseconds, such as `performance.now`. */
  readonly now: () => number;
  readonly onState: (state: SceneState) => void;
}

/** Wording for the notes. Plain and short, and they never carry a raw error. */
export const NOTES = {
  noTokenRequested: "No Cesium ion token is set. Showing the simple map.",
  unavailable: "The 3D map cannot run on this device.",
} as const;

export class MapSceneController {
  private readonly options: SceneControllerOptions;
  private readonly camera = new FollowCamera();
  private readonly guide: RouteGuide | undefined;
  private provider: MapProvider | undefined;
  private removeFrame: (() => void) | undefined;
  private removeStatus: (() => void) | undefined;
  private disposed = false;
  private mounting: MapProvider | undefined;
  private activity: ProviderActivity = "idle";
  private lighting: SceneLighting | undefined;
  private sessionAlong: number | undefined;
  private state: SceneState;

  constructor(options: SceneControllerOptions) {
    this.options = options;
    this.guide = options.route ? new RouteGuide(options.route) : undefined;
    this.camera.snapTo(options.startFix, options.now());
    this.state = {
      selection: options.selection,
      providerId: undefined,
      status: "loading",
      note:
        options.selection.reason === "override-cesium-no-token"
          ? NOTES.noTokenRequested
          : undefined,
      warning: false,
    };
  }

  getState(): SceneState {
    return this.state;
  }

  /** The running provider's own numbers, for the dev overlay. */
  getDiagnostics(): ProviderDiagnostics | undefined {
    return this.provider?.getDiagnostics();
  }

  getFrameStats(): ReturnType<MapProvider["getFrameStats"]> | undefined {
    return this.provider?.getFrameStats();
  }

  async start(): Promise<void> {
    const first = this.options.selection.id;
    const started = await this.run(first);
    if (started || this.disposed) return;
    if (first !== "maplibre-fallback") await this.run("maplibre-fallback");
  }

  /** Feed a fix from the simulated GPS. The first one snaps the camera to the rider. */
  setRider(fix: RiderFix): void {
    this.camera.setFix(fix, this.options.now());
  }

  /**
   * The ride session's distance along the route, in metres: the same number the HUD counts the
   * next turn from. The turn beacon uses it so its countdown and the HUD's never disagree.
   * Pass undefined when there is no ride, and the beacon falls back to the rider's position.
   */
  setProgress(alongMetres: number | undefined): void {
    this.sessionAlong = alongMetres;
  }

  /** Put the camera back at the start, with no gliding. For a new trip. */
  resetCamera(fix: RiderFix): void {
    this.camera.snapTo(fix, this.options.now());
    this.guide?.reset();
    this.sessionAlong = undefined;
  }

  setLighting(lighting: SceneLighting): void {
    this.lighting = lighting;
    this.provider?.setLighting(lighting);
  }

  /**
   * Changes the screen effect level on the running provider if it can do that without starting
   * again (Google tiles can, and that saves a Cesium ion request). Returns false when the caller
   * has to start the scene again.
   */
  setFxLevel(level: FxLevel, pinned: boolean): boolean {
    return this.provider?.setFxLevel?.(level, pinned) ?? false;
  }

  setActivity(activity: ProviderActivity): void {
    this.activity = activity;
    this.provider?.setActivity(activity);
  }

  dispose(): void {
    this.disposed = true;
    this.detach();
  }

  /** Starts one provider. Returns true if it came up, false if it failed. */
  private async run(id: ProviderId): Promise<boolean> {
    const { createProvider, tuningFor, sceneElement, creditsElement } = this.options;
    let provider: MapProvider;
    try {
      provider = await createProvider(id, tuningFor(id));
    } catch {
      this.publish({
        providerId: undefined,
        status: "failed",
        note: NOTES.unavailable,
        warning: true,
      });
      return false;
    }
    if (this.disposed) {
      provider.unmount();
      return false;
    }
    this.attach(provider);
    this.mounting = provider;
    this.publish({ providerId: id, status: "loading" });
    try {
      await provider.mount({ scene: sceneElement, credits: creditsElement });
    } catch (error) {
      this.mounting = undefined;
      if (this.disposed || this.provider !== provider) return false;
      this.detach();
      const message =
        error instanceof Error && error.message !== "" ? error.message : NOTES.unavailable;
      this.publish({ providerId: undefined, status: "failed", note: message, warning: true });
      return false;
    }
    this.mounting = undefined;
    return !this.disposed && this.provider === provider;
  }

  private attach(provider: MapProvider): void {
    this.detach();
    this.provider = provider;
    this.removeFrame = provider.onFrame((nowMs) => {
      const pose = this.camera.step(nowMs);
      if (!pose) return;
      provider.setCamera(pose);
      // The rider and the guidance follow the same smoothed pose as the camera, so the rider
      // stays put in the lower middle of the screen and the chevrons ahead stay on the road.
      provider.setGuidance(
        this.guide
          ? this.guide.frame(pose.rider, pose.headingDegrees, nowMs, this.sessionAlong)
          : freeRideFrame(pose.rider, pose.headingDegrees, nowMs),
      );
    });
    this.removeStatus = provider.onStatus((status) => {
      // A failure while the provider is still starting is reported by mount() itself.
      if (this.provider !== provider || this.mounting === provider) return;
      if (status.state === "failed") {
        this.onProviderFailed(provider, status.message);
      } else if (status.state === "ready") {
        this.publish({ status: "ready" });
      }
    });
    if (this.guide) provider.setRoute(this.guide.corridor);
    if (this.lighting) provider.setLighting(this.lighting);
    provider.setActivity(this.activity);
  }

  private detach(): void {
    this.removeFrame?.();
    this.removeStatus?.();
    this.removeFrame = undefined;
    this.removeStatus = undefined;
    this.provider?.unmount();
    this.provider = undefined;
  }

  /** A running provider reported a failure. Cesium is replaced once. The fallback just says so. */
  private onProviderFailed(provider: MapProvider, message: string): void {
    if (provider.id === "cesium-google") {
      this.detach();
      this.publish({ providerId: undefined, status: "loading", note: message, warning: true });
      void this.run("maplibre-fallback");
    } else {
      this.publish({ status: "failed", note: message, warning: true });
    }
  }

  private publish(change: Partial<Omit<SceneState, "selection">>): void {
    this.state = { ...this.state, ...change };
    if (!this.disposed) this.options.onState(this.state);
  }
}

/** The start pose of a route: its first point, facing along its first leg. */
export function startFixOf(path: readonly LatLng[]): RiderFix {
  const first = path[0];
  if (!first) return { position: { lat: 0, lng: 0 }, headingDegrees: 0 };
  const lookAt = path.find((point, index) => index > 0 && point !== first);
  return {
    position: first,
    headingDegrees: lookAt ? bearingDegrees(first, lookAt) : 0,
  };
}
