/*
 * Pure scroll math for the generated site, ported from Cascade's viewer
 * (docs/polish.md §1). No DOM access: every function takes plain numbers so
 * it can run under `node --test` (see test/engine.test.js) and in the
 * browser, where site.js reads it from window.StorymapEngine.
 */
(function (root) {
  "use strict";

  // Header is "compact" (transparent) while the cover still fills the
  // viewport: windowHeight - scrollTop - 50 >= 40 (and not past the cover).
  function headerCompact(scrollTop, windowHeight) {
    if (scrollTop > windowHeight) return false;
    var remaining = windowHeight - scrollTop - 50;
    return remaining >= 40;
  }

  // Progress bar fill, 0..1.
  function storyProgress(scrollTop, windowHeight, storyHeight) {
    if (!(storyHeight > 0)) return 0;
    return Math.max(0, Math.min(1, (scrollTop + windowHeight) / storyHeight));
  }

  // The view whose background should be showing: the last panel whose top
  // edge has risen above the viewport bottom (Cascade:
  // currentSectionScroll + windowHeight > panel.top), else the first view.
  function activeViewIndex(panelTops, windowHeight) {
    var index = 0;
    for (var i = 0; i < panelTops.length; i++) {
      if (panelTops[i] < windowHeight) index = i;
    }
    return index;
  }

  // The section is "navigating away" once its bottom edge is inside the
  // viewport — the stage is about to scroll off with the last panel.
  function isNavigatingAway(sectionBottom, windowHeight) {
    return sectionBottom > 0 && sectionBottom < windowHeight;
  }

  // How far the reader has scrolled into the current view, in px: the
  // distance from the panel's top edge up to the viewport bottom.
  function viewScroll(panelTop, windowHeight, navigatingAway) {
    if (navigatingAway) return 0;
    return Math.max(0, windowHeight - panelTop);
  }

  // scroll-full: the panel fades in once the reader is 5% of a viewport
  // into the view, and resets when scrolled back above that (unless the
  // section is on its way out, which would just flicker).
  function scrollFullBringIn(currentlyIn, viewScrollPx, windowHeight, navigatingAway) {
    var ratio = windowHeight > 0 ? viewScrollPx / windowHeight : 0;
    if (!currentlyIn && ratio > 0.05) return true;
    if (currentlyIn && ratio < 0.05 && !navigatingAway) return false;
    return currentlyIn;
  }

  function partialOpacity(value, max, min, inverted) {
    var range = max - min;
    return 1 - (inverted ? max - value : value - min) / range;
  }

  // scroll-partial: opacity from where the card sits in the viewport.
  // `top`/`bottom` are the distances the card's top/bottom edges have
  // travelled up from the viewport bottom, as fractions of the viewport.
  function scrollPartialOpacity(rectTop, rectBottom, windowHeight) {
    var top = (windowHeight - rectTop) / windowHeight;
    var bottom = (windowHeight - rectBottom) / windowHeight;
    if (bottom >= 0.95) return 0;
    if (bottom > 0.55 && bottom < 0.95) return partialOpacity(bottom, 0.95, 0.55, false);
    if (top >= 0.45 && bottom <= 0.55) return 1;
    if (top > 0.05 && top < 0.45) return partialOpacity(top, 0.45, 0.05, true);
    return 0;
  }

  // Scroll-linked swipe reveal of the incoming background: the visible edge
  // moves 1.3× the scroll distance. Returns null when nothing is clipped
  // (reveal complete), else the inset for clip-path and where the shadow
  // edge sits.
  function swipeClip(transition, viewScrollPx, windowWidth, windowHeight) {
    if (transition === "swipe-vertical") {
      var top = windowHeight - 1.3 * viewScrollPx;
      if (top <= 0) return null;
      return { axis: "vertical", inset: "inset(" + top + "px 0 0 0)", edge: Math.min(top, windowHeight) };
    }
    if (transition === "swipe-horizontal") {
      var progress = windowHeight > 0 ? (1.3 * viewScrollPx) / windowHeight : 1;
      var left = windowWidth - progress * windowWidth;
      if (left <= 0) return null;
      return { axis: "horizontal", inset: "inset(0 0 0 " + left + "px)", edge: Math.min(left, windowWidth) };
    }
    return null;
  }

  // How long a background stays underneath the incoming one (ms), matching
  // the CSS transition durations.
  function transitionDuration(transition) {
    if (transition === "fade-slow") return 1500;
    if (transition === "fade-fast") return 500;
    return 0;
  }

  root.StorymapEngine = {
    headerCompact: headerCompact,
    storyProgress: storyProgress,
    activeViewIndex: activeViewIndex,
    isNavigatingAway: isNavigatingAway,
    viewScroll: viewScroll,
    scrollFullBringIn: scrollFullBringIn,
    scrollPartialOpacity: scrollPartialOpacity,
    swipeClip: swipeClip,
    transitionDuration: transitionDuration,
  };
})(typeof window !== "undefined" ? window : globalThis);
