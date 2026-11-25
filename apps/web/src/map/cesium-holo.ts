import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  ComponentDatatype,
  CornerType,
  CorridorGeometry,
  Ellipsoid,
  Geometry,
  GeometryAttribute,
  GeometryAttributes,
  GeometryInstance,
  Matrix3,
  Matrix4,
  PrimitiveType,
} from "@cesium/core";
import {
  BlendingState,
  ClassificationPrimitive,
  ClassificationType,
  Material,
  MaterialAppearance,
  PerInstanceColorAppearance,
  Primitive,
  SceneTransforms,
  Transforms,
  type Scene,
} from "@cesium/engine";
import {
  HOLO_CYAN_BRIGHT,
  HOLO_RIBBON,
  HOLO_RIBBON_ALPHA,
  holoDetailSettings,
  holoItemDrawn,
  meshFor,
  type BeaconState,
  type CorridorShape,
  type GroundHeightSource,
  type GuidanceFrame,
  type HoloDetail,
  type HoloItem,
  type HoloKind,
  type HoloMesh,
} from "@waylit/map-provider";
import type { LatLng } from "@waylit/core";
import { BeaconLabel, createOverlay, type ScreenPoint } from "./beacon-label";
import { HOLO_GLSL, holoFunctionFor } from "./holo-glsl";

/**
 * The hologram layer on CesiumJS: the glowing route corridor on the road, floating chevrons, the
 * turn beacon, the heading marker and the rider on an original kick scooter.
 *
 * Rules this file keeps for Google Photorealistic 3D Tiles (Amendment 3, docs/ARCHITECTURE.md):
 *
 *  - The corridor is a CLASSIFICATION primitive. It is a volume around the route that tints the
 *    tile surface inside it on the GPU (a stencil pass). Nothing is read back: no height, no
 *    geometry, no depth value ever reaches this code.
 *  - Everything else (chevrons, beacon, heading marker, rider) is positioned from the route and
 *    the rider with the documented ground height constant, never from the tiles. They can float
 *    or sink slightly, which is the accepted risk. They are drawn without a depth test, so they
 *    stay visible whatever the tile surface does, and the code needs no depth to do it.
 *  - The meshes and the shading are original. The tiles are never copied, cached or restyled by
 *    this file. (The optional screen space effect lives in `fx-stage.ts` behind the fx switch.)
 */

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** How far above and below the ground height constant the corridor volume reaches, in metres. */
const CORRIDOR_VOLUME_HALF_HEIGHT_METRES = 30;

/** The most items of one kind that are drawn at once. Chevrons are the only repeated kind. */
const POOL_LIMITS: Record<HoloKind, number> = { rider: 1, heading: 1, beacon: 1, chevron: 16 };

const KINDS: readonly HoloKind[] = ["rider", "heading", "beacon", "chevron"];

interface Entry {
  readonly primitive: Primitive;
  readonly material: Material;
}

export class CesiumHolo {
  private readonly pools: Record<HoloKind, Entry[]> = {
    rider: [],
    heading: [],
    beacon: [],
    chevron: [],
  };
  private ribbon: ClassificationPrimitive | undefined;
  private rails: ClassificationPrimitive | undefined;
  private corridor: CorridorShape | undefined;
  private detail: HoloDetail = "full";
  private readonly overlay: HTMLDivElement;
  private readonly label: BeaconLabel;
  private destroyed = false;

  private readonly enu = new Matrix4();
  private readonly turn = new Matrix3();
  private readonly world = new Cartesian3();
  // Scratch values reused every frame, so the per frame path allocates nothing of its own.
  private readonly labelWorld = new Cartesian3();
  private readonly labelWindow = new Cartesian2();
  private readonly labelPoint = { x: 0, y: 0 };
  private readonly used: Record<HoloKind, number> = {
    rider: 0,
    heading: 0,
    beacon: 0,
    chevron: 0,
  };

  constructor(
    private readonly scene: Scene,
    sceneElement: HTMLElement,
    private readonly ground: GroundHeightSource,
    private readonly fallbackGroundMetres: number,
  ) {
    this.overlay = createOverlay(sceneElement);
    this.label = new BeaconLabel(this.overlay);
  }

  /** Builds the corridor as classification volumes. Safe to call again for a new route. */
  setRoute(corridor: CorridorShape): void {
    if (this.destroyed) return;
    this.corridor = corridor;
    this.clearClassification();
    if (!ClassificationPrimitive.isSupported(this.scene)) return;
    const base = this.groundAt(corridor.centre[0]);
    const low = base - CORRIDOR_VOLUME_HALF_HEIGHT_METRES;
    const high = base + CORRIDOR_VOLUME_HALF_HEIGHT_METRES;
    const ribbonColour = Color.fromCssColorString(HOLO_RIBBON).withAlpha(HOLO_RIBBON_ALPHA);
    this.ribbon = classificationPrimitive([
      corridorInstance(corridor.centre, corridor.widthMetres, low, high, ribbonColour),
    ]);
    this.scene.primitives.add(this.ribbon);
    if (holoDetailSettings(this.detail).rails) this.addRails(corridor);
  }

  /**
   * How much to draw. `light` and `minimal` thin the chevrons, and `minimal` also removes the
   * rails volume (a second classification pass over the tiles). Called by the provider's own
   * frame rate governor, whatever the fx level is. Going back up is allowed here but the governor
   * never asks for it.
   */
  setDetail(detail: HoloDetail): void {
    if (this.destroyed || detail === this.detail) return;
    this.detail = detail;
    const wantRails = holoDetailSettings(detail).rails;
    if (!wantRails) this.removeRails();
    else if (this.corridor && this.ribbon && !this.rails) this.addRails(this.corridor);
  }

  get currentDetail(): HoloDetail {
    return this.detail;
  }

  /** Moves everything to this frame's guidance. */
  setGuidance(frame: GuidanceFrame, nowMs: number): void {
    if (this.destroyed) return;
    const used = this.used;
    for (const kind of KINDS) used[kind] = 0;
    for (const item of frame.items) {
      if (!holoItemDrawn(item, this.detail)) continue;
      const index = used[item.kind];
      if (index >= POOL_LIMITS[item.kind]) continue;
      used[item.kind] = index + 1;
      const entry = (this.pools[item.kind][index] ??= this.createEntry(item.kind));
      this.place(entry, item, nowMs);
    }
    for (const kind of KINDS) {
      const pool = this.pools[kind];
      for (let i = used[kind]; i < pool.length; i++) {
        const entry = pool[i];
        if (entry) entry.primitive.show = false;
      }
    }
    this.updateLabel(frame.beacon);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearClassification();
    if (!this.scene.isDestroyed()) {
      for (const pool of Object.values(this.pools)) {
        for (const entry of pool) this.scene.primitives.remove(entry.primitive);
      }
    }
    this.label.destroy();
    this.overlay.remove();
  }

  private addRails(corridor: CorridorShape): void {
    const base = this.groundAt(corridor.centre[0]);
    const low = base - CORRIDOR_VOLUME_HALF_HEIGHT_METRES;
    const high = base + CORRIDOR_VOLUME_HALF_HEIGHT_METRES;
    const railColour = Color.fromCssColorString(HOLO_CYAN_BRIGHT).withAlpha(0.85);
    this.rails = classificationPrimitive([
      corridorInstance(corridor.leftRail, corridor.railWidthMetres, low, high, railColour),
      corridorInstance(corridor.rightRail, corridor.railWidthMetres, low, high, railColour),
    ]);
    this.scene.primitives.add(this.rails);
  }

  private removeRails(): void {
    if (this.rails && !this.scene.isDestroyed()) this.scene.primitives.remove(this.rails);
    this.rails = undefined;
  }

  private clearClassification(): void {
    this.removeRails();
    if (this.ribbon && !this.scene.isDestroyed()) this.scene.primitives.remove(this.ribbon);
    this.ribbon = undefined;
  }

  private groundAt(position: LatLng | undefined): number {
    return (position ? this.ground.heightAt(position) : undefined) ?? this.fallbackGroundMetres;
  }

  private createEntry(kind: HoloKind): Entry {
    const material = holoMaterial(kind);
    const primitive = new Primitive({
      geometryInstances: new GeometryInstance({ geometry: geometryFor(meshFor(kind)) }),
      appearance: new MaterialAppearance({
        material,
        materialSupport: MaterialAppearance.MaterialSupport.TEXTURED,
        translucent: true,
        closed: false,
        flat: true,
        faceForward: true,
        // No depth test: the layer is drawn over the scene whatever the tiles are doing, and
        // the code never needs a depth value to decide that.
        renderState: {
          depthTest: { enabled: false },
          depthMask: false,
          cull: { enabled: false },
          blending: BlendingState.ALPHA_BLEND,
        },
      }),
      asynchronous: false,
      allowPicking: false,
      releaseGeometryInstances: false,
      compressVertices: false,
      cull: false,
      show: false,
    });
    this.scene.primitives.add(primitive);
    return { primitive, material };
  }

  private place(entry: Entry, item: HoloItem, nowMs: number): void {
    const height = this.groundAt(item.position) + item.liftMetres;
    Cartesian3.fromDegrees(
      item.position.lng,
      item.position.lat,
      height,
      Ellipsoid.WGS84,
      this.world,
    );
    Transforms.eastNorthUpToFixedFrame(this.world, Ellipsoid.WGS84, this.enu);
    Matrix3.fromRotationZ(-toRadians(item.headingDegrees), this.turn);
    const matrix = entry.primitive.modelMatrix;
    Matrix4.multiplyByMatrix3(this.enu, this.turn, matrix);
    if (item.scale !== 1) Matrix4.multiplyByUniformScale(matrix, item.scale, matrix);
    entry.primitive.modelMatrix = matrix;
    const uniforms = entry.material.uniforms as HoloUniforms;
    uniforms.u_alpha = item.alpha;
    uniforms.u_pulse = item.pulse;
    uniforms.u_time = nowMs / 1000;
    entry.primitive.show = item.alpha > 0.01;
  }

  private updateLabel(beacon: BeaconState | undefined): void {
    if (!beacon) {
      this.label.update(undefined, undefined);
      return;
    }
    const top = Cartesian3.fromDegrees(
      beacon.position.lng,
      beacon.position.lat,
      this.groundAt(beacon.position) + beacon.heightMetres,
      Ellipsoid.WGS84,
      this.labelWorld,
    );
    const window = SceneTransforms.worldToWindowCoordinates(this.scene, top, this.labelWindow);
    let point: ScreenPoint | undefined;
    if (window) {
      this.labelPoint.x = window.x;
      this.labelPoint.y = window.y;
      point = this.labelPoint;
    }
    this.label.update(point, beacon);
  }
}

interface HoloUniforms {
  u_alpha: number;
  u_pulse: number;
  u_time: number;
}

/** A Cesium material that runs the shared hologram shading for one kind of item. */
function holoMaterial(kind: HoloKind): Material {
  const source = `
${HOLO_GLSL}
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec4 shade = ${holoFunctionFor(kind)}(
    materialInput.st.x, materialInput.st.y,
    materialInput.normalEC, materialInput.positionToEyeEC,
    u_time, u_pulse, u_alpha);
  material.diffuse = shade.rgb;
  material.alpha = shade.a;
  return material;
}`;
  return new Material({
    fabric: {
      type: `WaylitHolo_${kind}`,
      uniforms: { u_alpha: 1, u_pulse: 0, u_time: 0 },
      source,
    },
    translucent: true,
  });
}

/** A Cesium geometry from a shared mesh. The mesh arrays are copied, never shared. */
function geometryFor(mesh: HoloMesh): Geometry {
  const attributes = new GeometryAttributes();
  attributes.position = new GeometryAttribute({
    componentDatatype: ComponentDatatype.DOUBLE,
    componentsPerAttribute: 3,
    values: new Float64Array(mesh.positions),
  });
  attributes.normal = new GeometryAttribute({
    componentDatatype: ComponentDatatype.FLOAT,
    componentsPerAttribute: 3,
    values: new Float32Array(mesh.normals),
  });
  // st carries the height above the ground and the gradient (see holo-model.ts).
  attributes.st = new GeometryAttribute({
    componentDatatype: ComponentDatatype.FLOAT,
    componentsPerAttribute: 2,
    values: new Float32Array(mesh.params),
  });
  return new Geometry({
    attributes,
    indices: new Uint16Array(mesh.indices),
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.fromVertices(Array.from(mesh.positions)),
  });
}

function corridorInstance(
  path: readonly LatLng[],
  widthMetres: number,
  lowEllipsoidMetres: number,
  highEllipsoidMetres: number,
  colour: Color,
): GeometryInstance {
  const flat: number[] = [];
  for (const point of path) flat.push(point.lng, point.lat);
  return new GeometryInstance({
    geometry: new CorridorGeometry({
      positions: Cartesian3.fromDegreesArray(flat),
      width: widthMetres,
      height: lowEllipsoidMetres,
      extrudedHeight: highEllipsoidMetres,
      cornerType: CornerType.ROUNDED,
      vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
    }),
    attributes: { color: ColorGeometryInstanceAttribute.fromColor(colour) },
  });
}

/**
 * A classification primitive for the 3D Tiles only. One colour per primitive, because the
 * technique allows only one.
 */
function classificationPrimitive(instances: GeometryInstance[]): ClassificationPrimitive {
  return new ClassificationPrimitive({
    geometryInstances: instances,
    appearance: new PerInstanceColorAppearance({ translucent: true, closed: true }),
    classificationType: ClassificationType.CESIUM_3D_TILE,
    allowPicking: false,
    releaseGeometryInstances: true,
  });
}
