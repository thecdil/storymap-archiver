import { escapeHtml, htmlToPlainText } from "./escape.js";

// Esri's `caption` fields are rich-text-editor output (the same trust level
// as a "text" block's html), not plain strings — see docs/todo.md. Render
// them as trusted HTML for the visible figcaption, same as block text; only
// derive a plain-text version for the `alt` attribute, where markup/entities
// must not appear literally.
function renderImage(image, { className = "block-image" } = {}) {
  if (!image?.url) return "";
  const captionHtml = image.caption || "";
  const alt = escapeHtml(htmlToPlainText(captionHtml));
  return `<figure class="${className}">
  <img src="${escapeHtml(image.url)}" alt="${alt}" loading="lazy" width="${image.width ?? ""}" height="${image.height ?? ""}">
  ${captionHtml ? `<figcaption>${captionHtml}</figcaption>` : ""}
</figure>`;
}

function renderImageGallery(block) {
  const figures = (block.images ?? [])
    .map((image) => renderImage(image, { className: "gallery-image" }))
    .join("\n");
  const captionHtml = block.caption || "";
  return `<figure class="block-image-gallery">
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
 */
export function renderBlock(block) {
  switch (block?.type) {
    case "text":
      return block.html ? `<div class="block-text">${block.html}</div>` : "";
    case "image":
      return renderImage(block.image);
    case "image-gallery":
      return renderImageGallery(block);
    default:
      return renderUnknown(block);
  }
}

export function renderBlocks(blocks) {
  return (blocks ?? []).map(renderBlock).join("\n");
}
