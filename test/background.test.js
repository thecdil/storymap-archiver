import { test } from "node:test";
import assert from "node:assert/strict";
import { renderBackground } from "../src/render/background.js";

test("renderBackground returns an empty result for null", () => {
  assert.deepEqual(renderBackground(null), { html: "", style: "" });
});

test("renderBackground renders a color background as an inline style", () => {
  const result = renderBackground({ type: "color", value: "#000" });
  assert.equal(result.html, "");
  assert.equal(result.style, "background-color:#000;");
});

test("renderBackground renders an image background with a plain-text alt derived from its caption", () => {
  const result = renderBackground({
    type: "image",
    image: { url: "assets/images/bg.jpg", caption: "A caption&nbsp;with an entity" },
  });
  assert.match(result.html, /src="assets\/images\/bg\.jpg"/);
  assert.match(result.html, /alt="A caption with an entity"/);
  assert.doesNotMatch(result.html, /&amp;nbsp;/);
});

test("renderBackground renders a webmap background as a map container plus embedded JSON config", () => {
  const result = renderBackground({
    type: "webmap",
    unavailable: false,
    baseMap: {
      baseMapLayers: [
        { title: "Base", layerType: "ArcGISTiledMapServiceLayer", url: "https://example.com/MapServer" },
        { title: "Not a tile layer", layerType: "SomethingElse", url: "https://example.com/other" },
      ],
    },
    layers: [
      { id: "a", title: "Layer A", visible: true, dataFile: "assets/data/x/0.geojson" },
      { id: "b", title: "Layer B", visible: false, dataFile: null },
    ],
  });

  assert.match(result.html, /class="storymap-map" id="map-\d+"/);
  const configMatch = result.html.match(/<script type="application\/json" data-map-config-for="[^"]+">(.+)<\/script>/);
  assert.ok(configMatch, "expected an embedded map config script tag");

  const config = JSON.parse(configMatch[1]);
  assert.equal(config.tileLayers.length, 1, "only the ArcGISTiledMapServiceLayer should become a tile layer");
  assert.match(config.tileLayers[0].urlTemplate, /\/tile\/\{z\}\/\{y\}\/\{x\}$/);
  assert.equal(config.layers.length, 1, "layers without a dataFile should be dropped from the client config");
  assert.deepEqual(config.layers[0], { key: "a", title: "Layer A", dataFile: "assets/data/x/0.geojson" });
  assert.deepEqual(config.views, { 0: { visible: ["a"], extent: null } });
  assert.equal(config.initialExtent, null);
  assert.equal(config.interaction, true);
});

test("renderBackground falls back to a raster Light Gray Canvas when the basemap is vector-only, and carries the saved extent", () => {
  const result = renderBackground({
    type: "webmap",
    unavailable: false,
    interactionEnabled: false,
    initialExtent: [
      [-117.2, 41.9],
      [-111.0, 49.0],
    ],
    baseMap: { title: "Light Gray Canvas", baseMapLayers: [{ title: "Light Gray", layerType: "VectorTileLayer", url: "https://x/root.json" }] },
    layers: [],
  });
  const config = JSON.parse(result.html.match(/data-map-config-for="[^"]+">(.+)<\/script>/)[1]);
  assert.equal(config.tileLayers.length, 2);
  assert.match(config.tileLayers[0].urlTemplate, /World_Light_Gray_Base/);

  const dark = renderBackground({
    type: "webmap",
    unavailable: false,
    baseMap: { title: "Dark Gray Canvas", baseMapLayers: [{ title: "Dark", layerType: "VectorTileLayer", url: "https://x/root.json" }] },
    layers: [],
  });
  const darkConfig = JSON.parse(dark.html.match(/data-map-config-for="[^"]+">(.+)<\/script>/)[1]);
  assert.match(darkConfig.tileLayers[0].urlTemplate, /World_Dark_Gray_Base/, "a dark original gets the dark raster canvas");
  assert.deepEqual(config.initialExtent, [
    [-117.2, 41.9],
    [-111.0, 49.0],
  ]);
  assert.equal(config.interaction, false);
  assert.match(result.html, /class="storymap-map interaction-disabled"/);
});

test("renderBackground renders an image with its fill focal point / fit letterbox placement", () => {
  const fill = renderBackground({
    type: "image",
    image: { url: "a.jpg", caption: "", options: { placement: { type: "fill", fill: { x: 0.25, y: 1 } } } },
  });
  assert.match(fill.html, /<img class="background-image" src="a\.jpg" alt="" loading="lazy" style="object-position:25% 100%;">/);

  const fit = renderBackground({
    type: "image",
    image: { url: "b.png", caption: "", options: { placement: { type: "fit", fit: { color: "rgb(236, 251, 187)" } } } },
  });
  assert.match(fit.html, /<div class="background-fit" style="background-color:rgb\(236, 251, 187\);"><img class="background-image" src="b\.png"/);

  const plain = renderBackground({ type: "image", image: { url: "c.jpg", caption: "" } });
  assert.doesNotMatch(plain.html, /style=|background-fit/);
});

test("renderBackground shows a clear placeholder for an unavailable webmap instead of an empty map", () => {
  const result = renderBackground({ type: "webmap", unavailable: true });
  assert.match(result.html, /background-unavailable/);
  assert.doesNotMatch(result.html, /storymap-map/);
});

test("renderBackground falls back to a visible placeholder for an unknown background type, not silence", () => {
  const result = renderBackground({ type: "unknown", sourceType: "video" });
  assert.match(result.html, /background-unsupported/);
  assert.match(result.html, /"video"/);
});
