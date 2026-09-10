import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml } from "./escape.js";
import { renderSections } from "./sections.js";

const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");

// Cascade's own dark preset (THEME_COLOR_OPTIONS' "white-on-black-1") — used
// only as a fallback if a theme somehow sets themeMajor:"dark" without its
// own bgMain/textMain, which none of the 3 reference stories do (every
// preset, built-in or custom, has always carried both in practice). Every
// section that fills with the theme's background (sequence, credits, title
// band, immersive stage — see site.css) already reads `--bg-main`/
// `--text-main` directly, so a dark theme "just works" without a separate
// `.theme-major-dark` class the way Cascade's own CSS needed one.
const DARK_THEME_DEFAULTS = { bgMain: "#0E0E0E", textMain: "#DDD" };

function themeStyle(theme) {
  // Defensive: these values come from the story's own theme JSON (a
  // controlled Esri vocabulary), but this text lands inside a <style>
  // block, so guard against it ever containing a stray "</style>".
  const safe = (value) => String(value ?? "").replace(/<\//g, "<\\/");
  const isDark = theme?.colors?.themeMajor === "dark";
  const titleFont = safe(theme?.fonts?.titleFont?.fontFamily);
  const bodyFont = safe(theme?.fonts?.bodyFont?.fontFamily);
  const bgMain = safe(theme?.colors?.bgMain || (isDark ? DARK_THEME_DEFAULTS.bgMain : ""));
  const textMain = safe(theme?.colors?.textMain || (isDark ? DARK_THEME_DEFAULTS.textMain : ""));

  const declarations = [
    titleFont && `--story-title-font: ${titleFont};`,
    bodyFont && `--story-body-font: ${bodyFont};`,
    bgMain && `--story-bg-main: ${bgMain};`,
    textMain && `--story-text-main: ${textMain};`,
  ].filter(Boolean);

  return declarations.length ? `<style>:root{${declarations.join(" ")}}</style>` : "";
}

/**
 * Cascade's fixed 50px header: logo (if the author enabled one), story
 * title, the author's enabled bookmarks, and the optional tagline link.
 * Starts `compact` (transparent, title/bookmarks hidden) when the story
 * opens on a cover; site.js flips that once the reader scrolls past it.
 * The share button is deliberately not reproduced (see docs/polish.md).
 */
function renderHeader(meta, bookmarks, { hasCover }) {
  const header = meta.header ?? {};
  const title = escapeHtml(meta.title || "Untitled Story");

  const logo =
    header.logo?.enabled && header.logo.url
      ? `<div class="story-logo">${
          header.logo.link
            ? `<a href="${escapeHtml(header.logo.link)}"><img src="${escapeHtml(header.logo.url)}" alt="Logo"></a>`
            : `<img src="${escapeHtml(header.logo.url)}" alt="Logo">`
        }</div>`
      : "";

  const nav =
    bookmarks.length > 0
      ? `<nav class="story-bookmarks" aria-label="Story bookmarks">
      <ul>
${bookmarks.map((item) => `        <li><a href="#${item.id}">${escapeHtml(item.label)}</a></li>`).join("\n")}
      </ul>
    </nav>`
      : "";

  const link =
    header.link?.url && header.link.title
      ? `<div class="story-link"><a href="${escapeHtml(header.link.url)}">${escapeHtml(header.link.title)}</a></div>`
      : header.link?.title
        ? `<div class="story-link">${escapeHtml(header.link.title)}</div>`
        : "";

  return `<div class="story-progress" aria-hidden="true"><div class="story-progress-bar"></div></div>
  <header class="story-header${hasCover ? " compact" : ""}" data-has-cover="${hasCover}">
    <div class="story-brand">
      ${logo}
      <a class="story-title" href="#top">${title}</a>
    </div>
    ${nav}
    ${link}
  </header>`;
}

function renderFooter(meta) {
  const sourceUrl = `https://${meta.sourcePortal}/home/item.html?id=${meta.sourceAppid}`;
  const currentYear = new Date().getFullYear();
  const parts = [];
  if (meta.credit) parts.push(`<p>${escapeHtml(meta.credit)}</p>`);
  if (meta.license) parts.push(`<div class="story-license">${meta.license}</div>`);
  parts.push(
    `<p class="story-provenance">Archived from an Esri Story Map Cascade project using <a href="https://github.com/thecdil/storymap-archiver">storymap-archiver</a> in ${currentYear}.` +
      `<br><a href="${escapeHtml(sourceUrl)}">Original source item</a>.</p>`,
  );
  return `<footer class="story-footer">${parts.join("\n")}</footer>`;
}

function renderHead({ meta, site, base, noindex }) {
  const title = escapeHtml(meta.title || "Untitled Story");
  const description = escapeHtml(meta.snippet || "");
  const canonicalUrl = site ? `${site.replace(/\/+$/, "")}${base ? `/${base.replace(/^\/+|\/+$/g, "")}` : ""}/` : null;

  const ogTags = canonicalUrl
    ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">`
    : "";

  // Only present when localizeAssets actually vendored a webfont for this
  // story's theme (Georgia/Arial need no file; an unrecognized custom
  // font gets a migration warning instead — see src/assets/vendor.js).
  const fontsLink = meta.vendoredFonts?.length > 0 ? '<link rel="stylesheet" href="assets/fonts/fonts.css">' : "";

  return `<meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  ${noindex ? '<meta name="robots" content="noindex, nofollow">' : ""}
  ${ogTags}
  ${themeStyle(meta.theme)}
  ${fontsLink}
  <link rel="stylesheet" href="assets/css/site.css">`;
}

function hasMaps(manifest) {
  return manifest.sections.some(
    (section) => section.kind === "immersive" && section.views.some((view) => view.background?.type === "webmap"),
  );
}

export function renderDocument(manifest, options = {}) {
  const { html: sectionsHtml, bookmarks } = renderSections(manifest.sections);
  const needsLeaflet = hasMaps(manifest);
  const hasCover = manifest.sections[0]?.kind === "cover";

  return `<!doctype html>
<html lang="en">
<head>
  ${renderHead({ meta: manifest.meta, site: options.site, base: options.base, noindex: options.noindex })}
  ${needsLeaflet ? '<link rel="stylesheet" href="assets/vendor/leaflet/leaflet.css">' : ""}
</head>
<body id="top">
  <a class="skip-link" href="#main">Skip to content</a>
  ${renderHeader(manifest.meta, bookmarks, { hasCover })}
  <main id="main">
${sectionsHtml}
  </main>
  ${renderFooter(manifest.meta)}
  ${needsLeaflet ? '<script src="assets/vendor/leaflet/leaflet.js"></script>' : ""}
  <script src="assets/js/engine.js"></script>
  <script src="assets/js/site.js"></script>
</body>
</html>
`;
}

/**
 * Render the manifest to a complete static site in outputDir: index.html and
 * the site's CSS/JS. Assumes Phase 4 (localizeAssets) has already run — this
 * step does no network access, it only reads the manifest already sitting in
 * memory/disk. `noindex` is opt-in (off by default): most migrations land at
 * their own production URL and should be indexable like any other page.
 */
export async function renderSite(manifest, { outputDir, site = null, base = null, noindex = false }) {
  const html = renderDocument(manifest, { site, base, noindex });

  await mkdir(path.join(outputDir, "assets/css"), { recursive: true });
  await mkdir(path.join(outputDir, "assets/js"), { recursive: true });

  await writeFile(path.join(outputDir, "index.html"), html);
  await copyFile(path.join(ASSETS_DIR, "site.css"), path.join(outputDir, "assets/css/site.css"));
  await copyFile(path.join(ASSETS_DIR, "engine.js"), path.join(outputDir, "assets/js/engine.js"));
  await copyFile(path.join(ASSETS_DIR, "site.js"), path.join(outputDir, "assets/js/site.js"));
}
