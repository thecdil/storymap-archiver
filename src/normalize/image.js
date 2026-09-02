/**
 * Classify where an image actually lives: an asset uploaded to this same
 * story item (already listed via listItemResources, cacheable via
 * getItemResource) vs. some other external URL (Unsplash, Flickr, another
 * item...) that Phase 4 will need to download directly.
 */
function classifyImageSource(url, appid) {
  if (!url) return "external";
  return url.includes(`/content/items/${appid}/resources/`) ? "item-resource" : "external";
}

export function normalizeImage(image, ctx, path) {
  if (!image || typeof image !== "object") {
    ctx.warn(path, "Missing or invalid image object", image);
    return null;
  }

  return {
    url: image.url ?? null,
    thumbUrl: image.thumbUrl ?? null,
    width: image.width ?? null,
    height: image.height ?? null,
    caption: image.caption ?? "",
    source: classifyImageSource(image.url, ctx.appid),
  };
}
