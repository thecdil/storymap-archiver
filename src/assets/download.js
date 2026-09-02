import { createHash } from "node:crypto";
import path from "node:path";
import { fetchBinary } from "../fetch/portal.js";
import { getItemResource } from "../fetch/item.js";
import { readBinaryCache, writeBinaryCache } from "../cache/store.js";

function shortHash(input) {
  return createHash("sha1").update(input).digest("hex").slice(0, 8);
}

function filenameFromUrl(url) {
  try {
    const { pathname } = new URL(url);
    return decodeURIComponent(path.basename(pathname)) || "asset";
  } catch {
    return "asset";
  }
}

function extractResourceFilename(url, appid) {
  const marker = `/content/items/${appid}/resources/`;
  const index = url.indexOf(marker);
  if (index === -1) {
    throw new Error(`Expected an item-resource URL for ${appid}, got: ${url}`);
  }
  return decodeURIComponent(url.slice(index + marker.length));
}

/**
 * Fetch the bytes for one manifest-referenced image, using the resumable
 * on-disk cache either way: item-resource downloads go through the same
 * cache as Phase 2's item-resource listing, external URLs get their own
 * cache entry keyed by a hash of the URL.
 */
export async function fetchAssetBytes({ url, source, appid, portalHost }) {
  if (source === "item-resource") {
    const filename = extractResourceFilename(url, appid);
    const data = await getItemResource(appid, filename, { portalHost });
    return { data, sourceName: filename };
  }

  const cacheKey = `external/${shortHash(url)}`;
  const cached = await readBinaryCache(appid, cacheKey);
  if (cached) {
    return { data: cached, sourceName: filenameFromUrl(url) };
  }

  const data = await fetchBinary(url);
  await writeBinaryCache(appid, cacheKey, data);
  return { data, sourceName: filenameFromUrl(url) };
}

/** A stable, collision-free output filename for an asset, derived from its source name and URL. */
export function localAssetFilename(sourceName, url) {
  const ext = path.extname(sourceName);
  const base = sourceName
    .slice(0, sourceName.length - ext.length)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "asset"}-${shortHash(url)}${ext}`;
}
