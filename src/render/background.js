import { escapeHtml, htmlToPlainText } from "./escape.js";

let mapIdCounter = 0;
function nextMapId() {
  mapIdCounter += 1;
  return `map-${mapIdCounter}`;
}

function buildTileLayers(baseMap) {
  return (baseMap?.baseMapLayers ?? [])
    .filter((layer) => layer.url && layer.layerType === "ArcGISTiledMapServiceLayer")
    .map((layer) => ({
      // Esri's tiled map service REST export is z/row/column, not the
      // standard XYZ order Leaflet's template defaults to.
      urlTemplate: `${layer.url}/tile/{z}/{y}/{x}`,
      attribution: layer.title ? `${escapeHtml(layer.title)} &mdash; Esri` : "Esri",
    }));
}

/**
 * Render a normalized background node to the HTML that fills a hero/cover
 * or immersive-view's sticky backdrop, plus (for a `color` background) the
 * inline style the caller should apply to the containing element.
 */
export function renderBackground(background) {
  if (!background) return { html: "", style: "" };

  switch (background.type) {
    case "color":
      return { html: "", style: `background-color:${escapeHtml(background.value ?? "#000")};` };

    case "image": {
      if (!background.image?.url) return { html: "", style: "" };
      // See src/render/blocks.js — captions are pre-authored HTML, so a
      // plain-text alt needs its markup/entities stripped first.
      const alt = escapeHtml(htmlToPlainText(background.image.caption));
      return {
        html: `<img class="background-image" src="${escapeHtml(background.image.url)}" alt="${alt}" loading="lazy">`,
        style: "",
      };
    }

    case "webmap": {
      if (background.unavailable) {
        return {
          html: `<div class="background-unavailable" role="note">
  <p>The interactive map for this section is no longer available (the source map data has been deleted, moved, or made private since this story was archived).</p>
</div>`,
          style: "",
        };
      }

      const mapId = nextMapId();
      const config = {
        tileLayers: buildTileLayers(background.baseMap),
        layers: (background.layers ?? [])
          .filter((layer) => layer.dataFile)
          .map((layer) => ({
            title: layer.title,
            dataFile: layer.dataFile,
            visible: Boolean(layer.visible),
          })),
      };
      return {
        html: `<div class="storymap-map" id="${mapId}" role="img" aria-label="Interactive map"></div>
<script type="application/json" data-map-config-for="${mapId}">${JSON.stringify(config)}</script>`,
        style: "",
      };
    }

    default:
      return {
        html: `<div class="background-unsupported" role="note">
  <p>This story included a "${escapeHtml(background.sourceType ?? "unknown")}" background that this migration tool doesn't understand yet.</p>
</div>`,
        style: "",
      };
  }
}
