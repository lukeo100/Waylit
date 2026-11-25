import "@cesium/engine/Source/Widget/CesiumWidget.css";
import {
  Cartesian3,
  Clock,
  Color,
  GeometryInstance,
  HeadingPitchRoll,
  JulianDate,
  Math as CesiumMath,
  Matrix3,
  Matrix4,
  PerspectiveFrustum,
} from "@cesium/core";
import {
  BoxGeometry,
  CesiumWidget,
  PerInstanceColorAppearance,
  Primitive,
  SkyAtmosphere,
  Transforms,
  ColorGeometryInstanceAttribute,
} from "@cesium/engine";
import {
  DEMO_ROUTE_GROUND_ELLIPSOID_METRES,
  lightingParameters,
  resolveFxLevel,
} from "@waylit/map-provider";
import { setCesiumBaseUrl } from "@/map/cesium-setup";
import { CesiumFx } from "@/map/fx-stage";
import { sceneLightingFrom } from "@/map/lighting-input";
import {
  DEFAULT_SUN_POSITION,
  computeDaylight,
  presetInstant,
  type TimePreset,
} from "@/hud/daylight";

declare global {
  interface Window {
    __fxPreview?: { status: "ready" | "error"; error?: string; level: string; frames: number };
  }
}

const GROUND = DEMO_ROUTE_GROUND_ELLIPSOID_METRES;

/** A small procedural street scene around the demo route start. Original, no tiles. */
export function startPreview(element: HTMLElement, search: string): () => void {
  const params = new URLSearchParams(search);
  const preset = (params.get("time") ?? "noon") as TimePreset;
  const dayMs = Date.UTC(2026, 10, 25, 12, 0);
  const instant = presetInstant(preset, DEFAULT_SUN_POSITION, dayMs);
  const lighting = sceneLightingFrom(computeDaylight(DEFAULT_SUN_POSITION, instant, true));
  const lp = lightingParameters(lighting);
  const level = resolveFxLevel(search, "maplibre-fallback");
  const state: NonNullable<Window["__fxPreview"]> = { status: "ready", level, frames: 0 };
  window.__fxPreview = state;

  setCesiumBaseUrl();
  const widget = new CesiumWidget(element, {
    globe: false,
    baseLayer: false,
    skyBox: false,
    skyAtmosphere: new SkyAtmosphere(),
    scene3DOnly: true,
    msaaSamples: 1,
    clock: new Clock({ shouldAnimate: false, currentTime: JulianDate.fromDate(new Date(instant)) }),
    contextOptions: { webgl: { antialias: false, preserveDrawingBuffer: true } },
    showRenderLoopErrors: false,
  });
  const scene = widget.scene;
  scene.backgroundColor = Color.fromCssColorString(lp.sky.zenith);
  scene.fog.enabled = false;
  scene.highDynamicRange = false;
  const atmosphere = scene.skyAtmosphere;
  if (atmosphere) {
    const dark = (1 - lighting.daylightFactor) ** 2;
    atmosphere.brightnessShift = -0.85 * dark;
    atmosphere.saturationShift = -0.3 * dark;
  }
  scene.renderError.addEventListener((_s, error) => {
    state.status = "error";
    state.error = String(error);
  });
  scene.postRender.addEventListener(() => {
    state.frames += 1;
  });

  // Colours stand in for photographic tiles: pale, sunlit, with the same tint the tile shader uses.
  const tint = lp.tint;
  const photo = (hex: string): Color => {
    const c = Color.fromCssColorString(hex);
    return new Color(c.red * tint[0], c.green * tint[1], c.blue * tint[2], 1);
  };

  const origin = Cartesian3.fromDegrees(DEFAULT_SUN_POSITION.lng, DEFAULT_SUN_POSITION.lat, GROUND);
  const enu = Transforms.eastNorthUpToFixedFrame(origin);
  const at = (east: number, north: number, up: number): Matrix4 =>
    Matrix4.multiplyByTranslation(enu, new Cartesian3(east, north, up), new Matrix4());

  const instances: GeometryInstance[] = [];
  const box = (e: number, n: number, w: number, d: number, h: number, hex: string): void => {
    instances.push(
      new GeometryInstance({
        geometry: BoxGeometry.fromDimensions({
          dimensions: new Cartesian3(w, d, h),
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        modelMatrix: at(e, n, h / 2),
        attributes: { color: ColorGeometryInstanceAttribute.fromColor(photo(hex)) },
      }),
    );
  };
  /** A thin dark strip, 400 m long, for a road, turned about the up axis by `rotate`. */
  const road = (hex: string, w: number, e: number, n: number, rotate = 0): void => {
    instances.push(
      new GeometryInstance({
        geometry: BoxGeometry.fromDimensions({
          dimensions: new Cartesian3(w, 400, 0.2),
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        modelMatrix: Matrix4.multiply(
          at(e, n, 0.4),
          Matrix4.fromRotationTranslation(Matrix3.fromRotationZ(rotate)),
          new Matrix4(),
        ),
        attributes: { color: ColorGeometryInstanceAttribute.fromColor(photo(hex)) },
      }),
    );
  };
  // Ground, a long road ahead (north) and a cross street, then blocks of buildings.
  box(0, 0, 600, 600, 0.3, "#c9c7b8");
  road("#6f7378", 9, 0, 120);
  road("#6f7378", 8, 0, 120, Math.PI / 2);
  const tones = ["#d9d4c6", "#c8c2b4", "#e4ddd0", "#b9b5aa", "#d6cfc0", "#cfc9bb"];
  let seed = 7;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let row = 0; row < 9; row++) {
    for (const side of [-1, 1]) {
      const north = 14 + row * 28;
      const width = 16 + rand() * 10;
      const height = 10 + rand() * 38;
      box(
        side * (14 + width / 2),
        north,
        width,
        20 + rand() * 6,
        height,
        tones[Math.floor(rand() * tones.length)] ?? "#d9d4c6",
      );
    }
  }
  scene.primitives.add(
    new Primitive({
      geometryInstances: instances,
      appearance: new PerInstanceColorAppearance({ flat: false, translucent: false }),
      asynchronous: false,
    }),
  );

  const camera = scene.camera;
  camera.setView({
    destination: Cartesian3.fromDegrees(
      DEFAULT_SUN_POSITION.lng,
      DEFAULT_SUN_POSITION.lat - 0.00008,
      GROUND + 5,
    ),
    orientation: new HeadingPitchRoll(0, CesiumMath.toRadians(-6), 0),
  });
  if (camera.frustum instanceof PerspectiveFrustum) camera.frustum.fov = CesiumMath.toRadians(65);

  const fx = new CesiumFx(scene, level);
  fx.setLighting(lighting);
  widget.useDefaultRenderLoop = true;
  return () => {
    fx.destroy();
    widget.destroy();
  };
}
