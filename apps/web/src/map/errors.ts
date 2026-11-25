import type { ProviderFailureKind } from "@waylit/map-provider";

/**
 * Turns whatever a map library threw into a failure kind and a short, fixed message for the
 * rider. The raw error is never shown or logged: a Cesium or Google request error can carry the
 * request address, and that address may hold a token or a session key.
 */

export interface ClassifiedFailure {
  readonly kind: ProviderFailureKind;
  /** Plain words for a quiet note. Never contains the raw error. */
  readonly message: string;
  /** The HTTP status when there was one, for the developer log. */
  readonly status?: number;
}

const MESSAGES: Record<ProviderFailureKind, string> = {
  unsupported: "This device cannot draw the 3D map. Showing the simple map.",
  auth: "The photorealistic map was refused. Showing the simple map.",
  quota: "The photorealistic map limit is reached. Showing the simple map.",
  network: "The map could not be reached. Showing the simple map.",
  render: "The 3D map stopped. Showing the simple map.",
  unknown: "The photorealistic map is unavailable. Showing the simple map.",
};

export function failureMessage(kind: ProviderFailureKind): string {
  return MESSAGES[kind];
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as Record<string, unknown>;
  for (const key of ["statusCode", "status"]) {
    const value = record[key];
    if (typeof value === "number" && value >= 100 && value < 600) return value;
  }
  // Cesium wraps a request failure and keeps the response on the error.
  const inner = record.response ?? record.error;
  return inner === undefined || inner === error ? undefined : statusOf(inner);
}

export function classifyFailure(error: unknown): ClassifiedFailure {
  const status = statusOf(error);
  const name = error instanceof Error ? error.name : "";
  const text = error instanceof Error ? error.message.toLowerCase() : "";
  const withStatus = (kind: ProviderFailureKind): ClassifiedFailure =>
    status === undefined
      ? { kind, message: failureMessage(kind) }
      : { kind, message: failureMessage(kind), status };

  if (status === 401 || status === 403) return withStatus("auth");
  if (status === 429) return withStatus("quota");
  if (status !== undefined && (status === 404 || status >= 500 || status === 408)) {
    return withStatus("network");
  }
  if (text.includes("webgl")) {
    return withStatus("unsupported");
  }
  if (name === "TypeError" || text.includes("failed to fetch") || text.includes("network")) {
    return withStatus("network");
  }
  return withStatus("unknown");
}
