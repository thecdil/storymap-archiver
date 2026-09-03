import { fetchArcGisJson } from "./portal.js";
import { getItem, getItemData } from "./item.js";

const DEFAULT_PAGE_SIZE = 1000;
// A safety cap on how many features a single archived layer will hold.
// Some webmaps reference large *nationwide* reference layers (e.g. every
// US census block group, ~220k features) purely for rendering context —
// snapshotting the whole thing would make the archive impractically large
// and could hang the migration for a long time. Layers over this cap are
// skipped with a warning rather than downloaded (see docs/todo.md, Known
// limitations) — this is a real tradeoff, not a bug workaround.
const MAX_FEATURES_PER_LAYER = 5000;

function normalizeBaseMap(baseMap) {
  if (!baseMap) return null;
  return {
    title: baseMap.title ?? null,
    baseMapLayers: (baseMap.baseMapLayers ?? []).map((layer) => ({
      title: layer.title ?? null,
      layerType: layer.layerType ?? layer.type ?? null,
      url: layer.url ?? layer.templateUrl ?? layer.styleUrl ?? null,
    })),
  };
}

/** Feature Collections can carry their inline features in a couple of shapes. */
function extractInlineFeatureSet(layer) {
  const candidates = [layer.featureCollection?.layers?.[0]?.featureSet, layer.featureSet];
  for (const candidate of candidates) {
    if (candidate?.features) return candidate;
  }
  return null;
}

function classifyOperationalLayer(layer) {
  const base = {
    id: layer.id ?? null,
    title: layer.title ?? layer.name ?? null,
    visibility: layer.visibility ?? true,
    opacity: layer.opacity ?? 1,
  };

  const inlineFeatureSet = extractInlineFeatureSet(layer);
  if (inlineFeatureSet) {
    return {
      ...base,
      kind: "feature-collection",
      geometryType: inlineFeatureSet.geometryType ?? null,
      fields: inlineFeatureSet.fields ?? null,
      features: inlineFeatureSet.features,
    };
  }

  if (layer.url) {
    return {
      ...base,
      kind: "feature-service",
      layerType: layer.layerType ?? layer.type ?? null,
      url: layer.url,
      layerDefinition: layer.layerDefinition ?? null,
    };
  }

  // Group layers and other shapes not seen in the 3 example stories yet.
  // Surface as "unknown" (with the raw definition attached) rather than
  // silently dropping the layer — see docs/todo.md, "avoid loss of data".
  return {
    ...base,
    kind: "unknown",
    raw: layer,
  };
}

/**
 * The webmap's saved extent as `[[xmin, ymin], [xmax, ymax]]` in WGS84
 * lon/lat. Webmap JSON itself carries no extent; the *item* record does,
 * and that is what the Cascade viewer framed each map with on load.
 */
function normalizeItemExtent(extent) {
  if (!Array.isArray(extent) || extent.length !== 2) return null;
  const [[xmin, ymin], [xmax, ymax]] = extent.map((pair) => (Array.isArray(pair) ? pair : [NaN, NaN]));
  if (![xmin, ymin, xmax, ymax].every(Number.isFinite)) return null;
  return [
    [xmin, ymin],
    [xmax, ymax],
  ];
}

/** Fetch a Web Map item's operational layers + basemap + saved extent, normalized for downstream use. */
export async function getWebmapLayers(webmapItemId, { portalHost, useCache = true } = {}) {
  const [item, webmap] = await Promise.all([
    getItem(webmapItemId, { portalHost, useCache }),
    getItemData(webmapItemId, { portalHost, useCache }),
  ]);
  return {
    initialExtent: normalizeItemExtent(item?.extent),
    baseMap: normalizeBaseMap(webmap.baseMap),
    layers: (webmap.operationalLayers ?? []).map(classifyOperationalLayer),
  };
}

/**
 * Query every feature from a live FeatureServer/MapServer layer and return it
 * as a single GeoJSON FeatureCollection, paginating on the service's own
 * maxRecordCount so partial results are never mistaken for the full layer.
 */
export async function queryFeatureLayerAsGeoJson(layerUrl, options) {
  const meta = await fetchArcGisJson(`${layerUrl}?f=json`, options);
  const pageSize =
    Number.isInteger(meta.maxRecordCount) && meta.maxRecordCount > 0
      ? meta.maxRecordCount
      : DEFAULT_PAGE_SIZE;

  const countResult = await fetchArcGisJson(
    `${layerUrl}/query?where=1%3D1&returnCountOnly=true&f=json`,
    options,
  );
  if (Number.isInteger(countResult.count) && countResult.count > MAX_FEATURES_PER_LAYER) {
    throw new Error(
      `Layer has ${countResult.count} features, over the ${MAX_FEATURES_PER_LAYER}-feature ` +
        "safety cap for a single archived layer (likely a large reference dataset) — skipped",
    );
  }

  const features = [];
  let offset = 0;

  for (;;) {
    const queryUrl =
      `${layerUrl}/query?where=1%3D1&outFields=*&f=geojson` +
      `&resultRecordCount=${pageSize}&resultOffset=${offset}`;
    const page = await fetchArcGisJson(queryUrl, options);
    const pageFeatures = page.features ?? [];
    features.push(...pageFeatures);
    if (pageFeatures.length < pageSize) break;
    offset += pageSize;
  }

  return {
    meta: {
      name: meta.name ?? null,
      geometryType: meta.geometryType ?? null,
      fields: meta.fields ?? null,
      drawingInfo: meta.drawingInfo ?? null,
    },
    geojson: { type: "FeatureCollection", features },
  };
}
