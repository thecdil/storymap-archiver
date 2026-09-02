import { normalizeBackground } from "./background.js";
import { normalizeBlocks } from "./blocks.js";

function normalizeCover(section, ctx, path) {
  return {
    kind: "cover",
    title: section.foreground?.title ?? "",
    subtitle: section.foreground?.subtitle ?? "",
    background: normalizeBackground(section.background, ctx, `${path}.background`),
  };
}

// Esri's "title" sections are mid-story chapter dividers (distinct from the
// story's own manifest.meta.title).
function normalizeTitle(section, ctx, path) {
  return {
    kind: "title",
    title: section.foreground?.title ?? "",
    credits: section.foreground?.credits ?? "",
    background: normalizeBackground(section.background, ctx, `${path}.background`),
  };
}

function normalizeSequence(section, ctx, path) {
  return {
    kind: "sequence",
    background: normalizeBackground(section.background, ctx, `${path}.background`),
    blocks: normalizeBlocks(section.foreground?.blocks, ctx, `${path}.foreground.blocks`),
  };
}

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
          }
        : null,
      panels: (view.foreground?.panels ?? []).map((panel, j) => {
        const panelPath = `${viewPath}.foreground.panels[${j}]`;
        return {
          layout: panel.layout ?? null,
          position: panel.settings?.["position-x"] ?? null,
          size: panel.settings?.size ?? null,
          style: panel.settings?.style ?? null,
          theme: panel.settings?.theme ?? null,
          blocks: normalizeBlocks(panel.blocks, ctx, `${panelPath}.blocks`),
        };
      }),
    };
  });

  return { kind: "immersive", views };
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
    },
    sections,
  };

  return { manifest, warnings };
}
