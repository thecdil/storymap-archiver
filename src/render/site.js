import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml } from "./escape.js";
import { renderSections } from "./sections.js";

const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");

function themeStyle(theme) {
  // Defensive: these values come from the story's own theme JSON (a
  // controlled Esri vocabulary), but this text lands inside a <style>
  // block, so guard against it ever containing a stray "</style>".
  const safe = (value) => String(value ?? "").replace(/<\//g, "<\\/");
  const titleFont = safe(theme?.fonts?.titleFont?.fontFamily);
  const bodyFont = safe(theme?.fonts?.bodyFont?.fontFamily);
  const bgMain = safe(theme?.colors?.bgMain);
  const textMain = safe(theme?.colors?.textMain);

  const declarations = [
    titleFont && `--story-title-font: ${titleFont};`,
    bodyFont && `--story-body-font: ${bodyFont};`,
    bgMain && `--story-bg-main: ${bgMain};`,
    textMain && `--story-text-main: ${textMain};`,
  ].filter(Boolean);

  return declarations.length ? `<style>:root{${declarations.join(" ")}}</style>` : "";
}

function renderNav(nav) {
  if (nav.length === 0) return "";
  const links = nav.map((item) => `<a href="#${item.id}">${escapeHtml(item.label)}</a>`).join("\n");
  return `<nav class="story-nav" aria-label="Story sections">${links}</nav>`;
}

function renderFooter(meta) {
  const sourceUrl = `https://${meta.sourcePortal}/home/item.html?id=${meta.sourceAppid}`;
  const parts = [];
  if (meta.credit) parts.push(`<p>${escapeHtml(meta.credit)}</p>`);
  if (meta.license) parts.push(`<div class="story-license">${meta.license}</div>`);
  parts.push(
    `<p class="story-provenance">Archived from an Esri Story Map Cascade project. ` +
      `<a href="${escapeHtml(sourceUrl)}">Original source item</a>.</p>`,
  );
  return `<footer class="story-footer">${parts.join("\n")}</footer>`;
}

function renderHead({ meta, site, base }) {
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

  return `<meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="robots" content="noindex, nofollow">
  ${ogTags}
  ${themeStyle(meta.theme)}
  <link rel="stylesheet" href="assets/css/site.css">`;
}

function hasMaps(manifest) {
  return manifest.sections.some(
    (section) => section.kind === "immersive" && section.views.some((view) => view.background?.type === "webmap"),
  );
}

function renderDocument(manifest, options) {
  const { html: sectionsHtml, nav } = renderSections(manifest.sections);
  const needsLeaflet = hasMaps(manifest);

  return `<!doctype html>
<html lang="en">
<head>
  ${renderHead({ meta: manifest.meta, site: options.site, base: options.base })}
  ${needsLeaflet ? '<link rel="stylesheet" href="assets/vendor/leaflet/leaflet.css">' : ""}
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  ${renderNav(nav)}
  <main id="main">
${sectionsHtml}
  </main>
  ${renderFooter(manifest.meta)}
  ${needsLeaflet ? '<script src="assets/vendor/leaflet/leaflet.js"></script>' : ""}
  <script src="assets/js/site.js"></script>
</body>
</html>
`;
}

/**
 * Render the manifest to a complete static site in outputDir: index.html,
 * the site's CSS/JS, and a default noindex robots.txt. Assumes Phase 4
 * (localizeAssets) has already run — this step does no network access, it
 * only reads the manifest already sitting in memory/disk.
 */
export async function renderSite(manifest, { outputDir, site = null, base = null }) {
  const html = renderDocument(manifest, { site, base });

  await mkdir(path.join(outputDir, "assets/css"), { recursive: true });
  await mkdir(path.join(outputDir, "assets/js"), { recursive: true });

  await writeFile(path.join(outputDir, "index.html"), html);
  await copyFile(path.join(ASSETS_DIR, "site.css"), path.join(outputDir, "assets/css/site.css"));
  await copyFile(path.join(ASSETS_DIR, "site.js"), path.join(outputDir, "assets/js/site.js"));
  await writeFile(path.join(outputDir, "robots.txt"), "User-agent: *\nDisallow: /\n");
}
