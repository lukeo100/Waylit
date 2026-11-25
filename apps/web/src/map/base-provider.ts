import { FrameLimiter, FrameStats } from "@waylit/map-provider";
import type {
  CameraPose,
  CorridorShape,
  GuidanceFrame,
  FrameListener,
  FrameStatsSummary,
  MapProvider,
  ProviderActivity,
  ProviderAttribution,
  ProviderCapabilities,
  ProviderDiagnostics,
  ProviderId,
  ProviderMountTarget,
  ProviderStatus,
  ProviderStatusListener,
  RenderTuning,
  SceneLighting,
} from "@waylit/map-provider";

/**
 * What every provider shares: status and frame listeners, frame statistics, the frame limit and
 * the rule for when to draw. A provider draws only while the rider is on the start screen or
 * riding and the page is visible, so a hidden tab or a finished ride costs nothing.
 */
export abstract class BaseProvider implements MapProvider {
  abstract readonly id: ProviderId;
  abstract readonly displayName: string;
  abstract readonly capabilities: ProviderCapabilities;
  abstract readonly attributions: readonly ProviderAttribution[];

  protected readonly stats = new FrameStats();
  protected readonly limiter: FrameLimiter;
  protected activity: ProviderActivity = "idle";
  protected hidden = false;
  protected disposed = false;
  private readonly frameListeners = new Set<FrameListener>();
  private readonly statusListeners = new Set<ProviderStatusListener>();
  private lastStatus: ProviderStatus = { state: "loading" };
  private visibilityHandler: (() => void) | undefined;

  constructor(protected readonly tuning: RenderTuning) {
    this.limiter = new FrameLimiter(tuning.idleFps);
  }

  abstract mount(target: ProviderMountTarget): Promise<void>;
  abstract setCamera(pose: CameraPose): void;
  abstract setLighting(lighting: SceneLighting): void;
  abstract setRoute(corridor: CorridorShape): void;
  abstract setGuidance(frame: GuidanceFrame): void;
  abstract getDiagnostics(): ProviderDiagnostics;
  /** Starts or resumes drawing. */
  protected abstract startRendering(): void;
  /** Stops drawing completely. The last frame stays on the screen. */
  protected abstract stopRendering(): void;
  /** Applies the current frame rate cap. */
  protected abstract applyFrameRate(fps: number): void;
  protected abstract release(): void;

  unmount(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopWatchingVisibility();
    this.stopRendering();
    this.release();
    this.frameListeners.clear();
    this.statusListeners.clear();
  }

  setActivity(activity: ProviderActivity): void {
    // Start the numbers afresh when the ride begins, so they describe the ride and not the
    // slower start screen.
    if (activity === "riding" && this.activity !== "riding") this.stats.reset();
    this.activity = activity;
    this.syncRendering();
  }

  onFrame(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  }

  onStatus(listener: ProviderStatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.lastStatus);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  getFrameStats(): FrameStatsSummary {
    return this.stats.summary(performance.now());
  }

  protected emitStatus(status: ProviderStatus): void {
    if (this.disposed) return;
    this.lastStatus = status;
    for (const listener of [...this.statusListeners]) listener(status);
  }

  protected emitFrame(nowMs: number): void {
    for (const listener of this.frameListeners) listener(nowMs);
  }

  /** Pauses drawing while the page is hidden. Call once the renderer exists. */
  protected watchVisibility(): void {
    this.hidden = document.visibilityState === "hidden";
    this.visibilityHandler = () => {
      this.hidden = document.visibilityState === "hidden";
      this.syncRendering();
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
  }

  private stopWatchingVisibility(): void {
    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = undefined;
    }
  }

  /** Works out whether to draw, and at what rate, from the activity and the page visibility. */
  protected syncRendering(): void {
    if (this.disposed) return;
    const running = this.activity !== "paused" && !this.hidden;
    if (!running) {
      this.stopRendering();
      this.stats.breakSequence();
      return;
    }
    const fps = this.activity === "riding" ? this.tuning.ridingFps : this.tuning.idleFps;
    this.limiter.setTarget(fps);
    this.limiter.reset();
    this.applyFrameRate(fps);
    this.startRendering();
  }
}
