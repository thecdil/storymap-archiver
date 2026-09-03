(function () {
  "use strict";

  var engine = window.StorymapEngine;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  // One rAF-throttled scroll loop shared by everything that reacts to the
  // scroll position. Handlers get { scrollTop, windowHeight, windowWidth,
  // storyHeight }.
  var scrollHandlers = [];
  function onScroll(handler) {
    scrollHandlers.push(handler);
  }
  function startScrollLoop() {
    if (scrollHandlers.length === 0) return;
    var scheduled = false;
    function run() {
      scheduled = false;
      var state = {
        scrollTop: window.pageYOffset || document.documentElement.scrollTop || 0,
        windowHeight: window.innerHeight,
        windowWidth: window.innerWidth,
        storyHeight: document.documentElement.scrollHeight,
      };
      for (var i = 0; i < scrollHandlers.length; i++) scrollHandlers[i](state);
    }
    function schedule() {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(run);
    }
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    run();
  }

  // Cascade's rare per-image "mobile-pos" override: on narrow viewports,
  // swap just the horizontal crop of a background image, keeping the
  // vertical position the author picked (docs/polish.md §1.6). The
  // rendered `style` attribute already has the desktop position baked in
  // as a no-JS fallback; this only needs to react at the breakpoint, not
  // on every scroll frame, so it stays off the shared scroll loop.
  function initMobilePositions() {
    var els = Array.prototype.slice.call(document.querySelectorAll("[data-mobile-pos]"));
    if (els.length === 0) return;
    var mq = window.matchMedia("(max-width: 767px)");
    function apply() {
      els.forEach(function (el) {
        var x = mq.matches ? el.getAttribute("data-mobile-pos") : el.getAttribute("data-pos-x");
        var y = el.getAttribute("data-pos-y") || "50%";
        el.style.objectPosition = x + " " + y;
      });
    }
    if (mq.addEventListener) mq.addEventListener("change", apply);
    else if (mq.addListener) mq.addListener(apply);
    apply();
  }

  /* ---------- header, progress bar, cover ---------- */

  function initHeader() {
    var header = document.querySelector(".story-header");
    if (!header) return;
    var hasCover = header.getAttribute("data-has-cover") === "true";
    var bar = document.querySelector(".story-progress-bar");
    onScroll(function (state) {
      if (hasCover) header.classList.toggle("compact", engine.headerCompact(state.scrollTop, state.windowHeight));
      if (bar) bar.style.width = engine.storyProgress(state.scrollTop, state.windowHeight, state.storyHeight) * 100 + "%";
    });
  }

  function initScrollInvite() {
    var button = document.querySelector("[data-scroll-invite]");
    if (!button) return;
    button.addEventListener("click", function () {
      var cover = button.closest("section");
      var next = cover && cover.nextElementSibling;
      if (next) next.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  }

  function initNavHighlighting() {
    var links = Array.prototype.slice.call(document.querySelectorAll(".story-bookmarks a"));
    if (links.length === 0 || !("IntersectionObserver" in window)) return;

    var byId = {};
    links.forEach(function (link) {
      byId[link.getAttribute("href").slice(1)] = link;
    });

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var link = byId[entry.target.id];
          if (!link) return;
          if (entry.isIntersecting) {
            links.forEach(function (l) {
              l.classList.remove("is-current");
            });
            link.classList.add("is-current");
          }
        });
      },
      { rootMargin: "-40% 0px -40% 0px" },
    );

    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }

  // Sequence media (images/galleries only — text is never hidden) fades in
  // once it's within 100px of the viewport bottom, and resets if the
  // reader scrolls back up past it while it's still below the viewport —
  // Cascade's isNearViewportBottom/_loadBlocks (docs/polish.md §1.4).
  function initSequenceReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll(".sequence-content [data-reveal]"));
    if (items.length === 0) return;
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (el) {
        el.classList.add("bring-in");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("bring-in");
          } else if (entry.boundingClientRect.top >= 0) {
            // Only reset when it has scrolled back below the viewport —
            // Cascade never re-hides content already scrolled past upward.
            entry.target.classList.remove("bring-in");
          }
        });
      },
      { rootMargin: "0px 0px 100px 0px" },
    );

    items.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ---------- maps (Leaflet, one instance per unique webmap per section) ---------- */

  function popupHtml(properties) {
    var rows = Object.keys(properties || {})
      .filter(function (key) {
        return key.indexOf("__") !== 0 && key.toUpperCase() !== "OBJECTID";
      })
      .map(function (key) {
        return "<tr><th>" + escapeHtml(key) + "</th><td>" + escapeHtml(properties[key]) + "</td></tr>";
      })
      .join("");
    return rows ? '<table class="map-popup">' + rows + "</table>" : "";
  }

  // Esri JSON envelope → Leaflet bounds (WGS84 or Web Mercator only).
  function extentToBounds(extent) {
    if (!extent || typeof extent.xmin !== "number") return null;
    var wkid = extent.spatialReference && (extent.spatialReference.latestWkid || extent.spatialReference.wkid);
    function toLatLng(x, y) {
      if (wkid === 102100 || wkid === 102113 || wkid === 3857) {
        var lng = (x / 20037508.342789244) * 180;
        var lat = (Math.atan(Math.exp((y / 20037508.342789244) * Math.PI)) * 360) / Math.PI - 90;
        return [lat, lng];
      }
      return [y, x];
    }
    return L.latLngBounds(toLatLng(extent.xmin, extent.ymin), toLatLng(extent.xmax, extent.ymax));
  }

  // container → { applyView(viewIndex) }
  var mapsById = {};

  function initMap(container) {
    var configEl = document.querySelector('script[data-map-config-for="' + container.id + '"]');
    if (!configEl || typeof L === "undefined") return;

    var config = JSON.parse(configEl.textContent);
    var map = L.map(container, {
      scrollWheelZoom: false,
      dragging: config.interaction !== false,
      keyboard: config.interaction !== false,
    });
    window.addEventListener("resize", function () {
      map.invalidateSize();
    });

    config.tileLayers.forEach(function (tile) {
      L.tileLayer(tile.urlTemplate, { maxZoom: 19, attribution: tile.attribution || "" }).addTo(map);
    });

    var layersByKey = {};
    var loads = (config.layers || []).map(function (layerConfig) {
      return fetch(layerConfig.dataFile)
        .then(function (res) {
          return res.json();
        })
        .then(function (data) {
          var geojson = data.geojson || data;
          layersByKey[layerConfig.key] = L.geoJSON(geojson, {
            pointToLayer: function (feature, latlng) {
              return L.circleMarker(latlng, { radius: 6, weight: 1, color: "#2b6cb0", fillOpacity: 0.8 });
            },
            style: function () {
              return { color: "#2b6cb0", weight: 2, fillOpacity: 0.15 };
            },
            onEachFeature: function (feature, leafletLayer) {
              var html = popupHtml(feature.properties);
              if (html) leafletLayer.bindPopup(html);
            },
          });
        });
      // a rejected fetch/parse is left to Promise.allSettled below — one
      // bad layer shouldn't block the rest of the map.
    });

    var ready = false;
    var pendingView = null;
    var framed = false;

    function applyView(viewIndex) {
      var view = config.views && config.views[String(viewIndex)];
      if (!view) return;
      if (!ready) {
        pendingView = viewIndex;
        return;
      }
      var visible = view.visible || [];
      Object.keys(layersByKey).forEach(function (key) {
        var layer = layersByKey[key];
        var wanted = visible.indexOf(key) !== -1;
        if (wanted && !map.hasLayer(layer)) layer.addTo(map);
        if (!wanted && map.hasLayer(layer)) map.removeLayer(layer);
      });
      var bounds = extentToBounds(view.extent);
      if (bounds) {
        map.fitBounds(bounds, { animate: !reduceMotion });
        framed = true;
      } else if (!framed && config.initialExtent) {
        // The webmap's own saved extent, as the original viewer opened it.
        var e = config.initialExtent;
        map.fitBounds(L.latLngBounds([e[0][1], e[0][0]], [e[1][1], e[1][0]]), { animate: false });
        framed = true;
      } else if (!framed) {
        // No extent at all: frame the first view's visible data once, then
        // leave the map alone as the reader (or the story) moves it.
        var group = L.featureGroup(
          visible.map(function (key) {
            return layersByKey[key];
          }),
        );
        if (group.getLayers().length > 0 && group.getBounds().isValid()) {
          map.fitBounds(group.getBounds(), { padding: [20, 20], maxZoom: 15, animate: false });
        } else {
          map.setView([20, 0], 1);
        }
        framed = true;
      }
    }

    Promise.allSettled(loads).then(function () {
      ready = true;
      var first = pendingView !== null ? pendingView : Object.keys(config.views || {})[0];
      if (first !== undefined) applyView(first);
      else map.setView([20, 0], 1);
    });

    mapsById[container.id] = { applyView: applyView };
  }

  function initMaps() {
    document.querySelectorAll(".storymap-map").forEach(initMap);
  }

  function applyMapView(bgElement, viewIndex) {
    var container = bgElement.querySelector(".storymap-map");
    if (container && mapsById[container.id]) mapsById[container.id].applyView(viewIndex);
  }

  /* ---------- immersive sections ---------- */

  function initImmersive(section) {
    var stage = section.querySelector(".immersive-stage");
    var bgs = Array.prototype.slice.call(section.querySelectorAll(".immersive-bg"));
    var panels = Array.prototype.slice.call(section.querySelectorAll(".imm-panel"));
    var edge = section.querySelector(".immersive-swipe-edge");
    if (!stage || panels.length === 0) return;

    var activeView = -1;
    var activeBg = null;
    var previousBg = null;
    var previousTimer = null;

    function clearPrevious() {
      if (previousTimer) window.clearTimeout(previousTimer);
      previousTimer = null;
      if (previousBg) {
        previousBg.classList.remove("was-active");
        previousBg.style.zIndex = "";
        previousBg = null;
      }
    }

    function showBackground(bg, transition) {
      if (bg === activeBg) return;
      clearPrevious();
      if (activeBg) {
        previousBg = activeBg;
        previousBg.classList.remove("is-active");
        previousBg.classList.add("was-active");
        previousBg.style.zIndex = "1";
      }
      activeBg = bg;
      bg.style.zIndex = "2";
      bg.classList.add("is-active");
      if (transition !== "swipe-vertical" && transition !== "swipe-horizontal") {
        bg.style.clipPath = "";
        var duration = reduceMotion ? 0 : engine.transitionDuration(bg.getAttribute("data-transition"));
        previousTimer = window.setTimeout(clearPrevious, duration + 50);
      }
    }

    function updateSwipe(bg, transition, viewScrollPx, state) {
      var clip = reduceMotion ? null : engine.swipeClip(transition, viewScrollPx, state.windowWidth, state.windowHeight);
      if (!clip) {
        bg.style.clipPath = "";
        if (edge) edge.hidden = true;
        clearPrevious();
        return;
      }
      bg.style.clipPath = clip.inset;
      if (edge) {
        edge.hidden = false;
        edge.classList.toggle("is-vertical", clip.axis === "vertical");
        edge.classList.toggle("is-horizontal", clip.axis === "horizontal");
        edge.style.top = clip.axis === "vertical" ? clip.edge + "px" : "";
        edge.style.left = clip.axis === "horizontal" ? clip.edge + "px" : "";
      }
    }

    function updatePanel(panel, viewScrollPx, state, navigatingAway) {
      if (panel.classList.contains("layout-scroll-partial")) return;
      var currentlyIn = panel.classList.contains("bring-in");
      var next = engine.scrollFullBringIn(currentlyIn, viewScrollPx, state.windowHeight, navigatingAway);
      if (next !== currentlyIn) panel.classList.toggle("bring-in", next);
    }

    function updatePartial(panel, state) {
      var card = panel.querySelector(".imm-card");
      if (!card) return;
      if (reduceMotion) {
        card.style.opacity = 1;
        return;
      }
      var rect = card.getBoundingClientRect();
      card.style.opacity = engine.scrollPartialOpacity(rect.top, rect.bottom, state.windowHeight);
    }

    onScroll(function (state) {
      var rect = section.getBoundingClientRect();
      var onScreen = rect.bottom > 0 && rect.top < state.windowHeight;
      section.classList.toggle("is-active", onScreen);
      if (!onScreen) return;

      var tops = panels.map(function (panel) {
        return panel.getBoundingClientRect().top;
      });
      var index = engine.activeViewIndex(tops, state.windowHeight);
      var panel = panels[index];
      var navigatingAway = engine.isNavigatingAway(rect.bottom, state.windowHeight);
      var viewScrollPx = engine.viewScroll(tops[index], state.windowHeight, navigatingAway);
      var transition = panel.getAttribute("data-transition");
      var bg = bgs[Number(panel.getAttribute("data-bg"))];

      if (index !== activeView) {
        activeView = index;
        if (bg) {
          showBackground(bg, transition);
          applyMapView(bg, index);
        }
      }
      if (bg && (transition === "swipe-vertical" || transition === "swipe-horizontal")) {
        updateSwipe(bg, transition, viewScrollPx, state);
      }

      if (panel.classList.contains("layout-scroll-partial")) {
        updatePartial(panel, state);
        if (panels[index - 1]) updatePartial(panels[index - 1], state);
      } else {
        updatePanel(panel, viewScrollPx, state, navigatingAway);
      }

      section.classList.toggle("is-leaving", index === panels.length - 1 && navigatingAway);
    });
  }

  function initImmersives() {
    document.querySelectorAll(".immersive").forEach(initImmersive);
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!engine) return;
    initHeader();
    initScrollInvite();
    initMobilePositions();
    initNavHighlighting();
    initSequenceReveal();
    initMaps();
    initImmersives();
    startScrollLoop();
  });
})();
