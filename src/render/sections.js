import { escapeHtml } from "./escape.js";
import { renderBlocks } from "./blocks.js";
import { renderBackground } from "./background.js";
import { slugify } from "../util/slug.js";

function uniqueId(text, used) {
  const base = slugify(text || "section");
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

function renderHero({ id, kind, title, subtitle, credits, background }) {
  const bg = renderBackground(background);
  return `<section id="${id}" class="hero hero-${kind}" style="${bg.style}">
  ${bg.html}
  <div class="hero-scrim"></div>
  <div class="hero-content">
    ${title ? `<h1 class="hero-title">${escapeHtml(title.trim())}</h1>` : ""}
    ${subtitle ? `<p class="hero-subtitle">${escapeHtml(subtitle.trim())}</p>` : ""}
    ${credits ? `<div class="hero-credits">${credits}</div>` : ""}
  </div>
  <div class="hero-scroll-cue" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M4 8l8 8 8-8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>
</section>`;
}

function renderCover(section, id) {
  return renderHero({ id, kind: "cover", title: section.title, subtitle: section.subtitle, background: section.background });
}

function renderTitle(section, id) {
  // section.credits is pre-authored HTML from the story (may be empty), not
  // escaped — same trust level as block text, see src/render/blocks.js.
  return renderHero({ id, kind: "title", title: section.title, credits: section.credits, background: section.background });
}

function renderSequence(section, id) {
  const bg = renderBackground(section.background);
  return `<section id="${id}" class="sequence" style="${bg.style}">
  ${bg.html}
  <div class="sequence-content">
    ${renderBlocks(section.blocks)}
  </div>
</section>`;
}

function renderImmersiveView(view, index) {
  const bg = renderBackground(view.background);
  const panels = (view.panels ?? [])
    .map((panel) => {
      const position = panel.position ? `position-${panel.position}` : "";
      const theme = panel.theme ? `theme-${panel.theme}` : "";
      return `<div class="immersive-panel ${position} ${theme}">
      ${renderBlocks(panel.blocks)}
    </div>`;
    })
    .join("\n");

  return `<div class="immersive-view" style="${bg.style}">
    <div class="immersive-bg">${bg.html}</div>
    <div class="immersive-panels">
      ${view.title?.value ? `<h2 class="immersive-title">${escapeHtml(view.title.value.trim())}</h2>` : ""}
      ${panels}
    </div>
  </div>`;
}

function renderImmersive(section, id) {
  const views = (section.views ?? []).map(renderImmersiveView).join("\n");
  return `<section id="${id}" class="immersive">
  ${views}
</section>`;
}

function renderCreditsPanel(panel) {
  if (panel.type === "blocks") return renderBlocks(panel.blocks);

  if (panel.type === "credits") {
    if (panel.credits.length === 0) return "";
    const items = panel.credits
      .map((entry) => {
        // The populated shape hasn't been observed in the reference stories
        // (see src/normalize/manifest.js) — render whatever recognizable
        // fields exist, and fall back to the raw JSON rather than dropping it.
        if (entry && typeof entry === "object" && (entry.name || entry.role)) {
          const name = entry.name ? escapeHtml(entry.name) : "";
          const role = entry.role ? escapeHtml(entry.role) : "";
          return `<li>${[name, role].filter(Boolean).join(" — ")}</li>`;
        }
        return `<li><pre>${escapeHtml(JSON.stringify(entry))}</pre></li>`;
      })
      .join("\n");
    return `<ul class="credits-list">${items}</ul>`;
  }

  return `<div class="block-unsupported" role="note">
  <p>This story included a "${escapeHtml(panel.sourceType ?? "unknown")}" credits panel that this migration tool doesn't understand yet.</p>
  <pre>${escapeHtml(JSON.stringify(panel.raw, null, 2))}</pre>
</div>`;
}

function renderCredits(section, id) {
  const bg = renderBackground(section.background);
  const panels = (section.panels ?? []).map(renderCreditsPanel).join("\n");
  return `<section id="${id}" class="credits" style="${bg.style}">
  ${bg.html}
  <div class="credits-content">
    ${panels}
  </div>
</section>`;
}

function renderUnknownSection(section, id) {
  return `<section id="${id}" class="section-unsupported" role="note">
  <p>This story included a "${escapeHtml(section.sourceType ?? "unknown")}" section that this migration tool doesn't understand yet. The original data is preserved below.</p>
  <pre>${escapeHtml(JSON.stringify(section.raw, null, 2))}</pre>
</section>`;
}

const SECTION_RENDERERS = {
  cover: renderCover,
  title: renderTitle,
  sequence: renderSequence,
  immersive: renderImmersive,
  credits: renderCredits,
};

/**
 * Render every section, returning both the concatenated HTML and a nav
 * outline (cover/title sections only — matching which sections Cascade
 * itself surfaced as "bookmarks").
 */
export function renderSections(sections) {
  const usedIds = new Set();
  const nav = [];
  const html = sections
    .map((section) => {
      const navLabel = section.title?.trim();
      const id = uniqueId(navLabel, usedIds);
      const renderer = SECTION_RENDERERS[section.kind] ?? renderUnknownSection;
      if ((section.kind === "cover" || section.kind === "title") && navLabel) {
        nav.push({ id, label: navLabel });
      }
      return renderer(section, id);
    })
    .join("\n");

  return { html, nav };
}
