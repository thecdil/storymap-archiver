import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTransitions, backgroundMediaKey } from "../src/normalize/transitions.js";

const image = (url) => ({ type: "image", image: { url } });
const webmap = (id, extra = {}) => ({ type: "webmap", webmapId: id, layerOverrides: [], extent: null, popup: null, ...extra });
const color = (value) => ({ type: "color", value });

test("backgroundMediaKey identifies media the way Cascade's media cache does", () => {
  assert.equal(backgroundMediaKey(image("a.jpg")), backgroundMediaKey(image("a.jpg")));
  assert.notEqual(backgroundMediaKey(image("a.jpg")), backgroundMediaKey(image("b.jpg")));
  // Same webmap with different per-view layer visibility is still the same media.
  assert.equal(backgroundMediaKey(webmap("m1", { layerOverrides: [{ id: "x", visibility: true }] })), backgroundMediaKey(webmap("m1")));
  assert.notEqual(backgroundMediaKey(webmap("m1")), backgroundMediaKey(image("m1")));
  assert.equal(backgroundMediaKey(null), "empty");
});

test("the first view of a section is always fade-fast, whatever was authored", () => {
  assert.deepEqual(resolveTransitions([{ transition: "swipe-vertical", background: image("a.jpg") }]), ["fade-fast"]);
  assert.deepEqual(resolveTransitions([{ transition: "none", background: image("a.jpg") }]), ["fade-fast"]);
  assert.deepEqual(resolveTransitions([{ transition: undefined, background: image("a.jpg") }]), ["fade-fast"]);
});

test("distinct media keep their authored transition", () => {
  const views = [
    { transition: "fade-fast", background: image("a.jpg") },
    { transition: "fade-slow", background: image("b.jpg") },
    { transition: "none", background: webmap("m1") },
    { transition: "swipe-horizontal", background: image("c.jpg") },
  ];
  assert.deepEqual(resolveTransitions(views), ["fade-fast", "fade-slow", "none", "swipe-horizontal"]);
});

test("an unknown authored transition falls back to fade-fast", () => {
  const views = [
    { transition: "fade-fast", background: image("a.jpg") },
    { transition: "wipe-diagonal", background: image("b.jpg") },
  ];
  assert.deepEqual(resolveTransitions(views), ["fade-fast", "fade-fast"]);
});

test("the same image in two consecutive views is forced to none (the picture just stays)", () => {
  const views = [
    { transition: "fade-fast", background: image("a.jpg") },
    { transition: "fade-slow", background: image("a.jpg") },
  ];
  assert.deepEqual(resolveTransitions(views), ["fade-fast", "none"]);
});

test("the same image reappearing non-consecutively keeps its authored transition", () => {
  const views = [
    { transition: "fade-fast", background: image("a.jpg") },
    { transition: "fade-fast", background: image("b.jpg") },
    { transition: "fade-slow", background: image("a.jpg") },
  ];
  assert.deepEqual(resolveTransitions(views), ["fade-fast", "fade-fast", "fade-slow"]);
});

test("a non-image media reappearing non-consecutively is forced to none", () => {
  const views = [
    { transition: "fade-fast", background: webmap("m1") },
    { transition: "fade-fast", background: image("b.jpg") },
    { transition: "fade-slow", background: webmap("m1") },
  ];
  assert.deepEqual(resolveTransitions(views), ["fade-fast", "fade-fast", "none"]);
});

test("the same webmap in consecutive views authorizes swipe-vertical only when the visible layers differ", () => {
  const sameLayers = [
    { transition: "fade-fast", background: webmap("m1", { layerOverrides: [{ id: "a", visibility: true }] }) },
    { transition: "swipe-vertical", background: webmap("m1", { layerOverrides: [{ id: "a", visibility: true }] }) },
  ];
  assert.deepEqual(resolveTransitions(sameLayers), ["fade-fast", "none"]);

  const differentLayers = [
    { transition: "fade-fast", background: webmap("m1", { layerOverrides: [{ id: "a", visibility: true }] }) },
    { transition: "swipe-vertical", background: webmap("m1", { layerOverrides: [{ id: "a", visibility: false }] }) },
  ];
  assert.deepEqual(resolveTransitions(differentLayers), ["fade-fast", "swipe-vertical"]);

  // Only swipe-vertical is authorized — a fade between two states of one
  // map isn't something the viewer will play.
  const differentLayersFade = [
    { transition: "fade-fast", background: webmap("m1", { layerOverrides: [{ id: "a", visibility: true }] }) },
    { transition: "fade-slow", background: webmap("m1", { layerOverrides: [{ id: "a", visibility: false }] }) },
  ];
  assert.deepEqual(resolveTransitions(differentLayersFade), ["fade-fast", "none"]);

  // A different extent between the two views disqualifies the swipe.
  const differentExtent = [
    { transition: "fade-fast", background: webmap("m1", { layerOverrides: [{ id: "a", visibility: true }] }) },
    {
      transition: "swipe-vertical",
      background: webmap("m1", { layerOverrides: [{ id: "a", visibility: false }], extent: { xmin: 0 } }),
    },
  ];
  assert.deepEqual(resolveTransitions(differentExtent), ["fade-fast", "none"]);
});

test("consecutive identical color backgrounds are forced to none", () => {
  const views = [
    { transition: "fade-fast", background: color("#000") },
    { transition: "fade-fast", background: color("#000") },
    { transition: "fade-fast", background: color("#fff") },
  ];
  assert.deepEqual(resolveTransitions(views), ["fade-fast", "none", "fade-fast"]);
});
