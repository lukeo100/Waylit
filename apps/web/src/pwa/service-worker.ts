/**
 * Service worker registration and the update flow.
 *
 * The worker (public/sw.js) is registered in production only, because development
 * serves unhashed files that must never be cached. A new worker waits instead of taking
 * over, so an update never swaps files under a rider mid trip. The page is told an update
 * is ready, shows a prompt away from the riding screen, and on accept asks the waiting
 * worker to activate and then reloads once.
 */

export const SERVICE_WORKER_URL = "/sw.js";

export type UpdateListener = (applyUpdate: () => void) => void;

export interface WorkerLike {
  state: string;
  postMessage(message: unknown): void;
  addEventListener(type: "statechange", listener: () => void): void;
}

export interface RegistrationLike {
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  addEventListener(type: "updatefound", listener: () => void): void;
  update(): Promise<unknown>;
}

export interface ContainerLike {
  controller: unknown;
  register(
    url: string,
    options?: { scope?: string; updateViaCache?: "none" },
  ): Promise<RegistrationLike>;
  addEventListener(type: "controllerchange", listener: () => void): void;
}

/** Only register where it is safe and useful: production builds, with worker support. */
export function shouldRegister(env: { production: boolean; container: unknown }): boolean {
  return env.production && Boolean(env.container);
}

/**
 * Calls `onUpdateReady` when a new worker has installed and is waiting. The callback gets
 * a function that activates it and reloads the page once.
 */
export function watchForUpdates(
  container: ContainerLike,
  registration: RegistrationLike,
  reload: () => void,
  onUpdateReady: UpdateListener,
): void {
  let reloading = false;

  const applyFor = (worker: WorkerLike) => () => {
    container.addEventListener("controllerchange", () => {
      // A controllerchange can fire twice, so make the reload idempotent.
      if (reloading) return;
      reloading = true;
      reload();
    });
    worker.postMessage({ type: "SKIP_WAITING" });
  };

  // Only a page that already has a controller has something to update. On the very first
  // install the new worker simply takes over and there is nothing to ask about.
  if (registration.waiting && container.controller) {
    onUpdateReady(applyFor(registration.waiting));
  }

  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && container.controller) {
        onUpdateReady(applyFor(worker));
      }
    });
  });
}

/** Same origin build assets the page already loaded, for the worker to keep for offline use. */
export function loadedStaticUrls(
  entries: readonly { readonly name: string }[],
  origin: string,
): string[] {
  const urls = new Set<string>();
  for (const { name } of entries) {
    if (name.startsWith(`${origin}/_next/static/`)) urls.add(name);
  }
  return [...urls];
}
