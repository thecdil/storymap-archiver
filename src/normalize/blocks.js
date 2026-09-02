import { normalizeImage } from "./image.js";

export function normalizeBlock(block, ctx, path) {
  switch (block?.type) {
    case "text":
      return { type: "text", html: block.text?.value ?? "" };

    case "image":
      return { type: "image", image: normalizeImage(block.image, ctx, `${path}.image`) };

    case "image-gallery": {
      const gallery = block["image-gallery"] ?? {};
      return {
        type: "image-gallery",
        caption: gallery.caption ?? "",
        images: (gallery.images ?? []).map((image, i) =>
          normalizeImage(image, ctx, `${path}.image-gallery.images[${i}]`),
        ),
      };
    }

    default:
      // Only "text", "image", and "image-gallery" have been observed across
      // the 3 reference stories. Never drop an unrecognized block silently —
      // keep the raw payload so it can be rendered as a fallback later, and
      // surface a warning so real-world coverage gaps get noticed.
      ctx.warn(path, `Unknown block type "${block?.type}"`, block);
      return { type: "unknown", sourceType: block?.type ?? null, raw: block };
  }
}

export function normalizeBlocks(blocks, ctx, path) {
  return (blocks ?? []).map((block, i) => normalizeBlock(block, ctx, `${path}[${i}]`));
}
