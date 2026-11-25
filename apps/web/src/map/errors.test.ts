import { describe, expect, it } from "vitest";
import { classifyFailure, failureMessage } from "./errors";

describe("classifyFailure", () => {
  it("reads a refused token as auth", () => {
    expect(classifyFailure({ statusCode: 401 }).kind).toBe("auth");
    expect(classifyFailure({ response: { status: 403 } }).kind).toBe("auth");
  });

  it("reads too many requests as quota", () => {
    const failure = classifyFailure({ statusCode: 429 });
    expect(failure.kind).toBe("quota");
    expect(failure.status).toBe(429);
  });

  it("reads missing and server errors as network", () => {
    expect(classifyFailure({ statusCode: 404 }).kind).toBe("network");
    expect(classifyFailure({ statusCode: 503 }).kind).toBe("network");
    expect(classifyFailure(new TypeError("Failed to fetch")).kind).toBe("network");
  });

  it("reads a WebGL failure as unsupported", () => {
    expect(
      classifyFailure(new Error("The browser supports WebGL, but initialization failed.")).kind,
    ).toBe("unsupported");
  });

  it("falls back to unknown", () => {
    expect(classifyFailure(new Error("odd")).kind).toBe("unknown");
    expect(classifyFailure(undefined).kind).toBe("unknown");
    expect(classifyFailure("text").kind).toBe("unknown");
  });

  it("never puts the raw error, a request address or a token in the message", () => {
    const secret = "access_token=SECRET123";
    const error = Object.assign(
      new Error(`Request has failed: https://api.cesium.com/v1/assets/1/endpoint?${secret}`),
      { statusCode: 401 },
    );
    const failure = classifyFailure(error);
    expect(JSON.stringify(failure)).not.toContain("SECRET123");
    expect(failure.message).toBe(failureMessage("auth"));
  });

  it("keeps every message short and plain", () => {
    for (const kind of ["unsupported", "auth", "quota", "network", "render", "unknown"] as const) {
      const message = failureMessage(kind);
      expect(message.length).toBeLessThan(80);
      expect(message).not.toMatch(/[—–]|https?:/);
    }
  });
});
