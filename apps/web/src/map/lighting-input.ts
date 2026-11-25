import type { SceneLighting } from "@waylit/map-provider";
import type { DaylightState } from "@/hud/daylight";

/**
 * The scene's lighting input from the riding screen's daylight state. The 3D scene never works
 * out its own time of day: it takes the sun, the phase and the daylight factor the HUD uses, so
 * the dock, the sky and the tiles all agree, and the dev time override drives all three.
 */
export function sceneLightingFrom(daylight: DaylightState): SceneLighting {
  return {
    timestamp: daylight.nowMs,
    position: daylight.position,
    sunElevationDegrees: daylight.solar.elevationDegrees,
    sunAzimuthDegrees: daylight.solar.azimuthDegrees,
    phase: daylight.solar.phase,
    daylightFactor: daylight.factor,
    warmth: daylight.warmth,
  };
}
