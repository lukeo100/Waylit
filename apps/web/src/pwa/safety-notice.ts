/**
 * First run safety notice acknowledgement.
 *
 * Waylit is a navigation aid, not a safety system. The rider sees a notice once and the
 * acknowledgement is remembered in localStorage. Storage can be blocked (private modes,
 * browser settings) or throw on access, so every call is wrapped. If storage fails the
 * acknowledgement lasts for the current page session only, so the notice is not shown
 * again and again but is never wrongly recorded as saved.
 */

/** Bump the version suffix when the notice wording changes in a way riders must re-read. */
export const SAFETY_NOTICE_KEY = "waylit:safety-notice-ack:v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SafetyNoticeStore {
  /** True once the rider has acknowledged the notice. */
  isAcknowledged(): boolean;
  /** Records the acknowledgement. Returns true if it was saved to storage. */
  acknowledge(): boolean;
  subscribe(listener: () => void): () => void;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function createSafetyNoticeStore(
  getStorage: () => StorageLike | null = browserStorage,
): SafetyNoticeStore {
  const listeners = new Set<() => void>();
  let acknowledgedThisSession = false;

  function readStored(): boolean {
    try {
      return getStorage()?.getItem(SAFETY_NOTICE_KEY) === "1";
    } catch {
      return false;
    }
  }

  return {
    isAcknowledged: () => acknowledgedThisSession || readStored(),
    acknowledge() {
      acknowledgedThisSession = true;
      let saved = false;
      try {
        const storage = getStorage();
        if (storage) {
          storage.setItem(SAFETY_NOTICE_KEY, "1");
          saved = true;
        }
      } catch {
        saved = false;
      }
      for (const listener of listeners) listener();
      return saved;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The one store the app uses. */
export const safetyNotice = createSafetyNoticeStore();
