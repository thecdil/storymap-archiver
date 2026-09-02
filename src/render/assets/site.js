(function () {
  "use strict";

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function initNavHighlighting() {
    var links = Array.prototype.slice.call(document.querySelectorAll(".story-nav a"));
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

  function initMap(container) {
    var configEl = document.querySelector('script[data-map-config-for="' + container.id + '"]');
    if (!configEl || typeof L === "undefined") return;

    var config = JSON.parse(configEl.textContent);
    var map = L.map(container, { scrollWheelZoom: false });

    config.tileLayers.forEach(function (tile) {
      L.tileLayer(tile.urlTemplate, { maxZoom: 19, attribution: tile.attribution || "" }).addTo(map);
    });

    var group = L.featureGroup().addTo(map);
    var visibleLayers = (config.layers || []).filter(function (layer) {
      return layer.visible && layer.dataFile;
    });

    var loads = visibleLayers.map(function (layerConfig) {
      return fetch(layerConfig.dataFile)
        .then(function (res) {
          return res.json();
        })
        .then(function (data) {
          var geojson = data.geojson || data;
          L.geoJSON(geojson, {
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
          }).addTo(group);
        });
      // a rejected fetch/parse is left to Promise.allSettled below — one
      // bad layer shouldn't block the rest of the map.
    });

    Promise.allSettled(loads).then(function () {
      if (group.getLayers().length > 0) {
        map.fitBounds(group.getBounds(), { padding: [20, 20], maxZoom: 15 });
      } else {
        map.setView([20, 0], 1);
      }
    });
  }

  function initMaps() {
    document.querySelectorAll(".storymap-map").forEach(initMap);
  }

  document.addEventListener("DOMContentLoaded", function () {
    initNavHighlighting();
    initMaps();
  });
})();
