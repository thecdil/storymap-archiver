/**
 * Immersive view transition rules, ported from Cascade's
 * `Immersive._applyTransitionRules` / `_getTransitionInfo` and the media
 * classes' `getAuthorizedTransitionsWith` (see docs/polish.md §1.5).
 *
 * The authored `view.transition` is only a request; the viewer overrides it
 * based on whether neighbouring views reuse the same background media:
 *
 *   - the first view of a section always gets "fade-fast";
 *   - a view whose media is identical to the *immediately previous* view's
 *     keeps its transition only if that media type authorizes it — images
 *     authorize nothing (so "none": the picture simply stays), a webmap
 *     authorizes "swipe-vertical" only when the two views show different
 *     layer sets with the same extent/popup;
 *   - a view whose media appeared earlier in the section, but not
 *     immediately before, is forced to "none" unless the media is an image.
 */

export const TRANSITIONS = ["fade-fast", "fade-slow", "none", "swipe-vertical", "swipe-horizontal"];

/**
 * A stable identity for a view's background media, matching what Cascade's
 * media cache dedupes on: an image is its URL, a webmap is its item id, and
 * a color background is its color. Two views with the same key share one
 * rendered background element (Phase E) and are "the same media" for the
 * transition rules below.
 */
export function backgroundMediaKey(background) {
  if (!background) return "empty";
  switch (background.type) {
    case "image":
      return `image:${background.image?.url ?? ""}`;
    case "webmap":
      return `webmap:${background.webmapId ?? ""}`;
    case "color":
      return `color:${background.value ?? ""}`;
    default:
      return `${background.type ?? "unknown"}:${JSON.stringify(background.raw ?? null)}`;
  }
}

function stable(value) {
  return JSON.stringify(value ?? null);
}

/** Port of `WebMap.getAuthorizedTransitionsWith(previousMedia)`. */
function authorizedTransitionsWith(background, previous) {
  if (background?.type !== "webmap" || previous?.type !== "webmap") return [];
  if (background.webmapId !== previous.webmapId) return [];
  if (stable(background.extent) !== stable(previous.extent)) return [];
  if (stable(background.popup) !== stable(previous.popup)) return [];
  if (stable(background.layerOverrides ?? []) === stable(previous.layerOverrides ?? [])) return [];
  return ["swipe-vertical"];
}

/**
 * Given a section's views (each `{ transition, background }`), return the
 * transition the viewer would actually play for each one.
 */
export function resolveTransitions(views) {
  const keys = views.map((view) => backgroundMediaKey(view.background));

  return views.map((view, index) => {
    const requested = TRANSITIONS.includes(view.transition) ? view.transition : "fade-fast";
    if (index === 0) return "fade-fast";

    const firstIndex = keys.indexOf(keys[index]);
    const isDuplicate = firstIndex < index;
    if (!isDuplicate) return requested;

    const isConsecutive = keys[index - 1] === keys[index];
    if (isConsecutive) {
      const authorized = authorizedTransitionsWith(view.background, views[index - 1].background);
      return authorized.includes(requested) ? requested : "none";
    }

    return view.background?.type === "image" ? requested : "none";
  });
}
