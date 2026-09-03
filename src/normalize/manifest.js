import { normalizeBackground } from "./background.js";
import { normalizeBlocks } from "./blocks.js";
import { resolveTransitions } from "./transitions.js";

/**
 * Cascade's `titleStyle` object (cover/title sections' foreground.options,
 * and an immersive view's foreground.title.style):
 *   shadow      boolean  — keep the 8px text-shadow
 *   text        "light" | "dark" — text color (dark = black w/ white glow)
 *   background  "light" | "dark" | null — translucent box behind the text
 * See docs/polish.md §1.2. Absent in older stories → viewer default is
 * "white text with shadow, no box".
 */
function normalizeTitleStyle(style) {
  if (!style || typeof style !== "object") return null;
  return {
    shadow: Boolean(style.shadow),
    text: style.text === "dark" ? "dark" : "light",
    background: style.background === "light" || style.background === "dark" ? style.background : null,
  };
}

/**
 * Whether the author enabled this section as a header bookmark, and the
 * short label they gave it. Cascade lists *only* enabled bookmarks in its
 * header — none are enabled in the 3 reference stories.
 */
function normalizeBookmark(bookmark) {
  return {
    enabled: Boolean(bookmark?.enabled),
    title: typeof bookmark?.title === "string" ? bookmark.title.trim() : "",
  };
}

function sectionCommon(section) {
  return {
    layout: section.layout ?? null,
    bookmark: normalizeBookmark(section.bookmark),
  };
}

function normalizeCover(section, ctx, path) {
  return {
    kind: "cover",
    ...sectionCommon(section),
    title: section.foreground?.title ?? "",
    subtitle: section.foreground?.subtitle ?? "",
    titleStyle: normalizeTitleStyle(section.foreground?.options?.titleStyle),
    background: normalizeBackground(section.background, ctx, `${path}.background`),
  };
}

const TITLE_SIZES = ["small", "medium", "large"];

// Esri's "title" sections are mid-story chapter dividers (distinct from the
// story's own manifest.meta.title): a short banner band whose height comes
// from options.size (90/200/400px), not a full-screen hero.
function normalizeTitle(section, ctx, path) {
  const size = section.options?.size;
  return {
    kind: "title",
    ...sectionCommon(section),
    title: section.foreground?.title ?? "",
    credits: section.foreground?.credits ?? "",
    titleStyle: normalizeTitleStyle(section.foreground?.options?.titleStyle),
    size: TITLE_SIZES.includes(size) ? size : "medium",
    background: normalizeBackground(section.background, ctx, `${path}.background`),
  };
}

function normalizeSequence(section, ctx, path) {
  return {
    kind: "sequence",
    ...sectionCommon(section),
    background: normalizeBackground(section.background, ctx, `${path}.background`),
    blocks: normalizeBlocks(section.foreground?.blocks, ctx, `${path}.foreground.blocks`),
  };
}

/** Text content of a block's HTML, whitespace/nbsp collapsed — Cascade's `getPreviewText()`. */
function textBlockPreview(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;| /g, " ")
    .trim();
}

/**
 * A panel holding nothing but one blank text block is how an author makes
 * a "background only" view; the viewer hides its card entirely.
 */
function isEmptyPanel(blocks) {
  return blocks.length === 1 && blocks[0].type === "text" && textBlockPreview(blocks[0].html) === "";
}

const PANEL_LAYOUTS = ["scroll-full", "scroll-partial"];

function normalizeImmersive(section, ctx, path) {
  const views = (section.views ?? []).map((view, i) => {
    const viewPath = `${path}.views[${i}]`;
    return {
      transition: view.transition ?? null,
      background: normalizeBackground(view.background, ctx, `${viewPath}.background`),
      title: view.foreground?.title
        ? {
            value: view.foreground.title.value ?? "",
            global: Boolean(view.foreground.title.global),
            style: normalizeTitleStyle(view.foreground.title.style),
          }
        : null,
      panels: (view.foreground?.panels ?? []).map((panel, j) => {
        const panelPath = `${viewPath}.foreground.panels[${j}]`;
        const blocks = normalizeBlocks(panel.blocks, ctx, `${panelPath}.blocks`);
        const layout = panel.layout ?? panel.settings?.layout;
        return {
          layout: PANEL_LAYOUTS.includes(layout) ? layout : "scroll-full",
          position: panel.settings?.["position-x"] ?? null,
          size: panel.settings?.size ?? null,
          style: panel.settings?.style ?? null,
          theme: panel.settings?.theme ?? null,
          isEmpty: isEmptyPanel(blocks),
          blocks,
        };
      }),
    };
  });

  // The transition the viewer would actually play, after its same-media
  // overrides (src/normalize/transitions.js). The authored value is kept
  // alongside so nothing is lost.
  const effective = resolveTransitions(views);
  for (const [i, view] of views.entries()) {
    view.effectiveTransition = effective[i];
  }

  return { kind: "immersive", ...sectionCommon(section), views };
}

function normalizeCredits(section, ctx, path) {
  const panels = (section.foreground?.panels ?? []).map((panel, i) => {
    const panelPath = `${path}.foreground.panels[${i}]`;

    if (panel.type === "blocks") {
      return { type: "blocks", blocks: normalizeBlocks(panel.blocks, ctx, `${panelPath}.blocks`) };
    }

    if (panel.type === "credits") {
      // The populated shape of individual credit entries hasn't been
      // observed (empty in all 3 reference stories) — pass them through
      // verbatim rather than guessing a schema.
      return { type: "credits", credits: Array.isArray(panel.credits) ? panel.credits : [] };
    }

    ctx.warn(panelPath, `Unknown credits panel type "${panel.type}"`, panel);
    return { type: "unknown", sourceType: panel.type ?? null, raw: panel };
  });

  return {
    kind: "credits",
    ...sectionCommon(section),
    background: normalizeBackground(section.background, ctx, `${path}.background`),
    panels,
  };
}

const SECTION_NORMALIZERS = {
  cover: normalizeCover,
  title: normalizeTitle,
  sequence: normalizeSequence,
  immersive: normalizeImmersive,
  credits: normalizeCredits,
};

function normalizeSection(section, ctx, index) {
  const path = `sections[${index}]`;
  const normalizer = SECTION_NORMALIZERS[section.type];

  if (!normalizer) {
    // Only cover/title/sequence/immersive/credits have been observed across
    // the 3 reference stories. See docs/todo.md — never drop a whole section
    // silently just because its type is new to us.
    ctx.warn(path, `Unknown section type "${section.type}"`, section);
    return { kind: "unknown", sourceType: section.type ?? null, raw: section };
  }

  return normalizer(section, ctx, path);
}

/**
 * `values.settings.header`: the fixed top bar's optional logo, tagline link,
 * and share button. The logo URL is only meaningful when `enabled`; the
 * builder's default value is a *relative* path to Esri's own logo inside
 * the Cascade app, which isn't a story asset — flagged as `builtin` so the
 * localizer/renderer can skip it rather than 404.
 */
function normalizeHeader(header) {
  const logo = header?.logo ?? {};
  const link = header?.link ?? {};
  const logoUrl = typeof logo.url === "string" ? logo.url : null;
  return {
    logo: {
      enabled: Boolean(logo.enabled),
      url: logoUrl,
      builtin: logoUrl !== null && !/^https?:\/\//i.test(logoUrl),
      link: typeof logo.link === "string" ? logo.link : null,
    },
    link: {
      url: typeof link.url === "string" ? link.url : null,
      title: typeof link.title === "string" ? link.title : null,
    },
    social: { enabled: Boolean(header?.social?.enabled) },
  };
}

/**
 * Convert the raw ArcGIS item info + story `data` JSON into our own story
 * manifest, decoupled from Esri's schema. Returns both the manifest and a
 * list of warnings for anything encountered that isn't explicitly handled —
 * callers should surface these loudly rather than treating a clean run as
 * silence.
 */
export function normalizeStory({ item, data, appid, portalHost }) {
  const warnings = [];
  const ctx = {
    appid,
    warn(path, message) {
      warnings.push({ path, message });
    },
  };

  const values = data?.values ?? {};
  const sections = (values.sections ?? []).map((section, i) => normalizeSection(section, ctx, i));

  const manifest = {
    meta: {
      title: (item.title ?? "").trim(),
      snippet: item.snippet ?? null,
      description: item.description ?? null,
      credit: item.accessInformation ?? null,
      license: item.licenseInfo ?? null,
      owner: item.owner ?? null,
      thumbnail: item.thumbnail ?? null,
      sourceAppid: appid,
      sourcePortal: portalHost,
      template: values.template ?? null,
      theme: values.settings?.theme ?? null,
      header: normalizeHeader(values.settings?.header),
    },
    sections,
  };

  return { manifest, warnings };
}
