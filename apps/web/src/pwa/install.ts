/**
 * Install flow helpers.
 *
 * Chromium browsers fire `beforeinstallprompt` when the app is installable. We keep the
 * event, and show our own small install button on the start screen only. Browsers that
 * never fire the event (Safari, Firefox) get a text hint instead.
 */

/** Not in lib.dom because it is Chromium only. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type InstallHint = "installed" | "ios" | "generic";

export interface InstallHintInput {
  readonly userAgent: string;
  /** True when running as an installed app (display-mode standalone or fullscreen, or iOS standalone). */
  readonly standalone: boolean;
}

/** Which fallback hint to show when no install prompt event is available. */
export function installHint({ userAgent, standalone }: InstallHintInput): InstallHint {
  if (standalone) return "installed";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  return "generic";
}

export const INSTALL_HINT_TEXT: Record<Exclude<InstallHint, "installed">, string> = {
  ios: "To install, tap Share, then Add to Home Screen.",
  generic: "To install, open your browser menu and choose Install app or Add to Home screen.",
};

export type InstallPromptState = "unavailable" | "available" | "installed";

export interface InstallPromptStore {
  getState(): InstallPromptState;
  subscribe(listener: () => void): () => void;
  /** Shows the browser install dialog. Resolves true if the rider accepted. */
  prompt(): Promise<boolean>;
  /** Attach window listeners. Returns a cleanup function. */
  attach(target: Pick<Window, "addEventListener" | "removeEventListener">): () => void;
}

export function createInstallPromptStore(): InstallPromptStore {
  const listeners = new Set<() => void>();
  let deferred: BeforeInstallPromptEvent | null = null;
  let installed = false;

  function emit(): void {
    for (const listener of listeners) listener();
  }

  return {
    getState: () => (installed ? "installed" : deferred ? "available" : "unavailable"),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async prompt() {
      const event = deferred;
      if (!event) return false;
      // The event can only be used once.
      deferred = null;
      emit();
      try {
        await event.prompt();
        const choice = await event.userChoice;
        return choice.outcome === "accepted";
      } catch {
        return false;
      }
    },
    attach(target) {
      const onBeforeInstall = (event: Event): void => {
        // Stop the browser mini infobar so the install button is the one prompt.
        event.preventDefault();
        deferred = event as BeforeInstallPromptEvent;
        emit();
      };
      const onInstalled = (): void => {
        installed = true;
        deferred = null;
        emit();
      };
      target.addEventListener("beforeinstallprompt", onBeforeInstall);
      target.addEventListener("appinstalled", onInstalled);
      return () => {
        target.removeEventListener("beforeinstallprompt", onBeforeInstall);
        target.removeEventListener("appinstalled", onInstalled);
      };
    },
  };
}

/** True when the page runs as an installed app. Browser only. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // The manifest asks for fullscreen with standalone as the fallback, so an installed app runs
  // in either mode. Some browsers only match the mode that is actually applied.
  return (
    iosStandalone ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}

/** The one store the app uses. Attached once, near the root, so an early event is not lost. */
export const installPromptStore = createInstallPromptStore();
