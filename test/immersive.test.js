import { test } from "node:test";
import assert from "node:assert/strict";
import { renderImmersive, planBackgrounds } from "../src/render/immersive.js";

const image = (url, extra = {}) => ({ type: "image", image: { url, caption: "", ...extra } });
const webmap = (id, layers) => ({
  type: "webmap",
  webmapId: id,
  unavailable: false,
  interactionEnabled: true,
  baseMap: { baseMapLayers: [] },
  layers,
  extent: null,
});
const panel = (html, extra = {}) => ({
  layout: "scroll-full",
  position: "left",
  size: "medium",
  style: "background",
  theme: "white-over-black",
  isEmpty: false,
  blocks: [{ type: "text", html }],
  ...extra,
});
const view = (background, transition, panels, title = null) => ({
  transition,
  effectiveTransition: transition,
  background,
  title,
  panels,
});

test("planBackgrounds shares one element between views that reuse the same media", () => {
  const { elements, viewToElement } = planBackgrounds([
    view(image("a.jpg"), "fade-fast", []),
    view(image("b.jpg"), "fade-slow", []),
    view(image("a.jpg"), "none", []),
  ]);
  assert.equal(elements.length, 2);
  assert.deepEqual(viewToElement, [0, 1, 0]);
  assert.equal(elements[0].transition, "fade-fast", "the element animates with its first view's transition");
  assert.deepEqual(elements[0].views.map((v) => v.index), [0, 2]);
});

test("planBackgrounds gives a swipe between two states of the same webmap its own element", () => {
  const { elements, viewToElement } = planBackgrounds([
    view(webmap("m1", [{ id: "x", visible: true, dataFile: "d.geojson" }]), "fade-fast", []),
    view(webmap("m1", [{ id: "x", visible: false, dataFile: "d.geojson" }]), "swipe-vertical", []),
    view(webmap("m1", [{ id: "x", visible: true, dataFile: "d.geojson" }]), "none", []),
  ]);
  assert.equal(elements.length, 2, "swipe view gets a second map instance; the third view reuses the first");
  assert.deepEqual(viewToElement, [0, 1, 0]);
});

test("renderImmersive emits a sticky stage with unique backgrounds, the global title, and one panel per view", () => {
  const html = renderImmersive(
    {
      kind: "immersive",
      views: [
        view(image("a.jpg"), "fade-fast", [panel("<p>One</p>")], {
          value: " Camp locations ",
          global: true,
          style: { shadow: false, text: "dark", background: "light" },
        }),
        view(image("b.jpg", { options: { placement: { type: "fit", fit: { color: "#eee" } } } }), "fade-slow", [
          panel("<p>Two</p>", { position: "right", size: "small", style: "text-shadow", theme: "black-over-white" }),
        ]),
        view(image("a.jpg"), "none", [panel("<p></p>", { isEmpty: true })]),
      ],
    },
    "sec",
  );

  assert.match(html, /<section id="sec" class="immersive" data-views="3">/);
  assert.match(html, /<div class="immersive-stage">/);
  assert.equal((html.match(/class="immersive-bg"/g) ?? []).length, 2, "a.jpg is rendered once");
  assert.match(html, /<div class="immersive-bg" data-bg="0" data-transition="fade-fast" style=""><img class="background-image" src="a\.jpg"/);
  assert.match(html, /<div class="immersive-bg" data-bg="1" data-transition="fade-slow" style=""><div class="background-fit" style="background-color:#eee;">/);
  assert.match(html, /<div class="immersive-swipe-edge" hidden><\/div>/);
  assert.match(html, /<div class="immersive-title"><div class="text-background background-light"><h2 class="title-text text-dark">Camp locations<\/h2><\/div><\/div>/);

  // Panels: classes from settings, data-view/data-bg/data-transition for the engine.
  assert.match(html, /<div class="imm-panel layout-scroll-full size-medium placement-left theme-white-over-black style-background" data-view="0" data-bg="0" data-transition="fade-fast">\s*<div class="imm-card"><div class="block-text"><p>One<\/p><\/div><\/div>/);
  assert.match(html, /<div class="imm-panel layout-scroll-full size-small placement-right theme-black-over-white style-text-shadow" data-view="1" data-bg="1" data-transition="fade-slow">/);
  // The empty third panel keeps its scroll space but renders no card.
  assert.match(html, /<div class="imm-panel layout-scroll-full size-medium placement-left theme-white-over-black style-background" data-view="2" data-bg="0" data-transition="none">\s*<\/div>/);
  assert.equal((html.match(/imm-card/g) ?? []).length, 2);
});

test("renderImmersive omits the title when the first view has none and builds a multi-view map config", () => {
  const layers = (aVisible) => [
    { id: "a", title: "A", visible: aVisible, dataFile: "assets/data/m1/0.geojson" },
    { id: "b", title: "B", visible: true, dataFile: "assets/data/m1/1.geojson" },
    { id: "c", title: "Broken", visible: true, dataFile: null },
  ];
  const html = renderImmersive(
    {
      kind: "immersive",
      views: [
        view(webmap("m1", layers(true)), "fade-fast", [panel("<p>One</p>")], { value: "", global: true, style: null }),
        view(webmap("m1", layers(false)), "none", [panel("<p>Two</p>")]),
      ],
    },
    "maps",
  );
  assert.doesNotMatch(html, /immersive-title/);
  assert.equal((html.match(/class="storymap-map"/g) ?? []).length, 1, "one Leaflet map for both views");
  const config = JSON.parse(html.match(/data-map-config-for="map-\d+">(.+?)<\/script>/)[1]);
  assert.deepEqual(
    config.layers.map((l) => l.key),
    ["a", "b"],
    "the layer with no snapshot is left out of the client config",
  );
  assert.deepEqual(config.views, {
    0: { visible: ["a", "b"], extent: null },
    1: { visible: ["b"], extent: null },
  });
});

test("renderImmersive renders a view with no panels as a background-only spacer", () => {
  const html = renderImmersive({ kind: "immersive", views: [view(image("a.jpg"), "fade-fast", [])] }, "x");
  assert.match(html, /<div class="imm-panel layout-scroll-full" data-view="0" data-bg="0" data-transition="fade-fast">\s*<\/div>/);
});
