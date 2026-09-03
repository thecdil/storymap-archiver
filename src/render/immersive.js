import { escapeHtml } from "./escape.js";
import { renderBlocks } from "./blocks.js";
import { renderBackground, renderBackgroundImage, renderMapContainer } from "./background.js";
import { titleStyleClasses } from "./title-style.js";
import { backgroundMediaKey } from "../normalize/transitions.js";

const SWIPES = new Set(["swipe-vertical", "swipe-horizontal"]);

/**
 * Group a section's views by the background element that will show them.
 * Like Cascade's media cache, views that reuse the same image/webmap share
 * one element (so a "none" transition really is nothing happening) — except
 * a swipe between two states of the same webmap, which needs two map
 * instances so the incoming one can be clipped over the outgoing one.
 */
export function planBackgrounds(views) {
  const elements = [];
  const byKey = new Map();
  const viewToElement = [];

  views.forEach((view, index) => {
    let key = backgroundMediaKey(view.background);
    const previousKey = index > 0 ? backgroundMediaKey(views[index - 1].background) : null;
    if (SWIPES.has(view.effectiveTransition) && key === previousKey) key = `${key}#view${index}`;

    let element = byKey.get(key);
    if (!element) {
      element = {
        index: elements.length,
        key,
        background: view.background,
        // The element animates with the transition of the first view that
        // uses it, in both scroll directions — same as Cascade's
        // `transition-*` class on the background node.
        transition: view.effectiveTransition ?? "fade-fast",
        views: [],
      };
      byKey.set(key, element);
      elements.push(element);
    }
    element.views.push({ index, background: view.background });
    viewToElement.push(element.index);
  });

  return { elements, viewToElement };
}

function renderBackgroundElement(element) {
  const bg = element.background;
  let inner = "";
  let style = "";

  if (!bg) {
    inner = "";
  } else if (bg.type === "image") {
    inner = renderBackgroundImage(bg.image);
  } else if (bg.type === "webmap") {
    inner = renderMapContainer(bg, element.views);
  } else {
    // color → inline style; unknown → the visible placeholder.
    ({ html: inner, style } = renderBackground(bg));
  }

  return `<div class="immersive-bg" data-bg="${element.index}" data-transition="${escapeHtml(element.transition)}" style="${style}">${inner}</div>`;
}

function panelClasses(panel) {
  const classes = ["imm-panel", `layout-${panel.layout ?? "scroll-full"}`];
  if (panel.size) classes.push(`size-${panel.size}`);
  if (panel.position) classes.push(`placement-${panel.position}`);
  if (panel.theme) classes.push(`theme-${panel.theme}`);
  if (panel.style) classes.push(`style-${panel.style}`);
  return classes.map(escapeHtml).join(" ");
}

function renderPanel(view, viewIndex, elementIndex) {
  // Cascade renders one panel per view (the builder only ever writes one);
  // extra panels, if a story ever had them, are stacked in the same view.
  const panels = view.panels?.length ? view.panels : [{ layout: "scroll-full", blocks: [], isEmpty: true }];
  return panels
    .map((panel) => {
      const card = panel.isEmpty ? "" : `<div class="imm-card">${renderBlocks(panel.blocks)}</div>`;
      return `<div class="${panelClasses(panel)}" data-view="${viewIndex}" data-bg="${elementIndex}" data-transition="${escapeHtml(view.effectiveTransition ?? "fade-fast")}">
      ${card}
    </div>`;
    })
    .join("\n");
}

/**
 * An immersive section: a sticky full-viewport stage holding every unique
 * background (only one visible at a time), the global title, and the swipe
 * edge; followed by one scrolling panel per view. The stage's own height
 * provides Cascade's 100vh background-only lead-in before the first panel.
 * See docs/polish.md §3.
 */
export function renderImmersive(section, id) {
  const views = section.views ?? [];
  const { elements, viewToElement } = planBackgrounds(views);

  const titleValue = views[0]?.title?.value?.trim();
  const titleStyle = titleStyleClasses(views[0]?.title?.style);
  const title = titleValue
    ? `<div class="immersive-title"><div class="${titleStyle.wrapper}"><h2 class="${titleStyle.text}">${escapeHtml(titleValue)}</h2></div></div>`
    : "";

  const backgrounds = elements.map(renderBackgroundElement).join("\n    ");
  const panels = views.map((view, i) => renderPanel(view, i, viewToElement[i])).join("\n");

  return `<section id="${id}" class="immersive" data-views="${views.length}">
  <div class="immersive-stage">
    <div class="immersive-filler"></div>
    ${backgrounds}
    <div class="immersive-swipe-edge" hidden></div>
    ${title}
  </div>
  <div class="immersive-panels">
${panels}
  </div>
</section>`;
}
