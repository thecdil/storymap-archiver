import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import path from "node:path";

// engine.js is a plain browser script (no modules) shipped into every
// output folder; evaluate it in a sandbox exactly as a browser would and
// read back the global it defines.
const source = await readFile(path.join(import.meta.dirname, "../src/render/assets/engine.js"), "utf8");
const sandbox = { window: undefined };
vm.runInNewContext(source, sandbox);
const engine = sandbox.StorymapEngine;

test("headerCompact follows Cascade's (windowHeight - scrollTop - 50) >= 40 rule", () => {
  assert.equal(engine.headerCompact(0, 900), true);
  assert.equal(engine.headerCompact(809, 900), true, "remaining = 41");
  assert.equal(engine.headerCompact(811, 900), false, "remaining = 39");
  assert.equal(engine.headerCompact(2000, 900), false, "past the cover");
});

test("storyProgress is the viewport bottom as a fraction of the story, clamped", () => {
  assert.equal(engine.storyProgress(0, 900, 9000), 0.1);
  assert.equal(engine.storyProgress(8100, 900, 9000), 1);
  assert.equal(engine.storyProgress(100000, 900, 9000), 1);
  assert.equal(engine.storyProgress(0, 900, 0), 0);
});

test("activeViewIndex is the last panel whose top has entered from the bottom, else the first view", () => {
  // No panel entered yet (the 100vh lead-in): first view's background.
  assert.equal(engine.activeViewIndex([1200, 2400, 3600], 900), 0);
  // Panel 0 in view, panel 1 just about to enter (top === windowHeight → not yet).
  assert.equal(engine.activeViewIndex([100, 900, 2100], 900), 0);
  assert.equal(engine.activeViewIndex([-500, 899, 2100], 900), 1);
  assert.equal(engine.activeViewIndex([-2000, -800, 400], 900), 2);
});

test("isNavigatingAway once the section's bottom edge is inside the viewport", () => {
  assert.equal(engine.isNavigatingAway(2000, 900), false);
  assert.equal(engine.isNavigatingAway(899, 900), true);
  assert.equal(engine.isNavigatingAway(0, 900), false, "already gone");
});

test("viewScroll is the distance from the panel top up to the viewport bottom, zero while leaving", () => {
  assert.equal(engine.viewScroll(700, 900, false), 200);
  assert.equal(engine.viewScroll(1200, 900, false), 0);
  assert.equal(engine.viewScroll(700, 900, true), 0);
});

test("scrollFullBringIn fades the panel in past 5% of a viewport and resets below it unless leaving", () => {
  assert.equal(engine.scrollFullBringIn(false, 44, 900, false), false, "4.9%");
  assert.equal(engine.scrollFullBringIn(false, 46, 900, false), true, "5.1%");
  assert.equal(engine.scrollFullBringIn(true, 46, 900, false), true);
  assert.equal(engine.scrollFullBringIn(true, 44, 900, false), false, "scrolled back up: replay later");
  assert.equal(engine.scrollFullBringIn(true, 0, 900, true), true, "no flicker while the section leaves");
});

test("scrollPartialOpacity ramps in from the bottom, holds in the middle band, ramps out at the top", () => {
  const wh = 1000;
  const at = (top, height) => engine.scrollPartialOpacity(top, top + height, wh);
  assert.equal(at(1000, 200), 0, "still below the viewport");
  // top travelled 0.3 of the viewport (rect.top = 700): below the 0.45 start of the "in" ramp... but the
  // ramp is keyed on the *top* edge: top=0.3 → 1 - (0.45-0.3)/0.4 = 0.625
  assert.ok(Math.abs(at(700, 200) - 0.625) < 1e-9);
  assert.equal(at(500, 200), 1, "top=0.5, bottom=0.3: middle band");
  // bottom travelled 0.75 (rect.bottom = 250): 1 - (0.75-0.55)/0.4 = 0.5
  assert.ok(Math.abs(at(50, 200) - 0.5) < 1e-9);
  assert.equal(at(-300, 200), 0, "bottom past 95%: gone");
});

test("swipeClip reveals the incoming background 1.3x as fast as the scroll and reports the shadow edge", () => {
  // Spread: objects created inside the vm context have a different Object
  // prototype, which strict deepEqual would (correctly, but irrelevantly) reject.
  assert.deepEqual({ ...engine.swipeClip("swipe-vertical", 100, 1440, 900) }, {
    axis: "vertical",
    inset: "inset(770px 0 0 0)",
    edge: 770,
  });
  assert.equal(engine.swipeClip("swipe-vertical", 700, 1440, 900), null, "fully revealed");
  const horizontal = engine.swipeClip("swipe-horizontal", 450, 1440, 900);
  assert.equal(horizontal.axis, "horizontal");
  assert.ok(Math.abs(horizontal.edge - (1440 - 0.65 * 1440)) < 1e-9);
  assert.equal(engine.swipeClip("fade-fast", 100, 1440, 900), null);
});

test("transitionDuration matches the CSS fade timings", () => {
  assert.equal(engine.transitionDuration("fade-fast"), 500);
  assert.equal(engine.transitionDuration("fade-slow"), 1500);
  assert.equal(engine.transitionDuration("none"), 0);
  assert.equal(engine.transitionDuration("swipe-vertical"), 0);
});
