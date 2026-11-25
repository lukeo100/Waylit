import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type GeoJSONSource,
  type Map as MapLibreMap,
} from "maplibre-gl";
import type { LatLng } from "@waylit/core";
import {
  HOLO_CYAN,
  HOLO_CYAN_BRIGHT,
  HOLO_RIBBON,
  HOLO_RIBBON_ALPHA,
  fxParameters,
  groundGrid,
  identity,
  meshFor,
  modelMatrix,
  multiply,
  type CorridorShape,
  type FxLevel,
  type GuidanceFrame,
  type HoloKind,
  type HoloMesh,
  type SceneLighting,
} from "@waylit/map-provider";
import { BeaconLabel, createOverlay, type ScreenPoint } from "./beacon-label";
import { groundWidth } from "./fallback-style";
import { HOLO_GLSL, holoFunctionFor } from "./holo-glsl";

/**
 * The hologram layer on MapLibre: the same look as the CesiumJS path with no Google
 * restrictions, because the fallback draws OpenFreeMap data and open terrain.
 *
 *   corridor    a translucent cyan ribbon and bright rails on the road, draped on the terrain
 *   grid        a faint ground grid around the rider, fixed to the world
 *   hologram    one custom WebGL layer that draws the rider on the scooter, the heading
 *               marker, the floating chevrons and the turn beacon from the shared meshes
 *   scan band   one slow band of light that sweeps up the picture (a CSS animation)
 *   label       the distance countdown over the beacon
 *
 * Heights come from the map's own open terrain. The fallback is allowed to read them.
 */

const SOURCES = { ribbon: "holo-ribbon", rails: "holo-rails", grid: "holo-grid" } as const;
const LAYERS = {
  grid: "holo-grid",
  ribbon: "holo-ribbon",
  railGlow: "holo-rails-glow",
  rails: "holo-rails",
  holo: "holo-objects",
} as const;

const EMPTY = { type: "FeatureCollection" as const, features: [] };

/** The direction from an item toward the camera in the item's own axes, for the rim light. */
const VIEW_IN_MODEL: readonly [number, number, number] = [0, -0.93, 0.37];

const VERTEX = `#version 300 es
uniform mat4 u_matrix;
in vec3 a_position;
in vec3 a_normal;
in vec2 a_params;
out vec3 v_normal;
out vec2 v_params;
void main() {
  v_normal = a_normal;
  v_params = a_params;
  gl_Position = u_matrix * vec4(a_position, 1.0);
}`;

function fragmentFor(kind: HoloKind): string {
  return `#version 300 es
precision mediump float;
uniform float u_alpha;
uniform float u_pulse;
uniform float u_time;
uniform vec3 u_view;
in vec3 v_normal;
in vec2 v_params;
out vec4 fragColor;
${HOLO_GLSL}
void main() {
  vec4 shade = ${holoFunctionFor(kind)}(v_params.x, v_params.y, v_normal, u_view, u_time, u_pulse, u_alpha);
  // The map blends with premultiplied alpha.
  fragColor = vec4(shade.rgb * shade.a, shade.a);
}`;
}

interface KindProgram {
  readonly program: WebGLProgram;
  readonly vao: WebGLVertexArrayObject;
  readonly buffers: WebGLBuffer[];
  readonly indexCount: number;
  readonly uMatrix: WebGLUniformLocation | null;
  readonly uAlpha: WebGLUniformLocation | null;
  readonly uPulse: WebGLUniformLocation | null;
  readonly uTime: WebGLUniformLocation | null;
  readonly uView: WebGLUniformLocation | null;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("no shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "";
    gl.deleteShader(shader);
    throw new Error(`shader: ${log.slice(0, 200)}`);
  }
  return shader;
}

function buildKind(gl: WebGL2RenderingContext, kind: HoloKind, mesh: HoloMesh): KindProgram {
  const program = gl.createProgram();
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentFor(kind));
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "a_position");
  gl.bindAttribLocation(program, 1, "a_normal");
  gl.bindAttribLocation(program, 2, "a_params");
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "";
    gl.deleteProgram(program);
    throw new Error(`program: ${log.slice(0, 200)}`);
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffers: WebGLBuffer[] = [];
  const attribute = (location: number, data: Float32Array, size: number): void => {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    buffers.push(buffer);
  };
  attribute(0, mesh.positions, 3);
  attribute(1, mesh.normals, 3);
  attribute(2, mesh.params, 2);
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  buffers.push(indexBuffer);
  gl.bindVertexArray(null);
  return {
    program,
    vao,
    buffers,
    indexCount: mesh.indices.length,
    uMatrix: gl.getUniformLocation(program, "u_matrix"),
    uAlpha: gl.getUniformLocation(program, "u_alpha"),
    uPulse: gl.getUniformLocation(program, "u_pulse"),
    uTime: gl.getUniformLocation(program, "u_time"),
    uView: gl.getUniformLocation(program, "u_view"),
  };
}

/** The custom WebGL layer that draws the hologram items. */
class HologramLayer implements CustomLayerInterface {
  readonly id = LAYERS.holo;
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;

  frame: GuidanceFrame | undefined;
  private map: MapLibreMap | undefined;
  private readonly kinds = new Map<HoloKind, KindProgram>();
  private failed = false;
  private lastGround = 0;
  private readonly model = identity();
  private readonly product = identity();
  private readonly upload = new Float32Array(16);

  constructor(
    private readonly useTerrain: boolean,
    private readonly onLabel: (point: ScreenPoint | undefined) => void,
  ) {}

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    try {
      for (const kind of ["rider", "heading", "chevron", "beacon"] as const) {
        this.kinds.set(kind, buildKind(gl, kind, meshFor(kind)));
      }
    } catch (error) {
      // A short line for the developer, then the layer draws nothing. The map keeps working.
      this.failed = true;
      console.warn(
        `[waylit] hologram layer disabled: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  onRemove(_map: MapLibreMap, gl: WebGL2RenderingContext): void {
    for (const entry of this.kinds.values()) {
      gl.deleteProgram(entry.program);
      gl.deleteVertexArray(entry.vao);
      for (const buffer of entry.buffers) gl.deleteBuffer(buffer);
    }
    this.kinds.clear();
    this.map = undefined;
  }

  render(gl: WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const map = this.map;
    const frame = this.frame;
    if (this.failed || !map || !frame) return;
    // The main projection matrix is a 64 bit matrix from web mercator coordinates (0 to 1) to
    // clip space. Multiplying it by each item's matrix in 64 bit keeps the result small and
    // exact before it goes to the GPU as 32 bit. (Its entries are huge at street zoom, so a
    // 32 bit copy of it would put the items many pixels off.)
    const mvp: ArrayLike<number> = options.defaultProjectionData.mainMatrix;
    const time = performance.now() / 1000;
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    let current: KindProgram | undefined;
    for (const item of frame.items) {
      const entry = this.kinds.get(item.kind);
      if (!entry || item.alpha <= 0.01) continue;
      const ground = this.groundAt(item.position);
      const mercator = MercatorCoordinate.fromLngLat(item.position, ground + item.liftMetres);
      const unit = mercator.meterInMercatorCoordinateUnits();
      modelMatrix(
        this.model,
        [mercator.x, mercator.y, mercator.z],
        item.headingDegrees,
        item.scale,
        unit,
        -unit,
        unit,
      );
      multiply(this.product, mvp, this.model);
      for (let i = 0; i < 16; i++) this.upload[i] = this.product[i] as number;
      if (current !== entry) {
        gl.useProgram(entry.program);
        gl.bindVertexArray(entry.vao);
        gl.uniform3f(entry.uView, VIEW_IN_MODEL[0], VIEW_IN_MODEL[1], VIEW_IN_MODEL[2]);
        current = entry;
      }
      gl.uniformMatrix4fv(entry.uMatrix, false, this.upload);
      gl.uniform1f(entry.uAlpha, item.alpha);
      gl.uniform1f(entry.uPulse, item.pulse);
      gl.uniform1f(entry.uTime, time);
      gl.drawElements(gl.TRIANGLES, entry.indexCount, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);
    gl.depthMask(true);

    this.onLabel(this.beaconScreenPoint(mvp));
  }

  private groundAt(position: LatLng): number {
    if (!this.useTerrain || !this.map) return 0;
    const elevation = this.map.queryTerrainElevation(position);
    if (elevation !== null && Number.isFinite(elevation)) this.lastGround = elevation;
    return this.lastGround;
  }

  /** Where the top of the beacon column is on the screen, in CSS pixels. */
  private beaconScreenPoint(mvp: ArrayLike<number>): ScreenPoint | undefined {
    const map = this.map;
    const beacon = this.frame?.beacon;
    if (!map || !beacon) return undefined;
    const ground = this.groundAt(beacon.position);
    const m = MercatorCoordinate.fromLngLat(beacon.position, ground + beacon.heightMetres);
    const x = m.x;
    const y = m.y;
    const z = m.z;
    const clipX =
      (mvp[0] as number) * x +
      (mvp[4] as number) * y +
      (mvp[8] as number) * z +
      (mvp[12] as number);
    const clipY =
      (mvp[1] as number) * x +
      (mvp[5] as number) * y +
      (mvp[9] as number) * z +
      (mvp[13] as number);
    const clipW =
      (mvp[3] as number) * x +
      (mvp[7] as number) * y +
      (mvp[11] as number) * z +
      (mvp[15] as number);
    if (!(clipW > 0)) return undefined;
    const canvas = map.getCanvas();
    return {
      x: ((clipX / clipW + 1) / 2) * canvas.clientWidth,
      y: ((1 - clipY / clipW) / 2) * canvas.clientHeight,
    };
  }
}

export class MapLibreHolo {
  private readonly layer: HologramLayer;
  private readonly overlay: HTMLDivElement;
  private readonly label: BeaconLabel;
  private readonly scan: HTMLDivElement;
  private installed = false;
  private corridor: CorridorShape | undefined;
  private gridKey: string | undefined;
  private gridStrength = 0;

  constructor(
    private readonly map: MapLibreMap,
    sceneElement: HTMLElement,
    private readonly level: FxLevel,
    useTerrain: boolean,
  ) {
    this.overlay = createOverlay(sceneElement);
    this.label = new BeaconLabel(this.overlay);
    this.scan = document.createElement("div");
    this.scan.className = "wl-scanband";
    this.scan.dataset["level"] = level;
    this.overlay.prepend(this.scan);
    this.layer = new HologramLayer(useTerrain, (point) => {
      this.label.update(point, this.layer.frame?.beacon);
    });
  }

  /** Adds the sources and layers. Call once the style has loaded. */
  install(): void {
    if (this.installed) return;
    this.installed = true;
    const map = this.map;
    map.addSource(SOURCES.ribbon, { type: "geojson", data: EMPTY });
    map.addSource(SOURCES.rails, { type: "geojson", data: EMPTY });
    map.addSource(SOURCES.grid, { type: "geojson", data: EMPTY });
    if (this.level !== "off") {
      map.addLayer({
        id: LAYERS.grid,
        type: "line",
        source: SOURCES.grid,
        minzoom: 15,
        paint: { "line-color": HOLO_CYAN, "line-width": 1, "line-opacity": this.gridStrength },
      });
    }
    map.addLayer({
      id: LAYERS.ribbon,
      type: "fill",
      source: SOURCES.ribbon,
      paint: {
        "fill-color": HOLO_RIBBON,
        "fill-opacity": HOLO_RIBBON_ALPHA,
        "fill-antialias": true,
      },
    });
    map.addLayer({
      id: LAYERS.railGlow,
      type: "line",
      source: SOURCES.rails,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": HOLO_CYAN,
        "line-width": groundWidth(1.1) as never,
        "line-blur": 3,
        "line-opacity": 0.3,
      },
    });
    map.addLayer({
      id: LAYERS.rails,
      type: "line",
      source: SOURCES.rails,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": HOLO_CYAN_BRIGHT,
        "line-width": groundWidth(0.3) as never,
        "line-opacity": 0.95,
      },
    });
    map.addLayer(this.layer);
    if (this.corridor) this.writeCorridor(this.corridor);
  }

  setRoute(corridor: CorridorShape): void {
    this.corridor = corridor;
    this.gridKey = undefined;
    if (this.installed) this.writeCorridor(corridor);
  }

  setGuidance(frame: GuidanceFrame): void {
    this.layer.frame = frame;
    if (!frame.beacon) this.label.hide();
    this.updateGrid(frame);
  }

  /** Scan band and grid strength follow the daylight, quiet by day and clear at night. */
  setLighting(lighting: SceneLighting): void {
    const params = fxParameters(lighting, this.level);
    this.overlay.style.setProperty("--wl-scan-strength", params.scanStrength.toFixed(3));
    this.gridStrength = params.gridStrength;
    if (this.installed && this.map.getLayer(LAYERS.grid)) {
      this.map.setPaintProperty(LAYERS.grid, "line-opacity", params.gridStrength);
    }
  }

  destroy(): void {
    this.label.destroy();
    this.overlay.remove();
    if (this.installed && this.map.getStyle()) {
      for (const id of Object.values(LAYERS)) if (this.map.getLayer(id)) this.map.removeLayer(id);
      for (const id of Object.values(SOURCES))
        if (this.map.getSource(id)) this.map.removeSource(id);
    }
    this.installed = false;
  }

  private writeCorridor(corridor: CorridorShape): void {
    const ring = [...corridor.ribbon, corridor.ribbon[0] as LatLng];
    const ribbon = this.map.getSource(SOURCES.ribbon) as GeoJSONSource | undefined;
    ribbon?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [ring.map(lngLat)] },
    });
    const rails = this.map.getSource(SOURCES.rails) as GeoJSONSource | undefined;
    rails?.setData({
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiLineString",
        coordinates: [corridor.leftRail.map(lngLat), corridor.rightRail.map(lngLat)],
      },
    });
  }

  private updateGrid(frame: GuidanceFrame): void {
    const corridor = this.corridor;
    if (!this.installed || this.level === "off" || !corridor) return;
    const rider = frame.items.find((item) => item.kind === "rider");
    const reference = corridor.centre[0];
    if (!rider || !reference) return;
    const grid = groundGrid(reference, rider.position);
    if (grid.key === this.gridKey) return;
    this.gridKey = grid.key;
    const source = this.map.getSource(SOURCES.grid) as GeoJSONSource | undefined;
    source?.setData({
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiLineString",
        coordinates: grid.lines.map(([a, b]) => [lngLat(a), lngLat(b)]),
      },
    });
  }
}

const lngLat = (point: LatLng): [number, number] => [point.lng, point.lat];
