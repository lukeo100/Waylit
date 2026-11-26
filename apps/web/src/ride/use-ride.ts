"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { GpsChoice } from "@/map/map-settings";
import type { RideSnapshot } from "./ride-session";
import { createRideStore, type RideStore } from "./ride-store";
import { browserEnvironment, createSessionFor } from "./session-factory";
import type { VehicleController } from "@/vehicle/vehicle-controller";

/**
 * Runs one ride for the riding screen: the simulator on the demo route, or live phone GPS as a
 * free ride. Returns the latest snapshot and the actions. The first render and server render use
 * a fixed empty snapshot, so there is no hydration mismatch, and the live one takes over straight
 * after. The vehicle follows the rider's choice without restarting the ride. The source can only change while no trip is running (the settings sheet enforces that),
 * and a change starts a fresh session.
 */
export function useRide(
  gps: GpsChoice,
  vehicle?: VehicleController,
): {
  readonly snapshot: RideSnapshot;
  readonly actions: RideStore;
} {
  const store = useMemo(() => {
    const environment = browserEnvironment();
    return createRideStore(
      createSessionFor(gps, environment, vehicle?.getAdapter()),
      environment.timers,
    );
    // The controller is stable, and a change of adapter is followed by the effect below, so a new
    // choice does not rebuild the ride.
  }, [gps, vehicle]);
  // Follow the vehicle choice: the mock by default, or the Bluetooth adapter the rider picked.
  const { setVehicle } = store;
  useEffect(() => {
    if (!vehicle) return undefined;
    return vehicle.onAdapterChange(setVehicle);
  }, [vehicle, setVehicle]);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return { snapshot, actions: store };
}
