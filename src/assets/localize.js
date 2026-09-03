import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { arcgisToGeoJSON } from "@esri/arcgis-to-geojson-utils";
import { fetchAssetBytes, localAssetFilename } from "./download.js";
import { vendorLeaflet, vendorFonts, unvendorableFontFamilies, hasUnsupportedGlyphs } from "./vendor.js";
import { isWebMercatorWkid, reprojectWebMercatorGeometry } from "./geometry.js";
import { getWebmapLayers, queryFeatureLayerAsGeoJson } from "../fetch/webmap.js";

const IMAGES_DIR = "assets/images";
const DATA_DIR = "assets/data";

function collectImagesFromBlocks(blocks, sink) {
  for (const block of blocks ?? []) {
    if (block.type === "image" && block.image) sink.push({ image: block.image, role: "block" });
    if (block.type === "image-gallery") {
      for (const image of block.images ?? []) {
        if (image) sink.push({ image, role: "block" });
      }
    }
  }
}

/**
 * Every NormalizedImage node in the manifest, by reference (mutated in
 * place once localized), tagged with how it's used: a full-viewport
 * `background` (cover, title band, immersive view) or an inline `block`.
 */
function collectImages(manifest) {
  const images = [];
  for (const section of manifest.sections) {
    if (section.background?.type === "image" && section.background.image) {
      images.push({ image: section.background.image, role: "background" });
    }
    if (section.kind === "sequence") {
      collectImagesFromBlocks(section.blocks, images);
    }
    if (section.kind === "credits") {
      for (const panel of section.panels) {
        if (panel.type === "blocks") collectImagesFromBlocks(panel.blocks, images);
      }
    }
    if (section.kind === "immersive") {
      for (const view of section.views) {
        if (view.background?.type === "image" && view.background.image) {
          images.push({ image: view.background.image, role: "background" });
        }
        for (const panel of view.panels) {
          collectImagesFromBlocks(panel.blocks, images);
        }
      }
    }
  }
  return images;
}

/** Every webmap background node in the manifest, by reference. */
function collectWebmapBackgrounds(manifest) {
  const backgrounds = [];
  for (const section of manifest.sections) {
    if (section.kind !== "immersive") continue;
    for (const view of section.views) {
      if (view.background?.type === "webmap") backgrounds.push(view.background);
    }
  }
  return backgrounds;
}

/**
 * Every piece of author-visible text in the manifest, concatenated, for the
 * vendored-font glyph-coverage check. HTML markup is left in rather than
 * stripped — every character HTML syntax itself can use is already inside
 * the vendored fonts' Latin subset, so it can't produce a false positive.
 */
function collectStoryText(manifest) {
  const parts = [manifest.meta.title, manifest.meta.snippet, manifest.meta.description, manifest.meta.credit];
  const pushBlocks = (blocks) => {
    for (const block of blocks ?? []) {
      if (block.type === "text") parts.push(block.html);
      if (block.type === "image") parts.push(block.image?.caption);
      if (block.type === "image-gallery") {
        parts.push(block.caption);
        for (const image of block.images ?? []) parts.push(image?.caption);
      }
    }
  };

  for (const section of manifest.sections) {
    parts.push(section.title, section.subtitle, section.credits);
    if (section.background?.image) parts.push(section.background.image.caption);
    if (section.kind === "sequence") pushBlocks(section.blocks);
    if (section.kind === "credits") {
      for (const panel of section.panels ?? []) {
        if (panel.type === "blocks") pushBlocks(panel.blocks);
      }
    }
    if (section.kind === "immersive") {
      for (const view of section.views ?? []) {
        parts.push(view.title?.value);
        if (view.background?.image) parts.push(view.background.image.caption);
        for (const panel of view.panels ?? []) pushBlocks(panel.blocks);
      }
    }
  }

  return parts.filter(Boolean).join("\n");
}

/**
 * Download one URL into assets/images (once per distinct URL per run) and
 * return its output-relative path. Throws on failure; callers decide how
 * much of the manifest one failed download should degrade.
 */
async function downloadImageFile(url, source, { appid, portalHost, outputDir, cache }) {
  const cached = cache.get(url);
  if (cached) return cached;

  const { data, sourceName } = await fetchAssetBytes({ url, source, appid, portalHost });
  const filename = localAssetFilename(sourceName, url);
  const relPath = `${IMAGES_DIR}/${filename}`;
  await mkdir(path.join(outputDir, IMAGES_DIR), { recursive: true });
  await writeFile(path.join(outputDir, IMAGES_DIR, filename), data);

  cache.set(url, relPath);
  return relPath;
}

/**
 * Localize one image node in place. `image.url` is always fetched. For a
 * `background` image that lists responsive `sizes[]` (Unsplash/Flickr
 * sources — the default `url` is typically only 1024px wide), the largest
 * variant is fetched too and becomes the primary `url`, mirroring the
 * original viewer's pick of the smallest variant ≥ viewport width on a
 * large screen. `sizes` is rewritten to the localized variants actually on
 * disk (largest first) so the renderer can emit a `srcset`; remote-only
 * variants are never left in the manifest.
 */
async function localizeImage(image, role, { appid, portalHost, outputDir, cache, warn }) {
  if (!image?.url) return;

  const originalUrl = image.url;
  const original = { width: image.width, height: image.height };
  const largest = role === "background" ? (image.sizes?.[0] ?? null) : null;
  const wantsLargest = largest && largest.url !== originalUrl;

  let localOriginal;
  try {
    localOriginal = await downloadImageFile(originalUrl, image.source, { appid, portalHost, outputDir, cache });
  } catch (err) {
    warn(`image:${originalUrl}`, `Failed to download image: ${err.message}`);
    return;
  }

  let localLargest = null;
  if (wantsLargest) {
    try {
      // sizes[] variants are always external CDN URLs (item resources never
      // list sizes), so they go through the external-download path.
      localLargest = await downloadImageFile(largest.url, "external", { appid, portalHost, outputDir, cache });
    } catch (err) {
      // Degrade to the default-size image rather than failing the section.
      warn(`image:${largest.url}`, `Failed to download largest variant (using default size): ${err.message}`);
    }
  }

  const variants = [];
  if (localLargest) {
    variants.push({ url: localLargest, width: largest.width, height: largest.height, longestSide: largest.longestSide });
  }
  variants.push({
    url: localOriginal,
    width: original.width,
    height: original.height,
    longestSide: original.width || original.height ? Math.max(original.width ?? 0, original.height ?? 0) : null,
  });

  const primary = variants[0];
  image.url = primary.url;
  image.thumbUrl = localOriginal;
  image.width = primary.width;
  image.height = primary.height;
  image.sizes = variants.length > 1 ? variants : [];
  delete image.source;
}

/** Download the header logo if the author enabled one from an external URL. */
async function localizeHeaderLogo(header, ctx) {
  const logo = header?.logo;
  if (!logo?.enabled || !logo.url) return;
  if (logo.builtin) {
    // The Cascade app's own bundled Esri logo — not a story asset, and not
    // something the archive should impersonate. Leave the record, drop the URL.
    logo.url = null;
    return;
  }
  try {
    logo.url = await downloadImageFile(logo.url, "external", ctx);
  } catch (err) {
    ctx.warn(`header:logo:${logo.url}`, `Failed to download header logo: ${err.message}`);
    logo.url = null;
  }
}

/**
 * Convert an inline Feature Collection's raw Esri JSON features to GeoJSON.
 * Unlike a live query (which the ArcGIS REST API reprojects to WGS84 for us
 * when `f=geojson` is requested), these features carry whatever spatial
 * reference they were authored in and need reprojecting ourselves.
 */
function convertFeatureCollectionLayer(layer, warn, warnPath) {
  const unhandledWkids = new Set();

  const features = (layer.features ?? []).map((feature) => {
    const wkid = feature.geometry?.spatialReference?.wkid ?? null;
    // Strip spatialReference before conversion: arcgisToGeoJSON only reads
    // it to console.warn once per feature ("non-standard crs") — we handle
    // reprojection ourselves below, so that warning would just be noise
    // (and, at scale, a real slowdown).
    const featureForConversion = feature.geometry
      ? { ...feature, geometry: { ...feature.geometry, spatialReference: undefined } }
      : feature;
    const geojsonFeature = arcgisToGeoJSON(featureForConversion);

    if (isWebMercatorWkid(wkid)) {
      geojsonFeature.geometry = reprojectWebMercatorGeometry(geojsonFeature.geometry);
    } else if (wkid && wkid !== 4326) {
      unhandledWkids.add(wkid);
    }
    return geojsonFeature;
  });

  if (unhandledWkids.size > 0) {
    warn(
      warnPath,
      `Inline features use unsupported spatial reference wkid(s) [${[...unhandledWkids].join(", ")}] ` +
        "— coordinates were not reprojected and are likely wrong",
    );
  }

  return {
    meta: { geometryType: layer.geometryType ?? null, fields: layer.fields ?? null },
    geojson: { type: "FeatureCollection", features },
  };
}

/**
 * Fetch/convert one webmap item's operational layers into GeoJSON snapshots
 * on disk, once per webmapId (multiple sections/views can reference the
 * same webmap with different per-view layer visibility).
 */
async function localizeWebmap(webmapId, { portalHost, outputDir, warn }) {
  console.log(`  webmap ${webmapId}...`);

  let layers, baseMap, initialExtent;
  try {
    ({ layers, baseMap, initialExtent } = await getWebmapLayers(webmapId, { portalHost }));
  } catch (err) {
    // The story item can still be public even if a webmap it references has
    // since been deleted or made private — don't let that take down the
    // whole migration, just this one map section.
    warn(`webmap:${webmapId}`, `Failed to fetch webmap: ${err.message}`);
    return { baseMap: null, layers: [], initialExtent: null, unavailable: true };
  }

  const basemapLayers = baseMap?.baseMapLayers ?? [];
  if (basemapLayers.length > 0 && !basemapLayers.some((l) => l.layerType === "ArcGISTiledMapServiceLayer" && l.url)) {
    // e.g. an Esri vector-tile basemap: the vendored map library renders
    // raster tiles only, so the site falls back to Esri's raster Light Gray
    // Canvas (src/render/background.js) — the data still shows, the
    // cartography underneath it differs from the original.
    warn(
      `webmap:${webmapId}:basemap`,
      `Basemap "${baseMap.title ?? basemapLayers.map((l) => l.layerType).join("/")}" has no raster tile layer ` +
        "(vector tiles aren't supported) — the archived map uses Esri's raster Light/Dark Gray Canvas instead",
    );
  }

  const dir = path.join(outputDir, DATA_DIR, webmapId);
  await mkdir(dir, { recursive: true });

  const resolvedLayers = [];
  for (const [index, layer] of layers.entries()) {
    console.log(`    layer ${index} (${layer.kind}): ${layer.title ?? layer.id ?? "untitled"}`);
    if (layer.kind === "unknown") {
      warn(
        `webmap:${webmapId}:layer:${index}`,
        `Unsupported operational layer type for "${layer.title ?? layer.id ?? index}" — skipped`,
      );
      resolvedLayers.push({
        id: layer.id,
        title: layer.title,
        kind: "unknown",
        visible: layer.visibility,
      });
      continue;
    }

    let result;
    try {
      result =
        layer.kind === "feature-collection"
          ? convertFeatureCollectionLayer(layer, warn, `webmap:${webmapId}:layer:${index}`)
          : await queryFeatureLayerAsGeoJson(layer.url, { portalHost });
    } catch (err) {
      // e.g. a Living Atlas / subscriber-only layer that requires a token
      // the story's own public item doesn't grant. Skip just this layer
      // rather than aborting the whole migration.
      warn(
        `webmap:${webmapId}:layer:${index}`,
        `Failed to fetch layer "${layer.title ?? layer.id ?? index}": ${err.message}`,
      );
      resolvedLayers.push({
        id: layer.id,
        title: layer.title,
        kind: layer.kind,
        visible: layer.visibility,
      });
      continue;
    }

    const filename = `${index}.geojson`;
    await writeFile(path.join(dir, filename), JSON.stringify(result));
    resolvedLayers.push({
      id: layer.id,
      title: layer.title,
      kind: layer.kind,
      visible: layer.visibility,
      dataFile: `${DATA_DIR}/${webmapId}/${filename}`,
    });
  }

  return { baseMap, layers: resolvedLayers, initialExtent, unavailable: false };
}

async function localizeWebmapBackground(background, { portalHost, outputDir, webmapCache, warn }) {
  const { webmapId } = background;
  if (!webmapId) {
    warn("webmap", "Immersive webmap background is missing a webmapId");
    return;
  }

  if (!webmapCache.has(webmapId)) {
    webmapCache.set(webmapId, localizeWebmap(webmapId, { portalHost, outputDir, warn }));
  }
  const { baseMap, layers, initialExtent, unavailable } = await webmapCache.get(webmapId);

  const overridesById = new Map((background.layerOverrides ?? []).map((o) => [o.id, o.visibility]));
  background.baseMap = baseMap;
  background.initialExtent = initialExtent ?? null;
  background.unavailable = unavailable;
  background.layers = layers.map((layer) => ({
    ...layer,
    visible: overridesById.has(layer.id) ? overridesById.get(layer.id) : layer.visible,
  }));
  delete background.layerOverrides;
}

/**
 * Download every image the manifest references and snapshot every webmap's
 * operational layers to local GeoJSON, rewriting the manifest in place to
 * point at the resulting local paths. Vendors Leaflet into the output
 * folder only if the story actually has a map section.
 */
export async function localizeAssets(manifest, { appid, portalHost, outputDir }) {
  const warnings = [];
  const warn = (path_, message) => warnings.push({ path: path_, message });

  const imageCache = new Map();
  const imageCtx = { appid, portalHost, outputDir, cache: imageCache, warn };
  for (const { image, role } of collectImages(manifest)) {
    await localizeImage(image, role, imageCtx);
  }
  await localizeHeaderLogo(manifest.meta?.header, imageCtx);

  const webmapBackgrounds = collectWebmapBackgrounds(manifest);
  const webmapCache = new Map();
  for (const background of webmapBackgrounds) {
    await localizeWebmapBackground(background, { portalHost, outputDir, webmapCache, warn });
  }

  if (webmapBackgrounds.length > 0) {
    await vendorLeaflet(outputDir);
  }

  manifest.meta.vendoredFonts = await vendorFonts(outputDir, manifest.meta.theme);
  for (const family of unvendorableFontFamilies(manifest.meta.theme)) {
    warn(
      "fonts",
      `Theme uses an unrecognized font family "${family}" — none of the 3 reference stories use anything ` +
        "besides Open Sans, Noto Serif, Georgia, or Arial, so it will render in a browser fallback font instead.",
    );
  }
  if (manifest.meta.vendoredFonts.length > 0 && hasUnsupportedGlyphs(collectStoryText(manifest))) {
    warn(
      "fonts",
      "This story's text includes characters outside the vendored fonts' Latin subset (e.g. Polish/Czech/Turkish " +
        "letters, Greek, Cyrillic, Vietnamese tone marks) — those characters will render in a fallback system font.",
    );
  }

  return { manifest, warnings };
}
