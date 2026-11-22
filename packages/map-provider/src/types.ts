import type { LatLng } from "@waylit/core";

/**
 * Map provider interface. Types only.
 *
 * The provider decision belongs to the mapping spike (task 3). These types describe what
 * the app needs from any provider so that rendering code stays swappable. Provider SDK
 * types must never appear here or in other shared packages.
 */

/** Text and link a provider requires to be visible while its data is shown. */
export interface ProviderAttribution {
  readonly text: string;
  readonly url?: string;
}

/** Third-person camera pose that follows the rider. */
export interface CameraPose {
  readonly target: LatLng;
  /** Degrees clockwise from true north. */
  readonly headingDegrees: number;
  /** Degrees below the horizon. */
  readonly pitchDegrees: number;
  /** Distance from camera to target in metres. */
  readonly rangeMetres: number;
}

/** Scene lighting input, derived from local time of day or an override. */
export interface SceneLighting {
  /** Milliseconds since the Unix epoch used to place the sun. */
  readonly timestamp: number;
}

export interface ProviderCapabilities {
  /** True when the provider can show 3D buildings or reality mesh tiles. */
  readonly threeDimensional: boolean;
  /** True when the provider needs an API key from the deployer. */
  readonly requiresKey: boolean;
}

/**
 * An opaque handle to wherever the provider renders. On the web this is a DOM element,
 * on native it may be a view reference. Kept opaque so shared code stays platform neutral.
 */
export type ProviderMountTarget = unknown;

export interface MapProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  readonly attributions: readonly ProviderAttribution[];
  mount(target: ProviderMountTarget): Promise<void>;
  unmount(): void;
  setCamera(pose: CameraPose): void;
  setLighting(lighting: SceneLighting): void;
}

/** Configuration passed to a provider factory. Keys come from the deployer's environment. */
export interface MapProviderConfig {
  readonly apiKey?: string;
}

export type MapProviderFactory = (config: MapProviderConfig) => MapProvider;
