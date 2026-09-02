import { fetchArcGisJson, fetchBinary, sharingRestBase } from "./portal.js";
import {
  readJsonCache,
  writeJsonCache,
  readBinaryCache,
  writeBinaryCache,
} from "../cache/store.js";

const RESOURCES_PAGE_SIZE = 100;

/** Item info: title, description, credit, license, access, thumbnail, etc. */
export async function getItem(appid, { portalHost, useCache = true } = {}) {
  if (useCache) {
    const cached = await readJsonCache(appid, "item");
    if (cached) return cached;
  }

  const url = `${sharingRestBase(portalHost)}/content/items/${appid}?f=json`;
  const item = await fetchArcGisJson(url);

  if (item.access !== "public") {
    throw new Error(
      `Item ${appid} has access="${item.access}"; only public items are supported.`,
    );
  }

  await writeJsonCache(appid, "item", item);
  return item;
}

/** The story's `values` payload (sections, theme, template info). */
export async function getItemData(appid, { portalHost, useCache = true } = {}) {
  if (useCache) {
    const cached = await readJsonCache(appid, "data");
    if (cached) return cached;
  }

  const url = `${sharingRestBase(portalHost)}/content/items/${appid}/data?f=json`;
  const data = await fetchArcGisJson(url);

  await writeJsonCache(appid, "data", data);
  return data;
}

/** Every file attached directly to the item (uploaded images, thumbnails), paginated. */
export async function listItemResources(appid, { portalHost, useCache = true } = {}) {
  if (useCache) {
    const cached = await readJsonCache(appid, "resources");
    if (cached) return cached;
  }

  const base = sharingRestBase(portalHost);
  const resources = [];
  let start = 1;

  for (;;) {
    const url = `${base}/content/items/${appid}/resources?f=json&num=${RESOURCES_PAGE_SIZE}&start=${start}`;
    const page = await fetchArcGisJson(url);
    resources.push(...(page.resources ?? []));
    if (!page.nextStart || page.nextStart === -1) break;
    start = page.nextStart;
  }

  await writeJsonCache(appid, "resources", resources);
  return resources;
}

/** Download one item-attached resource file as a Buffer. */
export async function getItemResource(appid, filename, { portalHost, useCache = true } = {}) {
  const cacheKey = `resources/${filename}`;

  if (useCache) {
    const cached = await readBinaryCache(appid, cacheKey);
    if (cached) return cached;
  }

  const encodedPath = filename.split("/").map(encodeURIComponent).join("/");
  const url = `${sharingRestBase(portalHost)}/content/items/${appid}/resources/${encodedPath}`;
  const data = await fetchBinary(url);

  await writeBinaryCache(appid, cacheKey, data);
  return data;
}
