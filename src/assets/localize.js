import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { arcgisToGeoJSON } from "@esri/arcgis-to-geojson-utils";
import { fetchAssetBytes, localAssetFilename } from "./download.js";
import { vendorLeaflet } from "./vendor.js";
import { isWebMercatorWkid, reprojectWebMercatorGeometry } from "./geometry.js";
import { getWebmapLayers, queryFeatureLayerAsGeoJson } from "../fetch/webmap.js";

const IMAGES_DIR = "assets/images";
const DATA_DIR = "assets/data";

function collectImagesFromBlocks(blocks, sink) {
  for (const block of blocks ?? []) {
    if (block.type === "image" && block.image) sink.push(block.image);
    if (block.type === "image-gallery") {
      for (const image of block.images ?? []) {
        if (image) sink.push(image);
      }
    }
  }
}

/** Every NormalizedImage node in the manifest, by reference (mutated in place once localized). */
function collectImages(manifest) {
  const images = [];
  for (const section of manifest.sections) {
    if (section.background?.type === "image" && section.background.image) {
      images.push(section.background.image);
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
          images.push(view.background.image);
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

async function localizeImage(image, { appid, portalHost, outputDir, cache, warn }) {
  if (!image?.url) return;

  const cached = cache.get(image.url);
  if (cached) {
    image.url = cached;
    image.thumbUrl = cached;
    delete image.source;
    return;
  }

  try {
    const { data, sourceName } = await fetchAssetBytes({
      url: image.url,
      source: image.source,
      appid,
      portalHost,
    });
    const filename = localAssetFilename(sourceName, image.url);
    const relPath = `${IMAGES_DIR}/${filename}`;
    await mkdir(path.join(outputDir, IMAGES_DIR), { recursive: true });
    await writeFile(path.join(outputDir, IMAGES_DIR, filename), data);

    cache.set(image.url, relPath);
    image.url = relPath;
    image.thumbUrl = relPath;
    delete image.source;
  } catch (err) {
    warn(`image:${image.url}`, `Failed to download image: ${err.message}`);
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

  let layers, baseMap;
  try {
    ({ layers, baseMap } = await getWebmapLayers(webmapId, { portalHost }));
  } catch (err) {
    // The story item can still be public even if a webmap it references has
    // since been deleted or made private — don't let that take down the
    // whole migration, just this one map section.
    warn(`webmap:${webmapId}`, `Failed to fetch webmap: ${err.message}`);
    return { baseMap: null, layers: [], unavailable: true };
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

  return { baseMap, layers: resolvedLayers, unavailable: false };
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
  const { baseMap, layers, unavailable } = await webmapCache.get(webmapId);

  const overridesById = new Map((background.layerOverrides ?? []).map((o) => [o.id, o.visibility]));
  background.baseMap = baseMap;
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
  for (const image of collectImages(manifest)) {
    await localizeImage(image, { appid, portalHost, outputDir, cache: imageCache, warn });
  }

  const webmapBackgrounds = collectWebmapBackgrounds(manifest);
  const webmapCache = new Map();
  for (const background of webmapBackgrounds) {
    await localizeWebmapBackground(background, { portalHost, outputDir, webmapCache, warn });
  }

  if (webmapBackgrounds.length > 0) {
    await vendorLeaflet(outputDir);
  }

  return { manifest, warnings };
}
