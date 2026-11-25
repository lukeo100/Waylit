import "maplibre-gl/dist/maplibre-gl.css";
import {
  Map as MapLibreMap,
  setWorkerUrl,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import {
  effectivePixelRatio,
  gradePalette,
  lightingParameters,
  type CameraPose,
  type LightingParameters,
  type ProviderAttribution,
  type ProviderCapabilities,
  type ProviderDiagnostics,
  type ProviderMountTarget,
  type RenderTuning,
  type SceneLighting,
} from "@waylit/map-provider";
import { BaseProvider } from "./base-provider";
import { mapPitchFromDepression, zoomForRange } from "./camera-math";
import { renderCredits } from "./credits-dom";
import { classifyFailure } from "./errors";
import {
  buildFallbackStyle,
  fallbackAttributions,
  lightFor,
  paletteColours,
  skyFor,
} from "./fallback-style";

/**
 * MapLibre GL JS on OpenFreeMap vector tiles, with open terrain. It runs with no keys at all,
 * which is what a fresh clone gets, and it is the fallback when the Cesium path cannot run.
 *
 * The map is drawn with a Waylit style (see fallback-style.ts), pitched to a third-person view
 * and lit from the same sun state as the Cesium path. Interaction is switched off: the follow
 * camera drives it. This provider may read heights from its own open terrain, which is not
 * Google content.
 */

const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
const DEBUG_SOURCE = "debug-marker";
const TILE_ERRORS_BEFORE_NOTE = 5;
const TILE_NOTE = "Some map tiles could not load. Check the connection.";

type PaintProperty = Parameters<MapLibreMap["setPaintProperty"]>[1];

/** Where the map shows before the first pose arrives: the middle of Berlin, high above. */
const FIRST_CENTER: [number, number] = [13.4, 52.47];

export interface MapLibreFallbackOptions {
  readonly tuning: RenderTuning;
  /** Lighting to paint the very first frame with. */
  readonly initialLighting?: SceneLighting | undefined;
}

export class MapLibreFallbackProvider extends BaseProvider {
  readonly id = "maplibre-fallback" as const;
  readonly displayName = "MapLibre with OpenFreeMap";
  readonly capabilities: ProviderCapabilities = {
    threeDimensional: true,
    photorealistic: false,
    requiresKey: false,
    mayReadSurfaceHeights: true,
  };
  readonly attributions: readonly ProviderAttribution[];

  private map: MapLibreMap | undefined;
  private removeCredits: (() => void) | undefined;
  private raf = 0;
  private running = false;
  private pendingPose: CameraPose | undefined;
  private lastFov = 0;
  private lastLightKey: string | undefined;
  private styleReady = false;
  private pendingLight: LightingParameters | undefined;
  private requestCount = 0;
  private initialLighting: SceneLighting | undefined;

  constructor(options: MapLibreFallbackOptions) {
    super(options.tuning);
    this.initialLighting = options.initialLighting;
    this.attributions = fallbackAttributions(options.tuning.terrain);
  }

  async mount(target: ProviderMountTarget): Promise<void> {
    const sceneElement = target.scene as HTMLElement;
    const creditsElement = target.credits as HTMLElement;
    this.emitStatus({ state: "loading" });
    try {
      const startLighting: SceneLighting = this.initialLighting ?? NIGHT_LIGHTING;
      const params = this.gradedParameters(startLighting);
      this.lastLightKey = params.key;
      const style: StyleSpecification = buildFallbackStyle(params, {
        terrain: this.tuning.terrain,
      });
      const pixelRatio = effectivePixelRatio(window.devicePixelRatio, this.tuning.pixelRatioCap);

      // The worker script is copied to public/maplibre (scripts/copy-map-assets.mjs), because
      // the bundler cannot locate it by itself.
      setWorkerUrl(MAPLIBRE_WORKER_URL);
      const map = new MapLibreMap({
        container: sceneElement,
        style,
        center: FIRST_CENTER,
        zoom: 16,
        pitch: 75,
        maxPitch: 85,
        // The follow camera is the only thing that moves it.
        interactive: false,
        attributionControl: false,
        pixelRatio,
        fadeDuration: 0,
        renderWorldCopies: false,
        refreshExpiredTiles: false,
        maxTileCacheZoomLevels: 2,
        canvasContextAttributes: { antialias: false, powerPreference: "high-performance" },
        // Counts requests for the dev overlay. The request itself is not changed.
        transformRequest: (url) => {
          this.requestCount += 1;
          return { url };
        },
      });
      this.map = map;
      this.removeCredits = renderCredits(creditsElement, this.attributions);
      this.watchVisibility();

      map.on("render", () => {
        this.stats.record(performance.now());
      });
      map.on("load", () => {
        this.styleReady = true;
        if (this.tuning.debugMarker) this.addDebugMarker(map);
        if (this.pendingLight) this.paint(this.pendingLight);
        this.emitStatus({ state: "ready" });
      });
      let errors = 0;
      map.on("error", (event) => {
        // Tiles or the style could not be fetched. One miss is normal on a bad connection, so
        // say so once, quietly, after several, and keep the camera moving over what is there.
        const failure = classifyFailure(event.error);
        if (failure.kind !== "network" && failure.status === undefined) return;
        // A source that cannot even load its description means no tiles at all, so it counts
        // as enough on its own. A single missing tile does not.
        const before = errors;
        errors += !("tile" in event) ? TILE_ERRORS_BEFORE_NOTE : 1;
        if (before < TILE_ERRORS_BEFORE_NOTE && errors >= TILE_ERRORS_BEFORE_NOTE) {
          console.warn("[waylit] map tiles are failing to load");
          this.emitStatus({ state: "failed", kind: "network", message: TILE_NOTE });
        }
      });
      this.syncRendering();
    } catch (error) {
      const failure = classifyFailure(error);
      console.warn(`[waylit] fallback map failed: ${failure.kind}`);
      this.emitStatus({ state: "failed", kind: failure.kind, message: failure.message });
      this.release();
      throw error;
    }
  }

  setCamera(pose: CameraPose): void {
    this.pendingPose = pose;
    // While no frame loop runs (paused) the camera still takes the pose, so it is right on resume.
    if (!this.running) this.applyPose();
  }

  /**
   * The lighting parameters with the style colours graded for the futuristic look (deep navy and
   * teal, cyan lifted roads at night), at the level from the address. Colours only, so it costs
   * nothing per frame. See `gradePalette` and docs/ARCHITECTURE.md.
   */
  private gradedParameters(lighting: SceneLighting): LightingParameters {
    const params = lightingParameters(lighting);
    const level = this.tuning.fxLevel;
    if (level === "off") return params;
    return { ...params, palette: gradePalette(params.palette, lighting, level) };
  }

  setLighting(lighting: SceneLighting): void {
    const params = this.gradedParameters(lighting);
    if (params.key === this.lastLightKey) return;
    this.lastLightKey = params.key;
    if (this.map && this.styleReady) this.paint(params);
    else this.pendingLight = params;
  }

  getDiagnostics(): ProviderDiagnostics {
    const map = this.map;
    return {
      requests: this.requestCount,
      fxLevel: this.tuning.fxLevel,
      detail: map
        ? `${map.loaded() ? "loaded" : "loading"}, zoom ${map.getZoom().toFixed(1)}, ${this.tuning.terrain ? "terrain" : "flat"}`
        : "starting",
    };
  }

  protected startRendering(): void {
    if (this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.frame);
  }

  protected stopRendering(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  protected applyFrameRate(): void {
    // The loop reads the limiter, which syncRendering has already set.
  }

  protected release(): void {
    this.stopRendering();
    this.removeCredits?.();
    this.removeCredits = undefined;
    const map = this.map;
    this.map = undefined;
    if (map) map.remove();
  }

  private readonly frame = (nowMs: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    if (!this.limiter.shouldDraw(nowMs)) return;
    this.emitFrame(nowMs);
    this.applyPose();
  };

  private applyPose(): void {
    const map = this.map;
    const pose = this.pendingPose;
    if (!map || !pose) return;
    this.pendingPose = undefined;
    if (Math.abs(pose.verticalFovDegrees - this.lastFov) > 0.01) {
      map.setVerticalFieldOfView(pose.verticalFovDegrees);
      this.lastFov = pose.verticalFovDegrees;
    }
    const height = map.getCanvas().clientHeight || 412;
    map.jumpTo({
      center: [pose.target.lng, pose.target.lat],
      bearing: pose.headingDegrees,
      pitch: mapPitchFromDepression(pose.pitchDegrees),
      zoom: zoomForRange(pose.rangeMetres, pose.target.lat, height, pose.verticalFovDegrees),
    });
    if (this.tuning.debugMarker) this.moveDebugMarker(pose);
  }

  private addDebugMarker(map: MapLibreMap): void {
    map.addSource(DEBUG_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: DEBUG_SOURCE,
      type: "circle",
      source: DEBUG_SOURCE,
      paint: {
        "circle-radius": 9,
        "circle-color": "#5fc8e8",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-pitch-alignment": "viewport",
        "circle-pitch-scale": "viewport",
      },
    });
  }

  private moveDebugMarker(pose: CameraPose): void {
    const source = this.map?.getSource(DEBUG_SOURCE) as GeoJSONSource | undefined;
    source?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [pose.rider.lng, pose.rider.lat] },
    });
  }

  private paint(params: LightingParameters): void {
    const map = this.map;
    if (!map) return;
    this.pendingLight = undefined;
    for (const colour of paletteColours(params.palette)) {
      if (map.getLayer(colour.layer)) {
        map.setPaintProperty(colour.layer, colour.property as PaintProperty, colour.value);
      }
    }
    map.setSky(skyFor(params));
    map.setLight(lightFor(params));
  }
}

/** Used for the first frame when the app has not given any lighting yet: dark and quiet. */
const NIGHT_LIGHTING: SceneLighting = {
  timestamp: 0,
  position: { lat: 52.47, lng: 13.4 },
  sunElevationDegrees: -90,
  sunAzimuthDegrees: 0,
  phase: "night",
  daylightFactor: 0,
  warmth: 0,
};
