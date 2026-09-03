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

/**
 * The author's crop/placement choice for an image used as a background
 * (cover, title band, immersive view). Cascade's viewer reads:
 *   { type: "fill", fill: { x, y } }   focal point as 0..1 ratios, with
 *                                       background-size: cover
 *   { type: "fit",  fit: { color } }    background-size: contain, letterboxed
 *                                       with a builder-sampled edge color
 * See docs/polish.md §1.6. Anything else is kept verbatim and flagged so the
 * renderer can fall back to a centered cover crop without losing the data.
 */
function normalizePlacement(placement, ctx, path) {
  if (!placement || typeof placement !== "object") return null;

  switch (placement.type) {
    case "fill": {
      const x = Number(placement.fill?.x);
      const y = Number(placement.fill?.y);
      return {
        type: "fill",
        fill: {
          x: Number.isFinite(x) ? x : 0.5,
          y: Number.isFinite(y) ? y : 0.5,
        },
      };
    }
    case "fit":
      return { type: "fit", fit: { color: placement.fit?.color ?? null } };
    default:
      ctx.warn(path, `Unknown image placement type "${placement.type}"`, placement);
      return { type: "unknown", sourceType: placement.type ?? null, raw: placement };
  }
}

/**
 * Responsive variants of an external image (Unsplash/Flickr sources list
 * these; uploaded item resources never do). Sorted largest first, matching
 * Cascade's `sortSizeUrls` (longestSide desc, then the shorter side desc),
 * so `sizes[0]` is always the best candidate for a full-viewport background.
 */
function normalizeSizes(sizes) {
  if (!Array.isArray(sizes)) return [];
  return sizes
    .filter((size) => size && typeof size.url === "string")
    .map((size) => {
      const width = size.width ?? null;
      const height = size.height ?? null;
      const longestSide = size.longestSide ?? (width || height ? Math.max(width ?? 0, height ?? 0) : null);
      return { url: size.url, width, height, longestSide };
    })
    .sort((a, b) => {
      if (a.longestSide && b.longestSide && a.longestSide !== b.longestSide) {
        return b.longestSide - a.longestSide;
      }
      return Math.min(b.width ?? 0, b.height ?? 0) - Math.min(a.width ?? 0, a.height ?? 0);
    });
}

export function normalizeImage(image, ctx, path) {
  if (!image || typeof image !== "object") {
    ctx.warn(path, "Missing or invalid image object", image);
    return null;
  }

  const options = image.options ?? {};

  return {
    url: image.url ?? null,
    thumbUrl: image.thumbUrl ?? null,
    width: image.width ?? null,
    height: image.height ?? null,
    caption: image.caption ?? "",
    source: classifyImageSource(image.url, ctx.appid),
    options: {
      // Block images: small/medium/large column width (default medium in
      // the viewer). Background images also carry "size" but it's unused
      // there — kept regardless since it's cheap and lossless.
      size: options.size ?? null,
      // Block images: cap the rendered height to the viewport.
      fitHeight: Boolean(options.fitHeight),
      placement: normalizePlacement(options.placement, ctx, `${path}.options.placement`),
      // Rare override of the horizontal crop position on phones.
      mobilePos: image["mobile-pos"] ?? null,
    },
    sizes: normalizeSizes(image.sizes),
  };
}
