import "@cesium/engine/Source/Widget/CesiumWidget.css";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  BoxGeometry,
  Cartesian3,
  Clock,
  Color,
  ColorGeometryInstanceAttribute,
  CornerType,
  CorridorGeometry,
  GeometryInstance,
  HeadingPitchRange,
  JulianDate,
  Matrix3,
  Matrix4,
  PerspectiveFrustum,
} from "@cesium/core";
import {
  CesiumWidget,
  PerInstanceColorAppearance,
  Primitive,
  SkyAtmosphere,
  Transforms,
} from "@cesium/engine";
import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import {
  DEMO_ROUTE_GROUND_ELLIPSOID_METRES,
  FollowCamera,
  HOLO_RIBBON,
  HOLO_RIBBON_ALPHA,
  RouteGuide,
  constantGroundHeight,
  lightingParameters,
  resolveFxLevel,
  type SceneLighting,
} from "@waylit/map-provider";
import { fromLocalMetres, type LatLng, type Route } from "@waylit/core";
import { setCesiumBaseUrl } from "@/map/cesium-setup";
import { previewRoute } from "./preview-route";
import { CesiumFx } from "@/map/fx-stage";
import { CesiumHolo } from "@/map/cesium-holo";
import { MapLibreHolo } from "@/map/maplibre-holo";
import { layersFor } from "@/map/fallback-style";
import { mapPitchFromDepression, zoomForRange } from "@/map/camera-math";
import { sceneLightingFrom } from "@/map/lighting-input";
import {
  DEFAULT_SUN_POSITION,
  computeDaylight,
  presetInstant,
  type TimePreset,
} from "@/hud/daylight";

declare global {
  interface Window {
    __holoPreview?: { status: "ready" | "error"; error?: string; engine: string; frames: number };
  }
}

const GROUND = DEMO_ROUTE_GROUND_ELLIPSOID_METRES;
const ORIGIN = DEFAULT_SUN_POSITION;

interface Building {
  readonly east: number;
  readonly north: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

function previewBuildings(): Building[] {
  const out: Building[] = [];
  let seed = 7;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let row = 0; row < 9; row++) {
    for (const side of [-1, 1]) {
      const width = 16 + rand() * 10;
      out.push({
        east: side * (14 + width / 2),
        north: 14 + row * 28,
        width,
        depth: 20 + rand() * 6,
        height: 10 + rand() * 38,
      });
    }
  }
  // Blocks along the cross street, on its far side.
  for (let col = 0; col < 6; col++) {
    out.push({
      east: -30 - col * 34,
      north: 150,
      width: 26,
      depth: 22,
      height: 12 + rand() * 30,
    });
  }
  return out;
}

export function startHoloPreview(element: HTMLElement, search: string): () => void {
  const params = new URLSearchParams(search);
  const engine = params.get("engine") === "maplibre" ? "maplibre" : "cesium";
  const preset = (params.get("time") ?? "night") as TimePreset;
  const instant = presetInstant(preset, ORIGIN, Date.UTC(2026, 10, 25, 12, 0));
  const lighting = sceneLightingFrom(computeDaylight(ORIGIN, instant, true));
  const level = resolveFxLevel(search, "maplibre-fallback");
  const route = previewRoute();
  const guide = new RouteGuide(route);
  const along = Number(params.get("along") ?? "NaN");
  const state: NonNullable<Window["__holoPreview"]> = { status: "ready", engine, frames: 0 };
  window.__holoPreview = state;
  const riderAt = (now: number): { position: LatLng; heading: number } => {
    const d = Number.isFinite(along) ? along : 20 + (((now / 1000) * 5) % 230);
    const p = guide.pointAt(d);
    return { position: p.position, heading: p.headingDegrees };
  };
  return engine === "cesium"
    ? startCesium(element, lighting, level, route, guide, riderAt, state, instant)
    : startMapLibre(element, lighting, level, route, guide, riderAt, state);
}

type RiderAt = (now: number) => { position: LatLng; heading: number };

function startCesium(
  element: HTMLElement,
  lighting: SceneLighting,
  level: ReturnType<typeof resolveFxLevel>,
  route: Route,
  guide: RouteGuide,
  riderAt: RiderAt,
  state: NonNullable<Window["__holoPreview"]>,
  instant: number,
): () => void {
  const lp = lightingParameters(lighting);
  setCesiumBaseUrl();
  const widget = new CesiumWidget(element, {
    globe: false,
    baseLayer: false,
    skyBox: false,
    skyAtmosphere: new SkyAtmosphere(),
    scene3DOnly: true,
    msaaSamples: 1,
    orderIndependentTranslucency: false,
    clock: new Clock({ shouldAnimate: false, currentTime: JulianDate.fromDate(new Date(instant)) }),
    contextOptions: { webgl: { antialias: false, preserveDrawingBuffer: true } },
    showRenderLoopErrors: false,
  });
  const scene = widget.scene;
  scene.backgroundColor = Color.fromCssColorString(lp.sky.zenith);
  scene.fog.enabled = false;
  scene.highDynamicRange = false;
  scene.screenSpaceCameraController.enableInputs = false;
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

  const tint = lp.tint;
  const photo = (hex: string): Color => {
    const c = Color.fromCssColorString(hex);
    return new Color(c.red * tint[0], c.green * tint[1], c.blue * tint[2], 1);
  };
  const origin = Cartesian3.fromDegrees(ORIGIN.lng, ORIGIN.lat, GROUND);
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
  box(0, 0, 900, 900, 0.3, "#c9c7b8");
  instances.push(
    ...[0, Math.PI / 2].map(
      (rotate, i) =>
        new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(i === 0 ? 9 : 8, 500, 0.2),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: Matrix4.multiply(
            at(i === 0 ? 0 : -150, i === 0 ? 120 : 126, 0.4),
            Matrix4.fromRotationTranslation(Matrix3.fromRotationZ(rotate)),
            new Matrix4(),
          ),
          attributes: { color: ColorGeometryInstanceAttribute.fromColor(photo("#6f7378")) },
        }),
    ),
  );
  const tones = ["#d9d4c6", "#c8c2b4", "#e4ddd0", "#b9b5aa", "#d6cfc0", "#cfc9bb"];
  for (const [i, b] of previewBuildings().entries()) {
    box(b.east, b.north, b.width, b.depth, b.height, tones[i % tones.length] ?? "#d9d4c6");
  }
  scene.primitives.add(
    new Primitive({
      geometryInstances: instances,
      appearance: new PerInstanceColorAppearance({ flat: false, translucent: false }),
      asynchronous: false,
    }),
  );
  // Stand in for the classified corridor: a flat translucent strip just above the road.
  const flat: number[] = [];
  for (const p of route.path) flat.push(p.lng, p.lat);
  scene.primitives.add(
    new Primitive({
      geometryInstances: new GeometryInstance({
        geometry: new CorridorGeometry({
          positions: Cartesian3.fromDegreesArray(flat),
          width: guide.corridor.widthMetres,
          height: GROUND + 0.6,
          cornerType: CornerType.ROUNDED,
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(
            Color.fromCssColorString(HOLO_RIBBON).withAlpha(HOLO_RIBBON_ALPHA + 0.1),
          ),
        },
      }),
      appearance: new PerInstanceColorAppearance({ translucent: true, closed: true }),
      asynchronous: false,
    }),
  );

  const holo = new CesiumHolo(scene, element, constantGroundHeight(GROUND), GROUND);
  const fx = new CesiumFx(scene, level);
  fx.setLighting(lighting);
  const camera = new FollowCamera();
  const start = riderAt(0);
  camera.snapTo({ position: start.position, headingDegrees: start.heading }, 0);
  if (scene.camera.frustum instanceof PerspectiveFrustum) scene.camera.frustum.fov = 1.2;
  let frames = 0;
  const onPreRender = (): void => {
    const now = performance.now();
    const rider = riderAt(now);
    camera.setFix({ position: rider.position, headingDegrees: rider.heading }, now);
    const pose = camera.step(now);
    if (!pose) return;
    scene.camera.lookAt(
      Cartesian3.fromDegrees(pose.target.lng, pose.target.lat, GROUND),
      new HeadingPitchRange(
        (pose.headingDegrees * Math.PI) / 180,
        -(pose.pitchDegrees * Math.PI) / 180,
        pose.rangeMetres,
      ),
    );
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    fx.tick(now);
    holo.setGuidance(guide.frame(pose.rider, pose.headingDegrees, now), now);
    frames += 1;
    state.frames = frames;
  };
  scene.preRender.addEventListener(onPreRender);
  holo.setRoute(guide.corridor);
  widget.useDefaultRenderLoop = true;
  return () => {
    scene.preRender.removeEventListener(onPreRender);
    holo.destroy();
    fx.destroy();
    widget.destroy();
  };
}

function startMapLibre(
  host: HTMLElement,
  lighting: SceneLighting,
  level: ReturnType<typeof resolveFxLevel>,
  route: Route,
  guide: RouteGuide,
  riderAt: RiderAt,
  state: NonNullable<Window["__holoPreview"]>,
): () => void {
  // MapLibre makes its container position: relative, so it gets its own box that fills the host.
  const element = document.createElement("div");
  element.style.cssText = "position:absolute;inset:0";
  host.append(element);
  const params = lightingParameters(lighting);
  const features = previewBuildings().map((b) => {
    const corners = (
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
        [-1, -1],
      ] as const
    ).map(([sx, sy]) => {
      const p = fromLocalMetres(ORIGIN, {
        east: b.east + (sx * b.width) / 2,
        north: b.north + (sy * b.depth) / 2,
      });
      return [p.lng, p.lat];
    });
    return {
      type: "Feature" as const,
      properties: { render_height: b.height, render_min_height: 0 },
      geometry: { type: "Polygon" as const, coordinates: [corners] },
    };
  });
  const roads = [
    [at(0, -100), at(0, 300)],
    [at(-300, 126), at(60, 126)],
  ].map((line) => ({
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: line.map((p) => [p.lng, p.lat]) },
  }));
  function at(east: number, north: number): LatLng {
    return fromLocalMetres(ORIGIN, { east, north });
  }
  const layers: unknown[] = [
    { id: "background", type: "background", paint: { "background-color": params.palette.land } },
    {
      id: "roads",
      type: "line",
      source: "roads",
      paint: { "line-color": params.palette.roadMajor, "line-width": 12 },
    },
  ];
  for (const def of layersFor(level)) {
    if (def.sourceLayer !== "building") continue;
    layers.push({
      id: def.id,
      type: def.type,
      source: "buildings",
      ...(def.filter === undefined ? {} : { filter: def.filter }),
      ...(def.layout === undefined ? {} : { layout: def.layout }),
      paint: { ...def.colours(params.palette), ...def.fixed },
    });
  }
  setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
  const map = new MapLibreMap({
    container: element,
    style: {
      version: 8,
      sources: {
        buildings: { type: "geojson", data: { type: "FeatureCollection", features } },
        roads: { type: "geojson", data: { type: "FeatureCollection", features: roads } },
      },
      layers,
      sky: {
        "sky-color": params.sky.zenith,
        "horizon-color": params.sky.horizon,
        "fog-color": params.sky.fog,
        "sky-horizon-blend": 0.55,
        "horizon-fog-blend": 0.6,
        "fog-ground-blend": 0.6,
        "atmosphere-blend": 0,
      },
    } as never,
    center: [ORIGIN.lng, ORIGIN.lat],
    zoom: 18,
    pitch: 75,
    maxPitch: 85,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    canvasContextAttributes: { antialias: false, preserveDrawingBuffer: true },
  });
  (window as unknown as { __holoMap?: unknown }).__holoMap = map;
  const holo = new MapLibreHolo(map, element, level, false);
  const camera = new FollowCamera();
  const start = riderAt(0);
  camera.snapTo({ position: start.position, headingDegrees: start.heading }, 0);
  let raf = 0;
  let frames = 0;
  map.on("error", (event) => {
    state.error = String(event.error);
  });
  map.on("load", () => {
    holo.install();
    holo.setRoute(guide.corridor);
    holo.setLighting(lighting);
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const rider = riderAt(now);
      camera.setFix({ position: rider.position, headingDegrees: rider.heading }, now);
      const pose = camera.step(now);
      if (!pose) return;
      map.setVerticalFieldOfView(pose.verticalFovDegrees);
      map.jumpTo({
        center: [pose.target.lng, pose.target.lat],
        bearing: pose.headingDegrees,
        pitch: mapPitchFromDepression(pose.pitchDegrees),
        zoom: zoomForRange(
          pose.rangeMetres,
          pose.target.lat,
          map.getCanvas().clientHeight || 412,
          pose.verticalFovDegrees,
        ),
      });
      holo.setGuidance(guide.frame(pose.rider, pose.headingDegrees, now));
      frames += 1;
      state.frames = frames;
    };
    raf = requestAnimationFrame(loop);
  });
  return () => {
    cancelAnimationFrame(raf);
    holo.destroy();
    map.remove();
    element.remove();
  };
}
