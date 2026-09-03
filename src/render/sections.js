import { escapeHtml } from "./escape.js";
import { renderBlocks } from "./blocks.js";
import { renderBackground } from "./background.js";
import { titleStyleClasses } from "./title-style.js";
import { renderImmersive } from "./immersive.js";
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

// The cover's pulsing "scroll down" invite — Cascade's is a 130×52 white
// chevron PNG; drawn here as SVG so it scales and needs no asset copy.
const SCROLL_INVITE_ICON = `<svg viewBox="0 0 130 52" width="130" height="52" aria-hidden="true" focusable="false">
      <path d="M22 8 L65 44 L108 8" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

/**
 * The cover: a full-viewport stage that stays pinned (position: sticky)
 * while every later section slides up over it, exactly like Cascade's
 * fixed `.wrapper`. Title + subtitle share one `titleStyle` box.
 */
function renderCover(section, id) {
  const bg = renderBackground(section.background);
  const style = titleStyleClasses(section.titleStyle);
  const title = section.title?.trim();
  const subtitle = section.subtitle?.trim();
  return `<section id="${id}" class="hero hero-cover" style="${bg.style}">
  ${bg.html}
  <div class="hero-content">
    <div class="${style.wrapper}">
      ${title ? `<h1 class="cover-title ${style.text}">${escapeHtml(title)}</h1>` : ""}
      ${subtitle ? `<p class="cover-subtitle ${style.text}">${escapeHtml(subtitle)}</p>` : ""}
    </div>
  </div>
  <div class="scroll-invite">
    <button type="button" class="scroll-invite-btn" data-scroll-invite aria-label="Scroll down to start reading">${SCROLL_INVITE_ICON}</button>
  </div>
</section>`;
}

// Chapter divider. Still rendered as a full-height hero here — Phase D
// (docs/polish.md) turns it into Cascade's 90/200/400px banner band; the
// titleStyle box already matches so that change is layout-only.
function renderTitle(section, id) {
  const bg = renderBackground(section.background);
  const style = titleStyleClasses(section.titleStyle);
  const title = section.title?.trim();
  // section.credits is pre-authored HTML from the story (may be empty), not
  // escaped — same trust level as block text, see src/render/blocks.js.
  return `<section id="${id}" class="hero hero-title size-${escapeHtml(section.size ?? "medium")}" style="${bg.style}">
  ${bg.html}
  <div class="hero-content">
    <div class="${style.wrapper}">
      ${title ? `<h2 class="fg-title ${style.text}">${escapeHtml(title)}</h2>` : ""}
    </div>
  </div>
  ${section.credits ? `<div class="fg-credits">${section.credits}</div>` : ""}
</section>`;
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
 * Render every section, returning both the concatenated HTML and the list
 * of header bookmarks: exactly the sections whose author enabled
 * `bookmark` (Cascade lists nothing else — no automatic outline), labelled
 * with the author's short bookmark title, falling back to the section's
 * own title when the bookmark label is blank.
 */
export function renderSections(sections) {
  const usedIds = new Set();
  const bookmarks = [];
  const html = sections
    .map((section) => {
      const heading = section.title?.trim();
      const id = uniqueId(heading || section.bookmark?.title, usedIds);
      const renderer = SECTION_RENDERERS[section.kind] ?? renderUnknownSection;
      if (section.bookmark?.enabled) {
        const label = section.bookmark.title || heading;
        if (label) bookmarks.push({ id, label });
      }
      return renderer(section, id);
    })
    .join("\n");

  return { html, bookmarks };
}
