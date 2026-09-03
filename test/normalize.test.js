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

for (const { appid, name } of EXAMPLES) {
  test(`normalizeStory carries presentation fields for "${name}"`, async () => {
    const { item, data } = await loadFixture(appid);
    const { manifest } = normalizeStory({ item, data, appid, portalHost: "www.arcgis.com" });

    // Every section carries its Cascade layout name when the source has one
    // (immersive sections never do — their layout lives on each panel —
    // and some older sequence sections omit it) and whether it's a bookmark.
    for (const section of manifest.sections) {
      assert.ok(section.layout === null || typeof section.layout === "string", `bad layout on ${section.kind}`);
      if (section.kind === "immersive") assert.equal(section.layout, null);
      assert.equal(typeof section.bookmark.enabled, "boolean");
      assert.equal(typeof section.bookmark.title, "string");
    }
    // None of the reference stories enable a bookmark (see docs/polish.md §1.1).
    assert.equal(manifest.sections.filter((s) => s.bookmark.enabled).length, 0);

    // Cover/title titleStyle, title band size (default medium).
    const cover = manifest.sections.find((s) => s.kind === "cover");
    assert.deepEqual(Object.keys(cover.titleStyle).sort(), ["background", "shadow", "text"]);
    for (const title of manifest.sections.filter((s) => s.kind === "title")) {
      assert.equal(title.size, "medium");
      assert.ok(title.titleStyle);
    }

    // Immersive: effective transition resolved for every view; panel layout
    // defaulted; isEmpty computed; view titles carry their style.
    for (const section of manifest.sections.filter((s) => s.kind === "immersive")) {
      for (const [i, view] of section.views.entries()) {
        assert.equal(view.effectiveTransition, "fade-fast", `view ${i} of a fade-fast-only story`);
        if (view.title) assert.ok("style" in view.title);
        for (const panel of view.panels) {
          assert.equal(panel.layout, "scroll-full");
          assert.equal(panel.isEmpty, false);
        }
        if (view.background?.type === "webmap") {
          assert.equal(view.background.extent, null);
          assert.equal(view.background.popup, null);
        }
      }
    }

    // Header settings always present, even when the story left them empty.
    assert.deepEqual(Object.keys(manifest.meta.header).sort(), ["link", "logo", "social"]);
    assert.equal(manifest.meta.header.logo.enabled, false);
  });
}

test("normalizeImage carries size, fitHeight, placement, mobile-pos and sorted sizes", async () => {
  // Real background image from "Aly - Dairy Drought": Unsplash source with
  // 4 size variants listed smallest-agnostic in the source.
  const { item, data } = await loadFixture("545cd13f571b4ca087a3667951f9da44");
  const { manifest, warnings } = normalizeStory({ item, data, appid: "545cd13f571b4ca087a3667951f9da44", portalHost: "www.arcgis.com" });
  assert.deepEqual(warnings, []);

  const cover = manifest.sections[0];
  assert.equal(cover.background.image.sizes.length, 4);
  assert.deepEqual(
    cover.background.image.sizes.map((s) => s.longestSide),
    [2048, 1600, 1024, 800],
    "largest first",
  );
  assert.equal(cover.background.image.options.size, "small");
  assert.equal(cover.background.image.options.placement, null);

  const fillView = manifest.sections
    .filter((s) => s.kind === "immersive")
    .flatMap((s) => s.views)
    .find((v) => v.background?.image?.options.placement?.type === "fill");
  assert.deepEqual(fillView.background.image.options.placement, { type: "fill", fill: { x: 0.5, y: 0.5 } });

  const fitView = manifest.sections
    .filter((s) => s.kind === "immersive")
    .flatMap((s) => s.views)
    .find((v) => v.background?.image?.options.placement?.type === "fit");
  assert.match(fitView.background.image.options.placement.fit.color, /^rgb\(/);

  const blockImage = manifest.sections
    .filter((s) => s.kind === "immersive")
    .flatMap((s) => s.views)
    .flatMap((v) => v.panels)
    .flatMap((p) => p.blocks)
    .find((b) => b.type === "image");
  assert.equal(typeof blockImage.image.options.fitHeight, "boolean");
  assert.deepEqual(blockImage.image.sizes, [], "uploaded item resources list no size variants");
  assert.equal(blockImage.image.options.mobilePos, null);
});

test("normalizeStory flags an unknown image placement type instead of dropping it", () => {
  const item = { title: "Test" };
  const data = {
    values: {
      sections: [
        {
          type: "cover",
          foreground: { title: "T" },
          background: { type: "image", image: { url: "x.jpg", options: { placement: { type: "tile" } } } },
        },
      ],
    },
  };
  const { manifest, warnings } = normalizeStory({ item, data, appid: "test-appid", portalHost: "www.arcgis.com" });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /tile/);
  assert.equal(manifest.sections[0].background.image.options.placement.type, "unknown");
});

test("normalizeStory marks a background-only immersive panel (single blank text block) as empty", () => {
  const item = { title: "Test" };
  const panel = (html) => ({
    layout: "scroll-partial",
    settings: { "position-x": "right", size: "small", style: "text-shadow", theme: "black-over-white" },
    blocks: [{ type: "text", text: { value: html } }],
  });
  const data = {
    values: {
      sections: [
        {
          type: "immersive",
          bookmark: { enabled: true, title: "Maps " },
          views: [
            { transition: "fade-slow", background: { type: "color", color: { value: "#000" } }, foreground: { panels: [panel('<p class="block">&nbsp;<br></p>')] } },
            { transition: "fade-slow", background: { type: "color", color: { value: "#fff" } }, foreground: { panels: [panel("<p>Real text</p>")] } },
          ],
        },
      ],
    },
  };
  const { manifest, warnings } = normalizeStory({ item, data, appid: "test-appid", portalHost: "www.arcgis.com" });
  assert.deepEqual(warnings, []);
  const [section] = manifest.sections;
  assert.deepEqual(section.bookmark, { enabled: true, title: "Maps" });
  assert.equal(section.views[0].panels[0].isEmpty, true);
  assert.equal(section.views[0].panels[0].layout, "scroll-partial");
  assert.equal(section.views[1].panels[0].isEmpty, false);
  assert.deepEqual(
    section.views.map((v) => v.effectiveTransition),
    ["fade-fast", "fade-slow"],
    "first view forced to fade-fast; second keeps its authored fade-slow",
  );
  assert.equal(section.views[0].transition, "fade-slow", "authored value is preserved alongside");
});

test("normalizeStory normalizes title size, titleStyle defaults, and header settings", () => {
  const item = { title: "Test" };
  const data = {
    values: {
      settings: {
        header: {
          logo: { enabled: true, url: "resources/tpl/viewer/icons/esri-logo.png", link: "https://www.esri.com" },
          link: { url: "https://example.org", title: "A Tagline" },
          social: { enabled: true },
        },
      },
      sections: [
        { type: "title", options: { size: "large" }, foreground: { title: "Big", options: { titleStyle: { shadow: true, text: "light", background: null } } } },
        { type: "title", options: { size: "huge" }, foreground: { title: "Odd" } },
        { type: "title", foreground: { title: "Plain" } },
      ],
    },
  };
  const { manifest, warnings } = normalizeStory({ item, data, appid: "test-appid", portalHost: "www.arcgis.com" });
  assert.deepEqual(warnings, []);

  const [large, odd, plain] = manifest.sections;
  assert.equal(large.size, "large");
  assert.deepEqual(large.titleStyle, { shadow: true, text: "light", background: null });
  assert.equal(odd.size, "medium", "unrecognized size falls back to the viewer default");
  assert.equal(plain.size, "medium");
  assert.equal(plain.titleStyle, null, "absent titleStyle stays null (viewer default: white text with shadow)");

  assert.deepEqual(manifest.meta.header, {
    logo: { enabled: true, url: "resources/tpl/viewer/icons/esri-logo.png", builtin: true, link: "https://www.esri.com" },
    link: { url: "https://example.org", title: "A Tagline" },
    social: { enabled: true },
  });
});

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
  assert.equal(background.extent, null);
  assert.equal(background.popup, null);
});
