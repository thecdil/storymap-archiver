import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeStory } from "../src/normalize/manifest.js";

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures");

const EXAMPLES = [
  { appid: "545cd13f571b4ca087a3667951f9da44", name: "Aly - Dairy Drought" },
  { appid: "a459d05f5e2c4b5c9cd9e535e0c4afaa", name: "Closure of Syringa" },
  { appid: "cd897eb9ea4c4544af3e1972ec924745", name: "Flunkies and Loggerettes" },
];

async function loadFixture(appid) {
  const dir = path.join(FIXTURES_DIR, appid);
  const [item, data] = await Promise.all([
    readFile(path.join(dir, "item.json"), "utf8").then(JSON.parse),
    readFile(path.join(dir, "data.json"), "utf8").then(JSON.parse),
  ]);
  return { item, data };
}

for (const { appid, name } of EXAMPLES) {
  test(`normalizeStory produces no warnings for "${name}"`, async () => {
    const { item, data } = await loadFixture(appid);
    const { warnings } = normalizeStory({ item, data, appid, portalHost: "www.arcgis.com" });
    assert.deepEqual(warnings, []);
  });

  test(`normalizeStory covers every section for "${name}"`, async () => {
    const { item, data } = await loadFixture(appid);
    const { manifest } = normalizeStory({ item, data, appid, portalHost: "www.arcgis.com" });

    assert.equal(manifest.sections.length, data.values.sections.length);
    for (const section of manifest.sections) {
      assert.notEqual(section.kind, "unknown", `unexpected unknown section: ${JSON.stringify(section).slice(0, 200)}`);
    }
  });

  test(`normalizeStory carries item metadata into manifest.meta for "${name}"`, async () => {
    const { item, data } = await loadFixture(appid);
    const { manifest } = normalizeStory({ item, data, appid, portalHost: "www.arcgis.com" });

    assert.equal(manifest.meta.title, item.title.trim());
    assert.equal(manifest.meta.sourceAppid, appid);
    assert.equal(manifest.meta.template.name, "Story Map Cascade");
  });
}

test("normalizeStory flags an unrecognized section type instead of dropping it", () => {
  const item = { title: "Test" };
  const data = { values: { sections: [{ type: "mystery-section", foo: "bar" }] } };

  const { manifest, warnings } = normalizeStory({
    item,
    data,
    appid: "test-appid",
    portalHost: "www.arcgis.com",
  });

  assert.equal(manifest.sections.length, 1);
  assert.equal(manifest.sections[0].kind, "unknown");
  assert.equal(manifest.sections[0].sourceType, "mystery-section");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /mystery-section/);
});

test("normalizeStory flags an unrecognized block type instead of dropping it", () => {
  const item = { title: "Test" };
  const data = {
    values: {
      sections: [
        {
          type: "sequence",
          foreground: { blocks: [{ type: "audio", audio: { url: "x.mp3" } }] },
        },
      ],
    },
  };

  const { manifest, warnings } = normalizeStory({
    item,
    data,
    appid: "test-appid",
    portalHost: "www.arcgis.com",
  });

  const [block] = manifest.sections[0].blocks;
  assert.equal(block.type, "unknown");
  assert.equal(block.sourceType, "audio");
  assert.equal(warnings.length, 1);
});

test("normalizeStory normalizes a webmap background with layer overrides", () => {
  const item = { title: "Test" };
  const data = {
    values: {
      sections: [
        {
          type: "immersive",
          views: [
            {
              transition: "fade-fast",
              background: {
                type: "webmap",
                webmap: {
                  id: "abc123",
                  options: { interaction: "enabled" },
                  extras: { legend: { enabled: true } },
                  layers: [{ id: "layer1", visibility: true }],
                },
              },
              foreground: { panels: [] },
            },
          ],
        },
      ],
    },
  };

  const { manifest, warnings } = normalizeStory({
    item,
    data,
    appid: "test-appid",
    portalHost: "www.arcgis.com",
  });

  const background = manifest.sections[0].views[0].background;
  assert.equal(warnings.length, 0);
  assert.equal(background.type, "webmap");
  assert.equal(background.webmapId, "abc123");
  assert.equal(background.interactionEnabled, true);
  assert.equal(background.extras.legend, true);
  assert.equal(background.extras.locate, false);
  assert.deepEqual(background.layerOverrides, [{ id: "layer1", visibility: true }]);
});
