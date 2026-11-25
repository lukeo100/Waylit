import { Cartesian3, Cartesian4 } from "@cesium/core";
import { PostProcessStage, type Scene } from "@cesium/engine";
import {
  FX_OFF,
  fxParameters,
  scanBandPosition,
  type FxLevel,
  type FxParameters,
  type SceneLighting,
} from "@waylit/map-provider";
import { fxFragmentShader, packFxUniforms, type PackedFxUniforms } from "./fx-shader";

/**
 * The futuristic post process on a Cesium scene: one `PostProcessStage` with the shader from
 * `fx-shader.ts`. It owns the stage, changes variant when the level changes (high, low, off),
 * and updates the uniforms when the daylight state changes.
 *
 * Colour only: the stage never asks for the depth texture, so Cesium does not hand it any, and
 * this file never picks or samples anything from the scene (docs/ARCHITECTURE.md).
 */
export class CesiumFx {
  private stage: PostProcessStage | undefined;
  private stageVariant: 0 | 1 | 2 = 0;
  private params: FxParameters = FX_OFF;
  private packed: PackedFxUniforms | undefined;
  private lighting: SceneLighting | undefined;
  private suspended = false;
  private level: FxLevel;

  /** The vectors the stage's uniform functions return. Mutated in place on every update. */
  private readonly vectors = {
    u_grade: new Cartesian4(),
    u_shadow: new Cartesian4(),
    u_highlight: new Cartesian4(),
    u_edge: new Cartesian4(),
    u_edgeControl: new Cartesian4(),
    u_haze: new Cartesian3(),
    u_holo: new Cartesian4(-1, 0.07, 0, 0),
    u_motion: new Cartesian4(),
  };

  constructor(
    private readonly scene: Scene,
    initial: FxLevel,
  ) {
    this.level = initial;
  }

  get currentLevel(): FxLevel {
    return this.level;
  }

  /** Changes the level. `off` removes the stage, so nothing extra is drawn. */
  setLevel(level: FxLevel): void {
    this.level = level;
    this.refresh();
  }

  /** Gives it the daylight state. Cheap when nothing a rider could see has changed. */
  setLighting(lighting: SceneLighting): void {
    this.lighting = lighting;
    this.refresh();
  }

  /**
   * Moves the scan band and the grid scroll to the frame time. Cheap: two numbers. Call before
   * each frame while the effect is on.
   */
  tick(nowMs: number): void {
    if (this.stage === undefined) return;
    this.vectors.u_holo.x = scanBandPosition(nowMs);
    this.vectors.u_motion.x = ((nowMs / 1000) * 0.4) % 1;
  }

  /** Stops the effect while the tab is hidden or the ride has ended, and starts it again after. */
  setSuspended(suspended: boolean): void {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    this.refresh();
  }

  destroy(): void {
    this.removeStage();
  }

  private refresh(): void {
    if (this.scene.isDestroyed()) return;
    const level = this.suspended ? "off" : this.level;
    const params = this.lighting ? fxParameters(this.lighting, level) : FX_OFF;
    if (params.variant === 0) {
      this.params = params;
      this.removeStage();
      return;
    }
    if (params.variant !== this.stageVariant) this.addStage(params.variant);
    if (params.key !== this.params.key || this.packed === undefined) {
      this.params = params;
      this.packed = packFxUniforms(params);
      this.copyVectors(this.packed);
    }
  }

  private copyVectors(packed: PackedFxUniforms): void {
    const set4 = (target: Cartesian4, values: readonly number[]): void => {
      target.x = values[0] ?? 0;
      target.y = values[1] ?? 0;
      target.z = values[2] ?? 0;
      target.w = values[3] ?? 0;
    };
    set4(this.vectors.u_grade, packed.u_grade);
    set4(this.vectors.u_shadow, packed.u_shadow);
    set4(this.vectors.u_highlight, packed.u_highlight);
    set4(this.vectors.u_edge, packed.u_edge);
    set4(this.vectors.u_edgeControl, packed.u_edgeControl);
    // The band position and the scroll belong to the frame time, so only the other numbers
    // are taken from the daylight state.
    this.vectors.u_holo.y = packed.u_holo[1] ?? 0.07;
    this.vectors.u_holo.z = packed.u_holo[2] ?? 0;
    this.vectors.u_holo.w = packed.u_holo[3] ?? 0;
    this.vectors.u_haze.x = packed.u_haze[0] ?? 0;
    this.vectors.u_haze.y = packed.u_haze[1] ?? 0;
    this.vectors.u_haze.z = packed.u_haze[2] ?? 0;
    // The scene only redraws when asked while it is idle, so ask.
    this.scene.requestRender();
  }

  private addStage(variant: 1 | 2): void {
    this.removeStage();
    const vectors = this.vectors;
    const stage = new PostProcessStage({
      name: "waylit-fx",
      fragmentShader: fxFragmentShader(variant),
      uniforms: {
        u_grade: () => vectors.u_grade,
        u_shadow: () => vectors.u_shadow,
        u_highlight: () => vectors.u_highlight,
        u_edge: () => vectors.u_edge,
        u_edgeControl: () => vectors.u_edgeControl,
        u_haze: () => vectors.u_haze,
        u_holo: () => vectors.u_holo,
        u_motion: () => vectors.u_motion,
      },
    });
    this.scene.postProcessStages.add(stage);
    this.stage = stage;
    this.stageVariant = variant;
    this.packed = undefined;
  }

  private removeStage(): void {
    const stage = this.stage;
    this.stage = undefined;
    this.stageVariant = 0;
    if (stage && !this.scene.isDestroyed()) this.scene.postProcessStages.remove(stage);
  }
}
