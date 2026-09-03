import { escapeHtml, htmlToPlainText } from "./escape.js";

let mapIdCounter = 0;
function nextMapId() {
  mapIdCounter += 1;
  return `map-${mapIdCounter}`;
}

// Used when a webmap's basemap has no raster tile layer at all (Esri
// vector-tile basemaps): a neutral raster canvas so the story's data still
// sits on a map — dark if the original basemap was a dark one. The
// localizer warns about the substitution.
function fallbackTileLayers(baseMap) {
  const dark = /dark|night|imagery/i.test(baseMap?.title ?? "");
  const variant = dark ? "Dark" : "Light";
  return ["Base", "Reference"].map((part) => ({
    urlTemplate: `https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_${variant}_Gray_${part}/MapServer/tile/{z}/{y}/{x}`,
    attribution: `World ${variant} Gray ${part} &mdash; Esri`,
  }));
}

function buildTileLayers(baseMap) {
  const raster = (baseMap?.baseMapLayers ?? [])
    .filter((layer) => layer.url && layer.layerType === "ArcGISTiledMapServiceLayer")
    .map((layer) => ({
      // Esri's tiled map service REST export is z/row/column, not the
      // standard XYZ order Leaflet's template defaults to.
      urlTemplate: `${layer.url}/tile/{z}/{y}/{x}`,
      attribution: layer.title ? `${escapeHtml(layer.title)} &mdash; Esri` : "Esri",
    }));
  return raster.length > 0 ? raster : fallbackTileLayers(baseMap);
}

function pct(ratio) {
  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 10000) / 100}%`;
}

/**
 * `image.sizes` (Phase A's localizer) holds the responsive variants that
 * actually landed on disk, largest first, each with a real pixel width —
 * emit them as a `srcset` so a narrow viewport doesn't pay for the 2048px
 * download. Only ever produced for background images with more than one
 * localized variant; block images (a single file each) never have one.
 */
function srcsetAttr(sizes) {
  const usable = (sizes ?? []).filter((size) => Number.isInteger(size.width) && size.width > 0);
  if (usable.length < 2) return "";
  return ` srcset="${usable.map((size) => `${escapeHtml(size.url)} ${size.width}w`).join(", ")}" sizes="100vw"`;
}

/**
 * A full-bleed background image honoring the author's `placement`
 * (docs/polish.md §1.6): `fill` keeps the chosen focal point in view while
 * covering the box; `fit` letterboxes the whole image over the builder's
 * sampled edge color. Shared by hero sections and immersive views.
 *
 * `options.mobilePos` (rare — no reference story sets it) is Cascade's
 * narrow-viewport override of the horizontal crop only; the desktop
 * position is baked into the `style` attribute as a graceful no-JS
 * fallback, and `data-pos-x`/`data-pos-y`/`data-mobile-pos` let site.js
 * swap just the X component in and out at the 767px breakpoint.
 */
export function renderBackgroundImage(image) {
  if (!image?.url) return "";
  // See src/render/blocks.js — captions are pre-authored HTML, so a
  // plain-text alt needs its markup/entities stripped first.
  const alt = escapeHtml(htmlToPlainText(image.caption));
  const placement = image.options?.placement;
  const src = escapeHtml(image.url);
  const srcset = srcsetAttr(image.sizes);
  const mobilePos = image.options?.mobilePos;

  if (placement?.type === "fit") {
    const color = placement.fit?.color ? `background-color:${escapeHtml(placement.fit.color)};` : "";
    const mobileAttrs = mobilePos ? ` data-mobile-pos="${escapeHtml(mobilePos)}" data-pos-x="50%" data-pos-y="50%"` : "";
    return `<div class="background-fit" style="${color}"><img class="background-image" src="${src}"${srcset} alt="${alt}" loading="lazy"${mobileAttrs}></div>`;
  }

  const posX = placement?.type === "fill" ? pct(placement.fill.x) : "50%";
  const posY = placement?.type === "fill" ? pct(placement.fill.y) : "50%";
  const styleAttr = placement?.type === "fill" ? ` style="object-position:${posX} ${posY};"` : "";
  const mobileAttrs = mobilePos ? ` data-mobile-pos="${escapeHtml(mobilePos)}" data-pos-x="${posX}" data-pos-y="${posY}"` : "";
  return `<img class="background-image" src="${src}"${srcset} alt="${alt}" loading="lazy"${styleAttr}${mobileAttrs}>`;
}

function layerKey(layer, index) {
  return layer.id != null ? String(layer.id) : `layer-${index}`;
}

/**
 * A Leaflet map container plus its embedded config. `viewStates` lists the
 * immersive views this one map instance serves, each with that view's
 * layer visibility (already merged from the webmap defaults and the view's
 * overrides by the localizer) and optional explicit extent — the client
 * toggles between them as the reader scrolls rather than building one map
 * per view.
 */
export function renderMapContainer(background, viewStates) {
  if (background.unavailable) {
    return `<div class="background-unavailable" role="note">
  <p>The interactive map for this section is no longer available (the source map data has been deleted, moved, or made private since this story was archived).</p>
</div>`;
  }

  const mapId = nextMapId();
  const known = new Map();
  for (const { background: bg } of viewStates) {
    (bg.layers ?? []).forEach((layer, index) => {
      if (!layer.dataFile) return;
      const key = layerKey(layer, index);
      if (!known.has(key)) known.set(key, { key, title: layer.title ?? null, dataFile: layer.dataFile });
    });
  }

  const views = {};
  for (const { index, background: bg } of viewStates) {
    views[index] = {
      visible: (bg.layers ?? [])
        .map((layer, i) => ({ layer, key: layerKey(layer, i) }))
        .filter(({ layer, key }) => layer.visible && layer.dataFile && known.has(key))
        .map(({ key }) => key),
      extent: bg.extent ?? null,
    };
  }

  const config = {
    tileLayers: buildTileLayers(background.baseMap),
    // The webmap's saved extent ([[xmin, ymin], [xmax, ymax]] lon/lat) —
    // what the original viewer framed the map with when it first showed.
    initialExtent: background.initialExtent ?? null,
    layers: [...known.values()],
    views,
    interaction: background.interactionEnabled !== false,
  };
  const interactionClass = config.interaction ? "" : " interaction-disabled";
  return `<div class="storymap-map${interactionClass}" id="${mapId}" role="img" aria-label="Interactive map"></div>
<script type="application/json" data-map-config-for="${mapId}">${JSON.stringify(config)}</script>`;
}

/**
 * Render a normalized background node to the HTML that fills a hero/cover
 * or sequence/credits section, plus (for a `color` background) the inline
 * style the caller should apply to the containing element. Immersive views
 * go through src/render/immersive.js instead, which shares these pieces.
 */
export function renderBackground(background) {
  if (!background) return { html: "", style: "" };

  switch (background.type) {
    case "color":
      return { html: "", style: `background-color:${escapeHtml(background.value ?? "#000")};` };

    case "image":
      return { html: renderBackgroundImage(background.image), style: "" };

    case "webmap":
      return { html: renderMapContainer(background, [{ index: 0, background }]), style: "" };

    default:
      return {
        html: `<div class="background-unsupported" role="note">
  <p>This story included a "${escapeHtml(background.sourceType ?? "unknown")}" background that this migration tool doesn't understand yet.</p>
</div>`,
        style: "",
      };
  }
}
