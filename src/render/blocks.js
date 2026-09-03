import { escapeHtml, htmlToPlainText } from "./escape.js";

const BLOCK_SIZES = ["small", "medium", "large"];

/** width < height, the same portrait test Cascade's block-media sizing uses. */
function isPortrait(image) {
  return Boolean(image.width && image.height && image.width < image.height);
}

// Esri's `caption` fields are rich-text-editor output (the same trust level
// as a "text" block's html), not plain strings — see docs/todo.md. Render
// them as trusted HTML for the visible figcaption, same as block text; only
// derive a plain-text version for the `alt` attribute, where markup/entities
// must not appear literally.
//
// `sized` applies Cascade's block-size-{small,medium,large} width (plus a
// narrower portrait variant) to a standalone image block; gallery images
// skip it and size uniformly via the grid instead, matching the original
// (a gallery's own images never carry a "size" option — see docs/polish.md).
function renderImage(image, { className = "block-image", sized = false, reveal = false } = {}) {
  if (!image?.url) return "";
  const captionHtml = image.caption || "";
  const alt = escapeHtml(htmlToPlainText(captionHtml));
  const classes = [className];
  if (sized) {
    const size = BLOCK_SIZES.includes(image.options?.size) ? image.options.size : "medium";
    classes.push(`block-size-${size}`);
    if (isPortrait(image)) classes.push("portrait");
  }
  const revealAttr = reveal ? ' data-reveal="image"' : "";
  return `<figure class="${classes.join(" ")}"${revealAttr}>
  <img src="${escapeHtml(image.url)}" alt="${alt}" loading="lazy" width="${image.width ?? ""}" height="${image.height ?? ""}">
  ${captionHtml ? `<figcaption>${captionHtml}</figcaption>` : ""}
</figure>`;
}

function renderImageGallery(block, { reveal = false } = {}) {
  const figures = (block.images ?? []).map((image) => renderImage(image, { className: "gallery-image" })).join("\n");
  const captionHtml = block.caption || "";
  // The gallery fades in as one unit, not image-by-image — matching
  // Cascade's per-`div.block` (not per-image) fade-in.
  const revealAttr = reveal ? ' data-reveal="gallery"' : "";
  return `<figure class="block-image-gallery"${revealAttr}>
  <div class="gallery-grid">
${figures}
  </div>
  ${captionHtml ? `<figcaption>${captionHtml}</figcaption>` : ""}
</figure>`;
}

function renderUnknown(block) {
  return `<div class="block-unsupported" role="note">
  <p>This story included a "${escapeHtml(block.sourceType ?? "unknown")}" content block that this migration tool doesn't understand yet. The original data is preserved below.</p>
  <pre>${escapeHtml(JSON.stringify(block.raw, null, 2))}</pre>
</div>`;
}

/**
 * Render one normalized content block to an HTML string.
 *
 * `block.html` (from a "text" block) is pre-authored HTML from the original
 * story, the same trust level as the rest of the story's own content — it is
 * emitted as-is, not escaped, matching how the original Cascade viewer
 * rendered it. Everything else interpolated here (captions, unknown-type
 * dumps) is escaped.
 *
 * `reveal` marks media blocks (never text) so the sequence's scroll-driven
 * fade-in (site.js) can pick them up via `data-reveal` — Cascade only ever
 * fades in its `div.block` media blocks, not the p/h/blockquote text blocks
 * that make up the rest of a sequence. Pass it only from a sequence
 * section; immersive/credits panels render the same blocks without it.
 */
export function renderBlock(block, { reveal = false } = {}) {
  switch (block?.type) {
    case "text":
      return block.html ? `<div class="block-text">${block.html}</div>` : "";
    case "image":
      return renderImage(block.image, { sized: true, reveal });
    case "image-gallery":
      return renderImageGallery(block, { reveal });
    default:
      return renderUnknown(block);
  }
}

export function renderBlocks(blocks, options) {
  return (blocks ?? []).map((block) => renderBlock(block, options)).join("\n");
}
