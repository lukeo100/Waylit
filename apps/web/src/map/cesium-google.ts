import "@cesium/engine/Source/Widget/CesiumWidget.css";
import {
  Cartesian3,
  Clock,
  Color,
  HeadingPitchRange,
  JulianDate,
  Matrix4,
  PerspectiveFrustum,
} from "@cesium/core";
import {
  CesiumWidget,
  Ion,
  PointPrimitiveCollection,
  RequestScheduler,
  SkyAtmosphere,
  createGooglePhotorealistic3DTileset,
  type Cesium3DTileset,
  type CustomShader,
  type PointPrimitive,
} from "@cesium/engine";
import {
  DEMO_ROUTE_GROUND_ELLIPSOID_METRES,
  constantGroundHeight,
  FxGovernor,
  effectivePixelRatio,
  lightingParameters,
  longSideFovDegrees,
  type CameraPose,
  type GroundHeightSource,
  type ProviderAttribution,
  type ProviderCapabilities,
  type ProviderActivity,
  type ProviderDiagnostics,
  type ProviderMountTarget,
  type RenderTuning,
  type SceneLighting,
} from "@waylit/map-provider";
import { BaseProvider } from "./base-provider";
import { setCesiumBaseUrl } from "./cesium-setup";
import { watchCreditsFit } from "./credits-fit-dom";
import { CesiumFx } from "./fx-stage";
import { createTileShader, setTileShaderLighting } from "./tile-shader";
import { classifyFailure } from "./errors";

/**
 * CesiumJS showing Google Photorealistic 3D Tiles through Cesium ion.
 *
 * Rules this file keeps (Amendment 3 and the Google and Cesium terms, see docs/ARCHITECTURE.md):
 *
 *  - The tiles come from Cesium ion asset 2275207 with the deployer's own ion token. There is no
 *    Google key and no direct Google request path.
 *  - Nothing reads or records heights from the Google tiles. There is no `sampleHeight`, no
 *    `clampToHeight`, no `Cesium3DTileset.getHeight`, no `scene.pick` or `pickPosition`, no
 *    depth picking and no terrain. The camera height comes from a ground height source that is
 *    unrelated to the tiles.
 *  - No Cesium globe, base imagery or terrain, and no OpenStreetMap content, are ever shown next
 *    to the Google tiles.
 *  - Credits, the Google logo and the Cesium ion logo are drawn by Cesium's credit display into
 *    the credits strip, and are never hidden.
 *  - One root tileset request per page life. A failure is reported once. There is no retry loop.
 */

const ION_GOOGLE_ASSET_ID = 2275207;
const GOOGLE_TILE_HOST = "tile.googleapis.com:443";

/** A count of root tileset requests this page has made, shown in the dev overlay. */
let rootRequests = 0;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export interface CesiumGoogleOptions {
  /** The deployer's Cesium ion token. Never logged and never sent anywhere but Cesium ion. */
  readonly token: string;
  readonly tuning: RenderTuning;
  /** Where camera height comes from. Never the Google tiles. */
  readonly ground?: GroundHeightSource;
}

export class CesiumGoogleProvider extends BaseProvider {
  readonly id = "cesium-google" as const;
  readonly displayName = "Google Photorealistic 3D Tiles (Cesium)";
  readonly capabilities: ProviderCapabilities = {
    threeDimensional: true,
    photorealistic: true,
    requiresKey: true,
    mayReadSurfaceHeights: false,
  };
  /** Cesium draws the live credits itself. These describe what must be visible. */
  readonly attributions: readonly ProviderAttribution[] = [
    { text: "Google" },
    { text: "Cesium ion" },
  ];

  private readonly token: string;
  private readonly ground: GroundHeightSource;
  private widget: CesiumWidget | undefined;
  private tileset: Cesium3DTileset | undefined;
  private shader: CustomShader | undefined;
  private fx: CesiumFx | undefined;
  private governor: FxGovernor | undefined;
  private lastFxCheckMs = 0;
  private lastLighting: SceneLighting | undefined;
  private marker: PointPrimitive | undefined;
  private lastLightKey: string | undefined;
  private pendingLighting: SceneLighting | undefined;
  private failedTiles = 0;
  private loadedTiles = 0;
  private lastFov = 0;
  private removeListeners: (() => void)[] = [];

  constructor(options: CesiumGoogleOptions) {
    super(options.tuning);
    this.token = options.token;
    this.ground = options.ground ?? constantGroundHeight(DEMO_ROUTE_GROUND_ELLIPSOID_METRES);
  }

  async mount(target: ProviderMountTarget): Promise<void> {
    const sceneElement = target.scene as HTMLElement;
    const creditsElement = target.credits as HTMLElement;
    this.emitStatus({ state: "loading" });
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw Object.assign(new Error("offline"), { name: "TypeError" });
      }
      setCesiumBaseUrl();
      Ion.defaultAccessToken = this.token;
      // Google suggests more simultaneous requests to its tile host than the browser default.
      RequestScheduler.requestsByServer[GOOGLE_TILE_HOST] = this.tuning.maximumRequestsPerServer;

      const pixelRatio = effectivePixelRatio(window.devicePixelRatio, this.tuning.pixelRatioCap);
      const widget = new CesiumWidget(sceneElement, {
        // No globe, no base imagery, no terrain: only the Google tiles are drawn.
        globe: false,
        baseLayer: false,
        // Draw nothing until the first activity is known (see syncRendering).
        useDefaultRenderLoop: false,
        // No skybox, sun or moon textures. The sky is the atmosphere.
        skyBox: false,
        skyAtmosphere: new SkyAtmosphere(),
        scene3DOnly: true,
        shadows: false,
        orderIndependentTranslucency: false,
        msaaSamples: 1,
        // Render below the screen's own pixel ratio on dense phone screens.
        useBrowserRecommendedResolution: false,
        clock: new Clock({ shouldAnimate: false }),
        // Credits go into the reserved strip. The pop up for the full list opens over the scene.
        creditContainer: creditsElement,
        creditViewport: sceneElement,
        showRenderLoopErrors: false,
        blurActiveElementOnCanvasFocus: false,
        contextOptions: { webgl: { antialias: false, powerPreference: "high-performance" } },
      });
      this.widget = widget;
      widget.resolutionScale = pixelRatio / Math.max(window.devicePixelRatio || 1, 1);

      const scene = widget.scene;
      // The rider drives the camera. No mouse or touch control, and no depth picking, so nothing
      // can read surface heights back from the tiles.
      scene.screenSpaceCameraController.enableInputs = false;
      scene.useDepthPicking = false;
      scene.fog.enabled = false;
      scene.highDynamicRange = false;
      scene.backgroundColor = Color.fromCssColorString("#05070b");

      const preRender = (): void => {
        this.emitFrame(performance.now());
      };
      const postRender = (): void => {
        const now = performance.now();
        this.stats.record(now);
        this.adaptEffect(now);
      };
      const renderError = (): void => {
        this.stopRendering();
        this.fail(new Error("render"), "render");
      };
      scene.preRender.addEventListener(preRender);
      scene.postRender.addEventListener(postRender);
      scene.renderError.addEventListener(renderError);
      this.removeListeners.push(
        () => scene.preRender.removeEventListener(preRender),
        () => scene.postRender.removeEventListener(postRender),
        () => scene.renderError.removeEventListener(renderError),
      );

      // The futuristic post process: one full screen pass, colour only. It starts at the level
      // from the address or the default and steps down on its own if the frame rate is low.
      this.fx = new CesiumFx(scene, this.tuning.fxLevel);
      this.governor = new FxGovernor(this.tuning.fxLevel);
      if (this.lastLighting) this.fx.setLighting(this.lastLighting);
      this.removeListeners.push(() => this.fx?.destroy());

      this.watchVisibility();

      // One root tileset request. It counts against the monthly allowance, so it is made once
      // and a failure ends in a message, never in a retry.
      rootRequests += 1;
      const tileset = await createGooglePhotorealistic3DTileset(
        { onlyUsingWithGoogleGeocoder: true },
        {
          // Google requires its credits on screen.
          showCreditsOnScreen: true,
          maximumScreenSpaceError: this.tuning.maximumScreenSpaceError,
          cacheBytes: this.tuning.cacheBytes,
          maximumCacheOverflowBytes: this.tuning.maximumCacheOverflowBytes,
          // The Cesium helper turns collision on, which costs time and is not needed.
          enableCollision: false,
          enablePick: false,
          dynamicScreenSpaceError: true,
        },
      );
      if (this.disposed || this.widget !== widget) {
        tileset.destroy();
        return;
      }
      this.tileset = tileset;

      // The tiles carry baked daylight. With the visual effect on, a tint multiplies it so the
      // scene can go dark at night. With the effect off (the default in Google mode) there is no
      // custom shader at all and the tiles are drawn as Google supplies them.
      this.shader = createTileShader(this.tuning.fxLevel);
      if (this.shader) tileset.customShader = this.shader;

      // Tile requests that fail before any tile has loaded mean the token or the network is bad.
      // Report it once, so the app can fall back, and never retry.
      const tileLoad = (): void => {
        this.loadedTiles += 1;
      };
      const tileFailed = (): void => {
        this.failedTiles += 1;
        if (this.failedTiles >= 6 && this.loadedTiles === 0) {
          this.fail(new Error("tiles"), "network");
        }
      };
      tileset.tileLoad.addEventListener(tileLoad);
      tileset.tileFailed.addEventListener(tileFailed);
      this.removeListeners.push(
        () => tileset.tileLoad.removeEventListener(tileLoad),
        () => tileset.tileFailed.removeEventListener(tileFailed),
      );
      const initial = (): void => {
        this.emitStatus({ state: "ready" });
      };
      tileset.initialTilesLoaded.addEventListener(initial);
      this.removeListeners.push(() => tileset.initialTilesLoaded.removeEventListener(initial));

      scene.primitives.add(tileset);
      // One line of credits. When the text does not fit it moves behind Cesium's "Data
      // attribution" link, which Google allows. The Google and Cesium ion logos stay on screen.
      this.removeListeners.push(
        watchCreditsFit(creditsElement, (mode) => {
          if (!tileset.isDestroyed()) tileset.showCreditsOnScreen = mode === "inline";
        }),
      );
      if (this.tuning.debugMarker) {
        const points = scene.primitives.add(new PointPrimitiveCollection());
        this.marker = points.add({
          position: Cartesian3.ZERO,
          pixelSize: 10,
          color: Color.fromCssColorString("#5fc8e8"),
          // Draw over the tiles. This is a drawing choice and reads no depth back.
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
      }
      if (this.pendingLighting) this.setLighting(this.pendingLighting);
      this.syncRendering();
      this.emitStatus({ state: "ready" });
    } catch (error) {
      const failure = this.fail(error);
      this.release();
      throw Object.assign(new Error(failure.message), { kind: failure.kind });
    }
  }

  setCamera(pose: CameraPose): void {
    const widget = this.widget;
    if (!widget || widget.isDestroyed()) return;
    const camera = widget.scene.camera;
    const height = this.ground.heightAt(pose.target) ?? DEMO_ROUTE_GROUND_ELLIPSOID_METRES;

    const canvas = widget.canvas;
    const aspect = canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 2;
    const fov = toRadians(longSideFovDegrees(pose.verticalFovDegrees, aspect));
    if (Math.abs(fov - this.lastFov) > 1e-4 && camera.frustum instanceof PerspectiveFrustum) {
      camera.frustum.fov = fov;
      this.lastFov = fov;
    }

    const center = Cartesian3.fromDegrees(pose.target.lng, pose.target.lat, height);
    camera.lookAt(
      center,
      new HeadingPitchRange(
        toRadians(pose.headingDegrees),
        -toRadians(pose.pitchDegrees),
        pose.rangeMetres,
      ),
    );
    camera.lookAtTransform(Matrix4.IDENTITY);

    if (this.marker) {
      this.marker.position = Cartesian3.fromDegrees(pose.rider.lng, pose.rider.lat, height + 0.5);
    }
  }

  setLighting(lighting: SceneLighting): void {
    const widget = this.widget;
    this.lastLighting = lighting;
    this.fx?.setLighting(lighting);
    if (!widget || !this.tileset || widget.isDestroyed()) {
      this.pendingLighting = lighting;
      return;
    }
    const params = lightingParameters(lighting);
    if (params.key === this.lastLightKey) return;
    this.lastLightKey = params.key;
    this.pendingLighting = undefined;
    // The sky atmosphere and any lit model take the sun from the clock, so set the clock to the
    // moment the app is showing (the real time, or the developer time override).
    widget.clock.currentTime = JulianDate.fromDate(new Date(lighting.timestamp));
    widget.scene.backgroundColor = Color.fromCssColorString(params.sky.zenith);
    // With no globe the atmosphere does not darken itself at night, so dim it by daylight.
    const atmosphere = widget.scene.skyAtmosphere;
    if (atmosphere) {
      const dark = (1 - Math.min(1, Math.max(0, lighting.daylightFactor))) ** 2;
      atmosphere.brightnessShift = -0.85 * dark;
      atmosphere.saturationShift = -0.3 * dark;
    }
    // The tile tint and the warm lift exist only when the visual effect is on.
    if (this.shader) setTileShaderLighting(this.shader, params.tint, lighting.daylightFactor);
  }

  getDiagnostics(): ProviderDiagnostics {
    const tileset = this.tileset;
    const base = { rootRequests, fxLevel: this.fx?.currentLevel ?? "off" };
    if (!tileset || tileset.isDestroyed()) return base;
    // Tileset statistics are marked private in the typings. They are read only, for the dev
    // overlay, and hold counts and byte sizes, not positions or heights.
    const s = (tileset as unknown as { statistics: TilesetStatistics }).statistics;
    return {
      ...base,
      tilesLoaded: s.numberOfTilesWithContentReady,
      tilesPending: s.numberOfPendingRequests + s.numberOfTilesProcessing,
      tilesTotal: s.numberOfTilesTotal,
      requests: s.numberOfAttemptedRequests,
      memoryMegabytes: tileset.totalMemoryUsageInBytes / (1024 * 1024),
      detail: `sse ${String(this.tuning.maximumScreenSpaceError)}, asset ${String(ION_GOOGLE_ASSET_ID)}`,
      fxLevel: this.fx?.currentLevel ?? "off",
    };
  }

  override setActivity(activity: ProviderActivity): void {
    // A new ride is judged afresh, and the start screen's slow frame rate never counts.
    if (activity === "riding" && this.activity !== "riding") this.governor?.reset();
    super.setActivity(activity);
  }

  protected startRendering(): void {
    const widget = this.widget;
    if (widget && !widget.isDestroyed()) widget.useDefaultRenderLoop = true;
    this.fx?.setSuspended(false);
  }

  protected stopRendering(): void {
    const widget = this.widget;
    if (widget && !widget.isDestroyed()) widget.useDefaultRenderLoop = false;
    // A hidden tab or a finished ride runs no effect.
    this.fx?.setSuspended(true);
  }

  protected applyFrameRate(fps: number): void {
    const widget = this.widget;
    if (widget && !widget.isDestroyed()) widget.targetFrameRate = fps;
  }

  protected release(): void {
    for (const remove of this.removeListeners) remove();
    this.removeListeners = [];
    const widget = this.widget;
    this.widget = undefined;
    this.tileset = undefined;
    this.shader = undefined;
    this.marker = undefined;
    if (widget && !widget.isDestroyed()) widget.destroy();
  }

  /**
   * Steps the effect down (high, low, off) when the median frame rate while riding is below
   * 30 fps. Skipped when the address pinned a level. See `FxGovernor`.
   */
  private adaptEffect(nowMs: number): void {
    const governor = this.governor;
    const fx = this.fx;
    if (!governor || !fx || this.tuning.fxPinned || this.activity !== "riding") return;
    if (governor.level === "off") return;
    governor.recordFrame(nowMs);
    if (nowMs - this.lastFxCheckMs < 1000) return;
    this.lastFxCheckMs = nowMs;
    const next = governor.evaluate(nowMs);
    if (next !== undefined) fx.setLevel(next);
  }

  private fail(error: unknown, kind?: "network" | "render") {
    const failure = classifyFailure(error);
    const chosen = kind ?? failure.kind;
    // A short line for the developer. No raw error text, because it can hold a request address.
    console.warn(
      `[waylit] photorealistic map failed: ${chosen}${failure.status === undefined ? "" : ` (HTTP ${String(failure.status)})`}`,
    );
    this.emitStatus({ state: "failed", kind: chosen, message: failure.message });
    return { ...failure, kind: chosen };
  }
}

interface TilesetStatistics {
  readonly numberOfTilesWithContentReady: number;
  readonly numberOfPendingRequests: number;
  readonly numberOfTilesProcessing: number;
  readonly numberOfTilesTotal: number;
  readonly numberOfAttemptedRequests: number;
}
