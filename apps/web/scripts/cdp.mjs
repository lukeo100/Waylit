/**
 * A tiny Chrome DevTools Protocol client for the local check scripts in this folder. No
 * dependencies: it uses the WebSocket that ships with Node 22 and a Chrome or Chromium binary
 * (set CHROME_BIN, or it tries google-chrome and chromium). It is a developer tool, not part of
 * the app or the build.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function launchChrome({ port = 9333, extraArgs = [] } = {}) {
  const bin = process.env.CHROME_BIN ?? "google-chrome";
  const dir = mkdtempSync(join(tmpdir(), "waylit-chrome-"));
  const child = spawn(
    bin,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu-sandbox",
      "--hide-scrollbars",
      "--mute-audio",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${dir}`,
      ...extraArgs,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let version;
  for (let i = 0; i < 100 && !version; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    } catch {
      await sleep(100);
    }
  }
  if (!version) {
    child.kill();
    throw new Error("Chrome did not start");
  }
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry?.reject(new Error(message.error.message));
      else entry?.resolve(message.result);
    } else {
      for (const listener of listeners) listener(message);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  return {
    send,
    onEvent: (listener) => listeners.push(listener),
    /** Opens a page and returns helpers bound to it. */
    async newPage() {
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      const call = (method, params) => send(method, params, sessionId);
      await call("Page.enable");
      await call("Runtime.enable");
      return {
        call,
        sessionId,
        async evaluate(expression) {
          const result = await call("Runtime.evaluate", {
            expression,
            awaitPromise: true,
            returnByValue: true,
          });
          if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description ?? "evaluate failed");
          }
          return result.result.value;
        },
        async navigate(url) {
          await call("Page.navigate", { url });
          await sleep(300);
          for (let i = 0; i < 100; i++) {
            const state = await this.evaluate("document.readyState");
            if (state === "complete") return;
            await sleep(100);
          }
        },
        async screenshot(path, clip) {
          const { data } = await call("Page.captureScreenshot", {
            format: "png",
            ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
          });
          const { writeFileSync } = await import("node:fs");
          writeFileSync(path, Buffer.from(data, "base64"));
        },
        async setViewport(width, height, deviceScaleFactor = 1) {
          await call("Emulation.setDeviceMetricsOverride", {
            width,
            height,
            deviceScaleFactor,
            mobile: false,
          });
        },
        async close() {
          await send("Target.closeTarget", { targetId });
        },
      };
    },
    async close() {
      try {
        await send("Browser.close");
      } catch {
        // Chrome closes the socket while answering.
      }
      child.kill();
      await sleep(200);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export { sleep };
