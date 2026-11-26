import { describe, expect, it } from "vitest";
import type {
  CameraPose,
  CorridorShape,
  FrameListener,
  GuidanceFrame,
  MapProvider,
  ProviderActivity,
  ProviderId,
  ProviderStatus,
  ProviderStatusListener,
  RenderTuning,
  SceneLighting,
} from "@waylit/map-provider";
import { DEFAULT_TUNING, selectProvider } from "@waylit/map-provider";
import {
  DEMO_ROUTE,
  computeProgress,
  createProgressModel,
  formatDistance,
  nextTurn,
} from "@waylit/core";
import { MapSceneController, NOTES, startFixOf, type SceneState } from "./scene-controller";

class FakeProvider implements MapProvider {
  readonly displayName = "fake";
  readonly capabilities = {
    threeDimensional: true,
    photorealistic: false,
    requiresKey: false,
    mayReadSurfaceHeights: false,
  };
  readonly attributions = [];
  mounted = false;
  unmounted = 0;
  poses: CameraPose[] = [];
  routes: CorridorShape[] = [];
  guidance: GuidanceFrame[] = [];
  lightings: SceneLighting[] = [];
  activities: ProviderActivity[] = [];
  failMountWith: string | undefined;
  fxCalls: { level: string; pinned: boolean }[] = [];
  /** Set to make this fake able to change the effect level without starting again. */
  liveFx = false;
  private frames = new Set<FrameListener>();
  private statuses = new Set<ProviderStatusListener>();

  constructor(readonly id: ProviderId) {
    if (id === "cesium-google") {
      this.setFxLevel = (level, pinned) => {
        this.fxCalls.push({ level, pinned });
        return this.liveFx;
      };
    }
  }

  mount(): Promise<void> {
    if (this.failMountWith !== undefined) return Promise.reject(new Error(this.failMountWith));
    this.mounted = true;
    return Promise.resolve();
  }
  unmount(): void {
    this.unmounted += 1;
    this.frames.clear();
    this.statuses.clear();
  }
  setCamera(pose: CameraPose): void {
    this.poses.push(pose);
  }
  setRoute(corridor: CorridorShape): void {
    this.routes.push(corridor);
  }
  setGuidance(frame: GuidanceFrame): void {
    this.guidance.push(frame);
  }
  /** Only the Google provider can change the level live. The fallback has no such method. */
  setFxLevel?: (level: "off" | "low" | "high", pinned: boolean) => boolean;
  fxNow: string | undefined;
  setLighting(l: SceneLighting): void {
    this.lightings.push(l);
  }
  setActivity(a: ProviderActivity): void {
    this.activities.push(a);
  }
  onFrame(l: FrameListener): () => void {
    this.frames.add(l);
    return () => this.frames.delete(l);
  }
  onStatus(l: ProviderStatusListener): () => void {
    this.statuses.add(l);
    return () => this.statuses.delete(l);
  }
  getDiagnostics() {
    return this.fxNow === undefined ? {} : { fxLevel: this.fxNow };
  }
  getFrameStats() {
    return {
      currentFps: 0,
      medianFps: 0,
      onePercentLowFps: 0,
      lastFrameMs: 0,
      sampleCount: 0,
      median5MinFps: 0,
      medianRideFps: 0,
      rideSeconds: 0,
    };
  }
  frame(nowMs: number): void {
    for (const l of [...this.frames]) l(nowMs);
  }
  status(s: ProviderStatus): void {
    for (const l of [...this.statuses]) l(s);
  }
}

const START = { position: { lat: 52.4709, lng: 13.3995 }, headingDegrees: 90 };
const LIGHTING: SceneLighting = {
  timestamp: 1,
  position: START.position,
  sunElevationDegrees: 30,
  sunAzimuthDegrees: 180,
  phase: "day",
  daylightFactor: 1,
  warmth: 0,
};

function setup(search: string, token: string | undefined, nodeEnv = "production") {
  const created: FakeProvider[] = [];
  const states: SceneState[] = [];
  const failures = new Map<ProviderId, string>();
  const refuse = new Set<ProviderId>();
  const controller = new MapSceneController({
    sceneElement: {},
    creditsElement: {},
    selection: selectProvider({ search, token, nodeEnv }),
    route: DEMO_ROUTE,
    tuningFor: (id): RenderTuning => DEFAULT_TUNING[id],
    createProvider: (id) => {
      if (refuse.has(id)) return Promise.reject(new Error("cannot load"));
      const p = new FakeProvider(id);
      const message = failures.get(id);
      if (message !== undefined) p.failMountWith = message;
      created.push(p);
      return Promise.resolve(p);
    },
    startFix: START,
    now: () => 0,
    onState: (s) => states.push(s),
  });
  return { controller, created, states, failures, refuse };
}

describe("MapSceneController", () => {
  it("starts the fallback when there is no token", async () => {
    const { controller, created } = setup("", undefined);
    await controller.start();
    expect(created.map((p) => p.id)).toEqual(["maplibre-fallback"]);
    expect(controller.getState().providerId).toBe("maplibre-fallback");
    expect(controller.getState().note).toBeUndefined();
  });

  it("starts Cesium when the token is set in a production build", async () => {
    const { controller, created } = setup("", "t");
    await controller.start();
    expect(created.map((p) => p.id)).toEqual(["cesium-google"]);
  });

  it("defaults to the fallback in development, so reloads do not use the allowance", async () => {
    const { controller, created } = setup("", "t", "development");
    await controller.start();
    expect(created.map((p) => p.id)).toEqual(["maplibre-fallback"]);
  });

  it("says so when ?map=cesium is asked for without a token", () => {
    const { controller } = setup("?map=cesium", undefined, "development");
    expect(controller.getState().note).toBe(NOTES.noTokenRequested);
  });

  it("hands the lighting and the activity to the provider, even if set before it starts", async () => {
    const { controller, created } = setup("", undefined);
    controller.setLighting(LIGHTING);
    controller.setActivity("riding");
    await controller.start();
    expect(created[0]?.lightings).toEqual([LIGHTING]);
    expect(created[0]?.activities).toEqual(["riding"]);
    controller.setActivity("paused");
    expect(created[0]?.activities.at(-1)).toBe("paused");
  });

  it("moves the camera from the rider on each frame, and the provider never sees the route", async () => {
    const { controller, created } = setup("", undefined);
    await controller.start();
    const provider = created[0]!;
    provider.frame(0);
    expect(provider.poses).toHaveLength(1);
    expect(provider.poses[0]?.headingDegrees).toBeCloseTo(90, 6);
    controller.setRider({
      position: { lat: START.position.lat, lng: START.position.lng + 0.0002 },
      headingDegrees: 90,
    });
    for (let t = 16; t < 2000; t += 16) provider.frame(t);
    const last = provider.poses.at(-1)!;
    expect(last.rider.lng).toBeGreaterThan(START.position.lng);
  });

  it("puts the camera back at the start for a new trip", async () => {
    const { controller, created } = setup("", undefined);
    await controller.start();
    const provider = created[0]!;
    controller.setRider({
      position: { lat: START.position.lat + 0.01, lng: START.position.lng },
      headingDegrees: 0,
    });
    controller.resetCamera(START);
    provider.frame(10);
    expect(provider.poses.at(-1)?.rider.lat).toBeCloseTo(START.position.lat, 6);
  });

  it("falls back once when Cesium fails to start, with an amber note and no retry", async () => {
    const { controller, created, failures } = setup("", "t");
    failures.set("cesium-google", "The photorealistic map was refused. Showing the simple map.");
    await controller.start();
    expect(created.map((p) => p.id)).toEqual(["cesium-google", "maplibre-fallback"]);
    expect(created[0]?.unmounted).toBeGreaterThan(0);
    const state = controller.getState();
    expect(state.providerId).toBe("maplibre-fallback");
    expect(state.warning).toBe(true);
    expect(state.note).toBe("The photorealistic map was refused. Showing the simple map.");
  });

  it("falls back when Cesium fails while it is running", async () => {
    const { controller, created } = setup("", "t");
    controller.setLighting(LIGHTING);
    await controller.start();
    created[0]?.status({ state: "failed", kind: "quota", message: "limit reached" });
    // The swap is asynchronous.
    await Promise.resolve();
    await Promise.resolve();
    expect(created.map((p) => p.id)).toEqual(["cesium-google", "maplibre-fallback"]);
    expect(created[0]?.unmounted).toBeGreaterThan(0);
    expect(controller.getState().note).toBe("limit reached");
    // The new provider gets the lighting that was already set.
    expect(created[1]?.lightings).toEqual([LIGHTING]);
  });

  it("does not try Cesium again after it has failed", async () => {
    const { controller, created } = setup("", "t");
    await controller.start();
    created[0]?.status({ state: "failed", kind: "network", message: "x" });
    await Promise.resolve();
    await Promise.resolve();
    created[0]?.status({ state: "failed", kind: "network", message: "x" });
    await Promise.resolve();
    expect(created.filter((p) => p.id === "cesium-google")).toHaveLength(1);
  });

  it("shows a note and stops if the fallback cannot start either", async () => {
    const { controller, created, failures } = setup("", undefined);
    failures.set("maplibre-fallback", "The 3D map cannot run on this device.");
    await controller.start();
    expect(created).toHaveLength(1);
    expect(controller.getState().status).toBe("failed");
    expect(controller.getState().note).toBe(NOTES.unavailable);
  });

  it("keeps the camera moving and notes the problem when the fallback tiles fail", async () => {
    const { controller, created } = setup("", undefined);
    await controller.start();
    created[0]?.status({ state: "failed", kind: "network", message: "Some tiles failed" });
    expect(created).toHaveLength(1);
    expect(controller.getState().warning).toBe(true);
    expect(controller.getState().providerId).toBe("maplibre-fallback");
  });

  it("handles a provider module that cannot even load", async () => {
    const { controller, refuse, created } = setup("", "t");
    refuse.add("cesium-google");
    await controller.start();
    expect(created.map((p) => p.id)).toEqual(["maplibre-fallback"]);
  });

  it("unmounts the provider on dispose, and one that arrives late", async () => {
    const { controller, created } = setup("", undefined);
    await controller.start();
    controller.dispose();
    expect(created[0]?.unmounted).toBeGreaterThan(0);
  });
});

describe("MapSceneController effect level", () => {
  it("keeps the level while no provider is up, instead of asking for a restart", () => {
    const { controller } = setup("", undefined);
    expect(controller.setFxLevel("low", true)).toBe("deferred");
  });

  it("hands the level to a provider that can change it live", async () => {
    const { controller, created } = setup("", "t");
    await controller.start();
    const provider = created[0]!;
    provider.liveFx = true;
    expect(controller.setFxLevel("high", true)).toBe("applied");
    expect(provider.fxCalls).toEqual([{ level: "high", pinned: true }]);
  });

  it("defers, not restarts, while Google is still starting, and applies it when ready", async () => {
    const { controller, created } = setup("", "t");
    await controller.start();
    const provider = created[0]!;
    expect(controller.setFxLevel("low", false)).toBe("deferred");
    expect(created).toHaveLength(1);
    provider.liveFx = true;
    provider.status({ state: "ready" });
    expect(provider.fxCalls.at(-1)).toEqual({ level: "low", pinned: false });
  });

  it("asks for a restart only from a provider that cannot change it live (the fallback)", async () => {
    const { controller, created } = setup("", undefined);
    await controller.start();
    expect(created[0]!.id).toBe("maplibre-fallback");
    expect(controller.setFxLevel("low", false)).toBe("restart");
  });

  it("after Google failed, a new level restarts the fallback and never creates Google again", async () => {
    const { controller, created, failures } = setup("", "t");
    failures.set("cesium-google", "Google 3D tiles are not available.");
    await controller.start();
    expect(created.map((p) => p.id)).toEqual(["cesium-google", "maplibre-fallback"]);
    expect(controller.getState().providerId).toBe("maplibre-fallback");
    // The caller restarts a controller for the fallback. It must not ask this one to retry Google.
    expect(controller.setFxLevel("high", false)).toBe("restart");
    expect(created.filter((p) => p.id === "cesium-google")).toHaveLength(1);
  });

  it("starts with a note when the caller already knows Google failed", () => {
    const states: SceneState[] = [];
    const controller = new MapSceneController({
      sceneElement: {},
      creditsElement: {},
      selection: { id: "maplibre-fallback", reason: "chosen-fallback" },
      route: DEMO_ROUTE,
      tuningFor: (id) => DEFAULT_TUNING[id],
      createProvider: (id) => Promise.resolve(new FakeProvider(id)),
      startFix: START,
      now: () => 0,
      onState: (s) => states.push(s),
      startNote: { text: "Google 3D tiles are not available.", warning: true },
    });
    expect(controller.getState()).toMatchObject({
      note: "Google 3D tiles are not available.",
      warning: true,
    });
  });

  it("reports the level the provider is really drawing, so a governor step down shows", async () => {
    const { controller, created, states } = setup("", "t");
    await controller.start();
    const provider = created[0]!;
    provider.fxNow = "high";
    provider.frame(2000);
    expect(controller.getState().fxLevel).toBe("high");
    provider.fxNow = "low";
    provider.frame(2500);
    expect(controller.getState().fxLevel).toBe("high");
    provider.frame(3500);
    expect(controller.getState().fxLevel).toBe("low");
    expect(states.at(-1)?.fxLevel).toBe("low");
  });
});

describe("startFixOf", () => {
  it("faces along the first leg of the route", () => {
    const fix = startFixOf([
      { lat: 52.47, lng: 13.4 },
      { lat: 52.47, lng: 13.41 },
    ]);
    expect(fix.headingDegrees).toBeCloseTo(90, 0);
    expect(fix.position).toEqual({ lat: 52.47, lng: 13.4 });
  });

  it("copes with an empty or one point route", () => {
    expect(startFixOf([]).headingDegrees).toBe(0);
    expect(startFixOf([{ lat: 1, lng: 2 }]).headingDegrees).toBe(0);
  });
});

describe("MapSceneController guidance", () => {
  async function started(search = "") {
    const made = setup(search, undefined);
    await made.controller.start();
    const provider = made.created[0]!;
    return { ...made, provider };
  }

  it("gives the provider the corridor of the route as soon as it is attached", async () => {
    const { provider } = await started();
    expect(provider.routes).toHaveLength(1);
    expect(provider.routes[0]!.centre).toEqual(DEMO_ROUTE.path);
    expect(provider.routes[0]!.ribbon.length).toBe(DEMO_ROUTE.path.length * 2);
  });

  it("sends a guidance frame with the camera pose on every frame", async () => {
    const { provider, controller } = await started();
    controller.setRider({ position: DEMO_ROUTE.path[0]!, headingDegrees: 90 });
    provider.frame(16);
    provider.frame(48);
    expect(provider.poses.length).toBe(2);
    expect(provider.guidance.length).toBe(2);
    const frame = provider.guidance[1]!;
    const rider = frame.items.find((i) => i.kind === "rider")!;
    expect(rider.position).toEqual(provider.poses[1]!.rider);
    expect(rider.headingDegrees).toBe(provider.poses[1]!.headingDegrees);
    expect(frame.items.some((i) => i.kind === "chevron")).toBe(true);
  });

  it("shows the turn beacon with a countdown when the rider nears a turn", async () => {
    const { provider, controller } = await started();
    // About 60 m before the first full left turn of the demo route.
    const before = { lat: 52.47464, lng: 13.41053 };
    controller.resetCamera({ position: before, headingDegrees: 0 });
    provider.frame(16);
    const frame = provider.guidance.at(-1)!;
    expect(frame.beacon?.direction).toBe("left");
    expect(frame.beacon?.label).toMatch(/^\d+ m$/);
    expect(frame.beacon!.distanceMetres).toBeLessThan(80);
  });

  it("counts the beacon from the ride session's distance, the same number the HUD uses", async () => {
    const { provider, controller } = await started();
    const model = createProgressModel(DEMO_ROUTE);
    const first = nextTurn(model, 0)!;
    const along = first.atMetres - 30;
    // The camera is still at the start (a smoothed pose can trail the session by a few metres).
    controller.resetCamera({ position: DEMO_ROUTE.path[0]!, headingDegrees: 90 });
    controller.setProgress(along);
    provider.frame(16);
    const beacon = provider.guidance.at(-1)!.beacon!;
    const hud = computeProgress(model, { distanceAlongMetres: along, nowMs: 0 });
    const shown = formatDistance(hud.distanceToNextMetres!);
    expect(hud.nextInstruction).toBe(first.instruction);
    expect(beacon.label).toBe(`${shown.value} ${shown.unit}`);
    expect(beacon.label).toBe("30 m");
  });

  it("forgets the session distance on a reset, then counts from the rider's position", async () => {
    const { provider, controller } = await started();
    const model = createProgressModel(DEMO_ROUTE);
    const first = nextTurn(model, 0)!;
    controller.setProgress(first.atMetres - 30);
    controller.resetCamera({ position: DEMO_ROUTE.path[0]!, headingDegrees: 90 });
    provider.frame(16);
    // The reset forgot the session distance, so the rider at the start is far from any turn.
    expect(provider.guidance.at(-1)!.beacon).toBeUndefined();
  });

  it("hands the same route to the fallback after Cesium fails and is replaced", async () => {
    const made = setup("", "t");
    made.failures.set("cesium-google", "no tiles");
    await made.controller.start();
    expect(made.created.map((p) => p.id)).toEqual(["cesium-google", "maplibre-fallback"]);
    expect(made.created[1]!.routes).toHaveLength(1);
  });
});
