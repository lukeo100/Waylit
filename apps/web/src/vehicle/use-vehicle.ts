"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { devControlsEnabled } from "@/hud/dev-controls";
import {
  createBrowserVehicleController,
  createInertVehicleController,
  type VehicleController,
  type VehicleSnapshot,
} from "./vehicle-controller";

const SERVER_SNAPSHOT: VehicleSnapshot = createInertVehicleController().getSnapshot();

/**
 * The vehicle controller for the riding screen, and its current snapshot. The first render and
 * the server render use a fixed mock snapshot so they always match, and the live one takes over
 * straight after. Leaving the screen ends the Bluetooth link.
 */
export function useVehicle(): {
  readonly controller: VehicleController;
  readonly snapshot: VehicleSnapshot;
} {
  const [controller] = useState<VehicleController>(() =>
    typeof window === "undefined"
      ? createInertVehicleController()
      : createBrowserVehicleController(
          devControlsEnabled(window.location.search, process.env.NODE_ENV),
        ),
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    () => SERVER_SNAPSHOT,
  );

  useEffect(
    () => () => {
      void controller.disconnect();
    },
    [controller],
  );

  return { controller, snapshot };
}

/**
 * Tells the controller whether the rider's session is on: the screen is visible and the trip is
 * not over. A lost link is only chased while it is, and one is brought back when it returns.
 */
export function useVehicleSessionActive(controller: VehicleController, active: boolean): void {
  useEffect(() => {
    const update = (): void => {
      controller.setSessionActive(active && document.visibilityState === "visible");
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
    };
  }, [controller, active]);
}
