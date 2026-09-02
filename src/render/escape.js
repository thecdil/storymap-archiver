const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape plain text for safe interpolation into HTML text nodes or quoted attributes. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
}

/**
 * A plain-text rendering of a pre-authored HTML fragment (e.g. an image
 * caption — Esri's captions are rich-text-editor output, the same trust
 * level as block text, not plain strings) — for use in `alt` text, where
 * markup and entities must not appear literally.
 */
export function htmlToPlainText(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}
