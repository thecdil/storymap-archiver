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

// Sniffed by magic bytes rather than trusted headers/URLs: some servers
// (e.g. some production hosts serving this archived output) refuse to serve
// extensionless files, and neither Unsplash/Flickr URLs nor some uploaded
// item-resource filenames reliably carry a real image extension.
const MAGIC_BYTE_EXTENSIONS = [
  { ext: ".png", test: (b) => b.length >= 8 && b.readUInt32BE(0) === 0x89504e47 },
  { ext: ".jpg", test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: ".gif", test: (b) => b.length >= 6 && /^GIF8[79]a$/.test(b.toString("latin1", 0, 6)) },
  {
    ext: ".webp",
    test: (b) => b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP",
  },
  { ext: ".bmp", test: (b) => b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d },
  {
    ext: ".tiff",
    test: (b) =>
      b.length >= 4 &&
      ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) ||
        (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)),
  },
  { ext: ".ico", test: (b) => b.length >= 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0 },
  { ext: ".svg", test: (b) => /^\s*(<\?xml|<svg)/i.test(b.toString("utf8", 0, Math.min(b.length, 256))) },
];

/** Detect an image's real extension from its file signature, or null if unrecognized. */
function detectImageExtension(data) {
  if (!Buffer.isBuffer(data)) return null;
  for (const { ext, test } of MAGIC_BYTE_EXTENSIONS) {
    if (test(data)) return ext;
  }
  return null;
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

/** A stable, collision-free output filename for an asset, derived from its source name and URL.
 *  Falls back to sniffing `data`'s file signature when `sourceName`/`url` carry no extension, so
 *  every file written to disk is servable on hosts that block extensionless files. */
export function localAssetFilename(sourceName, url, data) {
  const ext = path.extname(sourceName) || detectImageExtension(data) || "";
  const base = sourceName
    .slice(0, sourceName.length - path.extname(sourceName).length)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "asset"}-${shortHash(url)}${ext}`;
}
