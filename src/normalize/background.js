import { normalizeImage } from "./image.js";

export function normalizeBackground(background, ctx, path) {
  if (!background) return null;

  switch (background.type) {
    case "color":
      return { type: "color", value: background.color?.value ?? null };

    case "image":
      return { type: "image", image: normalizeImage(background.image, ctx, `${path}.image`) };

    case "webmap": {
      const webmap = background.webmap ?? {};
      return {
        type: "webmap",
        // The webmap's own operational layers/features are fetched separately
        // (src/fetch/webmap.js), keyed by this id, and shared across every
        // section that references the same webmap.
        webmapId: webmap.id ?? null,
        interactionEnabled: webmap.options?.interaction === "enabled",
        extras: {
          locate: Boolean(webmap.extras?.locate?.enabled),
          search: Boolean(webmap.extras?.search?.enabled),
          legend: Boolean(webmap.extras?.legend?.enabled),
        },
        // Per-view visibility overrides for specific layers within the webmap.
        layerOverrides: Array.isArray(webmap.layers) ? webmap.layers : [],
        // Optional per-view extent (Esri JSON envelope) and popup config the
        // viewer applies on view change. Absent in every reference story but
        // read by the original viewer, so pass them through untouched.
        extent: webmap.extent ?? null,
        popup: webmap.popup ?? null,
      };
    }

    default:
      // Only "color", "image", and "webmap" have been observed across the 3
      // reference stories. See docs/todo.md — never drop unrecognized
      // content silently.
      ctx.warn(path, `Unknown background type "${background.type}"`, background);
      return { type: "unknown", sourceType: background.type ?? null, raw: background };
  }
}
