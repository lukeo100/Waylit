"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createWakeLockController } from "./wake-lock";
import type { WakeLockStatus } from "./wake-lock";

/**
 * Keeps the screen awake while `enabled` is true. Use it from a ride screen:
 * `useWakeLock(true)`. Releases on unmount or when `enabled` turns false.
 */
export function useWakeLock(enabled = true): WakeLockStatus {
  const [controller] = useState(() => createWakeLockController());

  useEffect(() => {
    if (!enabled) return undefined;
    controller.start();
    return () => {
      controller.stop();
    };
  }, [controller, enabled]);

  return useSyncExternalStore(controller.subscribe, controller.getStatus, () => "inactive");
}
