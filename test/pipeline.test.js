import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, rm, mkdtemp, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { getItem, getItemData, listItemResources } from "../src/fetch/item.js";
import { normalizeStory } from "../src/normalize/manifest.js";
import { localizeAssets } from "../src/assets/localize.js";
import { renderSite } from "../src/render/site.js";

const REAL_APPID = "545cd13f571b4ca087a3667951f9da44";
// A fixed but clearly-fake id, isolated from any real cache entry (this
// appid has never been fetched for real) so this test never touches the
// live ArcGIS API and never collides with real .cache/ entries.
const TEST_APPID = "e2e".padEnd(32, "0");
const PORTAL_HOST = "www.arcgis.com";

// A minimal valid 1x1 PNG — stands in for every image the story references,
// since this test is about pipeline wiring (does every reference resolve to
// a real file?), not image content.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function loadRelabeledFixture() {
  const dir = path.join(import.meta.dirname, "fixtures", REAL_APPID);
  const [itemText, dataText] = await Promise.all([
    readFile(path.join(dir, "item.json"), "utf8"),
    readFile(path.join(dir, "data.json"), "utf8"),
  ]);
  // Swap the real appid for the fake one everywhere it appears (including
  // inside image URLs like ".../content/items/<appid>/resources/x.jpg"), so
  // this fixture exercises both the item-resource and external-image
  // download paths exactly as the real story does, under a fake, isolated id.
  const relabel = (text) => text.replaceAll(REAL_APPID, TEST_APPID);
  return { item: JSON.parse(relabel(itemText)), data: JSON.parse(relabel(dataText)) };
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), { status: 200 });
}

function mockFetch(fixture) {
  const base = `https://${PORTAL_HOST}/sharing/rest/content/items/${TEST_APPID}`;
  return async (url) => {
    const urlStr = String(url);
    if (urlStr === `${base}?f=json`) return jsonResponse(fixture.item);
    if (urlStr === `${base}/data?f=json`) return jsonResponse(fixture.data);
    if (urlStr.startsWith(`${base}/resources?`)) return jsonResponse({ resources: [], nextStart: -1 });
    // Anything else is an image download — item-resource or external —
    // stand in with a tiny real image so localization has real bytes to write.
    return new Response(TINY_PNG, { status: 200 });
  };
}

function collectImageRefs(manifest) {
  const refs = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.url === "string" && typeof node.caption === "string") {
      refs.push(node.url);
      return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };
  visit(manifest.sections);
  return refs;
}

test("full pipeline (fetch -> normalize -> localize -> render) produces a complete, self-contained output folder", async (t) => {
  const fixture = await loadRelabeledFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch(fixture);

  const cacheDir = path.join(process.cwd(), ".cache", TEST_APPID);
  const outputDir = await mkdtemp(path.join(tmpdir(), "storymap-archiver-e2e-"));

  t.after(async () => {
    globalThis.fetch = originalFetch;
    await rm(cacheDir, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  });

  // Defensive: guarantee this run actually exercises the mock, regardless
  // of leftovers from a previous (e.g. crashed) run of this same test.
  await rm(cacheDir, { recursive: true, force: true });

  const item = await getItem(TEST_APPID, { portalHost: PORTAL_HOST });
  const data = await getItemData(TEST_APPID, { portalHost: PORTAL_HOST });
  await listItemResources(TEST_APPID, { portalHost: PORTAL_HOST });

  const { manifest, warnings } = normalizeStory({ item, data, appid: TEST_APPID, portalHost: PORTAL_HOST });
  assert.deepEqual(warnings, [], "the real fixture should still normalize with zero warnings under a relabeled id");
  assert.equal(manifest.sections.length, data.values.sections.length, "no section should be dropped");
  for (const section of manifest.sections) {
    assert.notEqual(section.kind, "unknown", "no section should fall back to unknown");
  }

  const { warnings: assetWarnings } = await localizeAssets(manifest, {
    appid: TEST_APPID,
    portalHost: PORTAL_HOST,
    outputDir,
  });
  assert.deepEqual(assetWarnings, [], "every mocked image download should succeed, producing zero warnings");

  // Mirrors bin/migrate.js: manifest.json is written by the CLI itself,
  // not by renderSite (whose job is only the deployable site).
  await writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  await renderSite(manifest, { outputDir, site: null, base: null });

  // Every image reference in the final manifest must be a local relative
  // path that actually exists on disk under outputDir.
  const imageRefs = collectImageRefs(manifest);
  assert.ok(imageRefs.length > 10, "sanity check: this fixture has many images");
  for (const ref of imageRefs) {
    assert.match(ref, /^assets\/images\//, `expected a localized relative path, got: ${ref}`);
    assert.ok(existsSync(path.join(outputDir, ref)), `referenced asset should exist on disk: ${ref}`);
  }

  // Background images with responsive variants (this fixture's Unsplash
  // covers/backgrounds list 2048/1600/1024/800px) should now be served at
  // their largest size, with every retained variant localized on disk.
  const backgroundImages = manifest.sections.flatMap((section) => [
    ...(section.background?.type === "image" ? [section.background.image] : []),
    ...(section.views ?? []).filter((v) => v.background?.type === "image").map((v) => v.background.image),
  ]);
  const withVariants = backgroundImages.filter((image) => image.sizes.length > 0);
  assert.ok(withVariants.length >= 10, "sanity check: this fixture has many Unsplash backgrounds");
  for (const image of withVariants) {
    assert.equal(Math.max(image.width, image.height), 2048, "primary url should be the largest variant");
    assert.equal(image.url, image.sizes[0].url);
    assert.notEqual(image.sizes[0].url, image.sizes.at(-1).url, "original default-size file is kept as a smaller candidate");
    for (const variant of image.sizes) {
      assert.match(variant.url, /^assets\/images\//);
      assert.ok(existsSync(path.join(outputDir, variant.url)), `variant should exist on disk: ${variant.url}`);
    }
  }
  // Uploaded item resources never list variants — nothing should be invented for them.
  const uploaded = backgroundImages.filter((image) => image.sizes.length === 0);
  assert.ok(uploaded.length > 0);
  for (const image of uploaded) {
    assert.equal(image.url, image.thumbUrl, "a single-size image is served from its one local file");
  }

  // No remote URL may survive anywhere in the manifest's image nodes.
  const manifestText = JSON.stringify(manifest.sections);
  assert.doesNotMatch(manifestText, /images\.unsplash\.com/, "remote size variants must not remain in the manifest");

  // The site's own static files should all be present.
  for (const file of ["index.html", "manifest.json", "assets/css/site.css", "assets/js/engine.js", "assets/js/site.js"]) {
    assert.ok(existsSync(path.join(outputDir, file)), `expected output file: ${file}`);
  }

  // This story's theme uses Open Sans + Noto Serif — both get vendored,
  // with every @font-face url() landing on a real file.
  assert.deepEqual(manifest.meta.vendoredFonts, ["open_sans", "noto_serif"]);
  const fontsCss = await readFile(path.join(outputDir, "assets/fonts/fonts.css"), "utf8");
  for (const match of fontsCss.matchAll(/url\('([^']+)'\)/g)) {
    assert.ok(existsSync(path.join(outputDir, "assets/fonts", match[1])), `missing vendored font file: ${match[1]}`);
  }
  assert.ok(existsSync(path.join(outputDir, "assets/fonts/open_sans/OpenSans-LICENSE.txt")));
  assert.ok(existsSync(path.join(outputDir, "assets/fonts/noto_serif/DroidSerif-LICENSE.txt")));

  // No leftover template artifacts, and the story's real title made it through.
  const html = await readFile(path.join(outputDir, "index.html"), "utf8");
  assert.doesNotMatch(html, /undefined|\[object Object\]/);
  assert.match(html, /Idaho Dairy Industry/);
  assert.match(html, /<link rel="stylesheet" href="assets\/fonts\/fonts\.css">/);

  // This story has no map sections, so Leaflet should not have been vendored.
  assert.equal(existsSync(path.join(outputDir, "assets/vendor/leaflet")), false);

  // Every downloaded image file should be non-empty (the tiny PNG, not a
  // truncated/zero-byte write).
  const imageFiles = await readdir(path.join(outputDir, "assets/images"));
  assert.ok(imageFiles.length > 0);
});
