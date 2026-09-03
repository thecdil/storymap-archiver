#!/usr/bin/env node
/**
 * Dev-only visual check: drive a system Chromium over the DevTools Protocol
 * (no npm dependency — Node ≥ 22's native WebSocket) to screenshot a page
 * at a list of scroll offsets.
 *
 *   node scripts/screenshot.js <url> <outDir> [--width 1440] [--height 900] [--scroll 0,900,1800] [--chromium path]
 *     [--media screen|print] [--reduced-motion]
 *
 * <url> may be an http(s) URL (e.g. `pnpm dev` serving an output folder, or
 * the original Cascade viewer per docs/use-cascade.md) or a file:// URL.
 * Scroll offsets accept plain pixels or multiples of the viewport, e.g.
 * "0,0.5vh,1vh,2.5vh", optionally relative to an element:
 * "@main>section:nth-of-type(5):1.2vh" scrolls to that element's top plus
 * 1.2 viewports. Writes <outDir>/<offset>.png for each.
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    width: { type: "string", default: "1440" },
    height: { type: "string", default: "900" },
    scroll: { type: "string", default: "0" },
    chromium: { type: "string", default: process.env.CHROMIUM ?? "chromium" },
    settle: { type: "string", default: "700" },
    media: { type: "string", default: "screen" },
    "reduced-motion": { type: "boolean", default: false },
  },
});

const [url, outDir] = positionals;
if (!url || !outDir) {
  console.error("Usage: node scripts/screenshot.js <url> <outDir> [--width N] [--height N] [--scroll a,b,c] [--chromium path]");
  process.exit(1);
}

const width = Number(values.width);
const height = Number(values.height);
const settleMs = Number(values.settle);
function parseOffset(s) {
  return s.endsWith("vh") ? Math.round(parseFloat(s) * height) : Number(s);
}
const offsets = values.scroll.split(",").map((raw) => {
  const s = raw.trim();
  if (s.startsWith("@")) {
    const at = s.lastIndexOf(":");
    const selector = s.slice(1, at);
    const offset = s.slice(at + 1);
    return { label: `${selector}_${offset}`, selector, px: parseOffset(offset) };
  }
  return { label: s.endsWith("vh") ? s : `${s}px`, selector: null, px: parseOffset(s) };
});

const port = 9222 + Math.floor(Math.random() * 1000);
const chrome = spawn(
  values.chromium,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    `--window-size=${width},${height}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let chromeErr = "";
chrome.stderr.on("data", (d) => (chromeErr += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Chromium DevTools never came up on port ${port}\n${chromeErr}`);
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method && listeners.has(msg.method)) {
      for (const fn of listeners.get(msg.method)) fn(msg.params);
    }
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((res, rej) => {
            const id = nextId++;
            pending.set(id, { resolve: res, reject: rej });
            ws.send(JSON.stringify({ id, method, params }));
          }),
        on: (method, fn) => listeners.set(method, [...(listeners.get(method) ?? []), fn]),
        close: () => ws.close(),
      }),
    );
    ws.addEventListener("error", reject);
  });
}

try {
  const cdp = await connect(await waitForDevtools());
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Emulation.setEmulatedMedia", {
    media: values.media,
    features: values["reduced-motion"] ? [{ name: "prefers-reduced-motion", value: "reduce" }] : [],
  });

  const loaded = new Promise((r) => cdp.on("Page.loadEventFired", r));
  await cdp.send("Page.navigate", { url });
  await loaded;
  await sleep(settleMs);

  await mkdir(outDir, { recursive: true });
  for (const { label, selector, px } of offsets) {
    const base = selector
      ? `(document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().top ?? 0) + window.pageYOffset`
      : "0";
    await cdp.send("Runtime.evaluate", {
      expression: `window.scrollTo({ top: ${base} + ${px}, behavior: "instant" }); window.pageYOffset;`,
      awaitPromise: true,
    });
    await sleep(settleMs);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    const file = path.join(outDir, `${label.replace(/[^a-z0-9.]/gi, "_")}.png`);
    await writeFile(file, Buffer.from(data, "base64"));
    console.log(`wrote ${file}`);
  }
  // Ask the browser to exit over CDP: a snap-confined Chromium can't be
  // signalled from here (kill → EACCES), so this is the reliable path.
  await cdp.send("Browser.close").catch(() => {});
  cdp.close();
} finally {
  try {
    chrome.kill("SIGTERM");
  } catch {}
}
