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
  assert.equal(config.layers[0].title, "Layer A");
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
