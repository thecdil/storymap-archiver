# To Do

Implementation plan for `storymap-archiver`: a pnpm-based Node CLI that migrates a
retired Esri Story Map Cascade project (given an `appid`) into a self-contained,
modern static site, plus a dev server to preview the result.

This plan is based on:
- `README.md` (project aims, CLI options, examples)
- `docs/use-cascade.md` (how to view a classic story today)
- `Storymaps-Cascade-1.23.0/` (reference source of the original viewer)
- Live inspection of the ArcGIS Sharing REST API against the three example
  appids in the README (see "Data model findings" below — this is the ground
  truth, since the shipped Cascade app is minified and has no readable templates)

## Data model findings (research notes)

Confirmed by querying the ArcGIS Sharing REST API directly for the three
example appids:

- Item metadata: `GET {portal}/sharing/rest/content/items/{appid}?f=json`
  → title, snippet/description, `accessInformation` (credit), `licenseInfo`,
  thumbnail, owner, access (must be `"public"` for this tool to work without auth).
- Story content: `GET {portal}/sharing/rest/content/items/{appid}/data?f=json`
  → `values.template` (name/version), `values.settings.theme` (colors, fonts),
  `values.sections[]` (the actual story).
- Item-hosted assets: `GET {portal}/sharing/rest/content/items/{appid}/resources?f=json`
  lists files (uploaded images, cropped thumbnails) fetchable at
  `.../resources/{filename}`.
- `{portal}` varies per story: org subdomains (`uidaho.maps.arcgis.com`) and
  `www.arcgis.com` both answer the same public sharing API — the CLI should
  try the org host from the old URL if given, else fall back to `www.arcgis.com`.
- Section types seen across the 3 examples: `cover`, `immersive`, and a final
  title/credits section. `sections[].background.type` seen: `image`, `color`,
  `webmap`. Immersive sections carry `foreground.panels[]` (scrollable text
  blocks, left/right position, theme).
- **Webmap backgrounds are the hard case**: `background.webmap` (or similarly
  named object) references a *separate* ArcGIS **Web Map** item (own appid),
  which is often still live even though the Cascade viewer app is retired.
  Its `operationalLayers[]` are either:
  - inline **Feature Collections** (geometry embedded directly in the webmap
    JSON — trivial to archive), or
  - live **FeatureServer/MapServer** layers referenced by URL (must be queried
    now and snapshotted, since these services are not guaranteed to outlive
    the story either).
  The `baseMap` is a standard Esri/OSM tile service — cannot be meaningfully
  vendored offline in full; see "Known limitations" below.
- Images can be item resources, or absolute external URLs (Unsplash, Flickr,
  Esri CDN) — all need downloading and rewriting to local paths.
- Video (YouTube/Vimeo) is referenced by embed URL, not a downloadable file.
- Only 3 stories were inspected; other section/media subtypes almost
  certainly exist (e.g. swipe/sequence panels, audio, arbitrary iframe embeds).
  The extractor must **fail loudly, never silently**, on anything unrecognized
  (aim: "avoid loss of data").

## Architecture decisions

- Single Node package (not a workspace) — scope doesn't need one.
- Plain modern Node.js (ESM, Node ≥ 18), no TypeScript/build step for the CLI
  itself — keeps the tool small and easy to read/maintain long-term.
- pnpm for dependency management only, per README.
- Output is one self-contained folder per story under `output/<base-slug>/`
  (already reflected in `.gitignore`), copyable directly to a static host.
- Keep a clean separation of concerns:
  1. **Fetch** — talk to ArcGIS REST, cache raw responses.
  2. **Normalize** — convert raw Esri JSON into our own intermediate story
     manifest (`manifest.json`), decoupled from Esri's schema quirks/versions.
  3. **Localize** — download every referenced asset (images, resources,
     queried map data) into the output folder, rewrite manifest URLs to
     relative paths.
  4. **Render** — generate the new static HTML/CSS/JS site from the manifest.
  This lets normalization/rendering be developed and tested against cached
  fixture data without hitting the network every time.

## Proposed project layout

```
bin/
  migrate.js           # CLI entry: extraction + build pipeline
  dev.js                # CLI entry: static preview server
src/
  fetch/
    portal.js           # resolve portal host, sharing REST helpers, retry/backoff
    item.js              # item info + /data + /resources
    webmap.js            # webmap item + operational layer querying (GeoJSON export)
  normalize/
    manifest.js          # raw Esri JSON -> our story manifest schema
    sections/            # one normalizer per section type (cover, immersive, ...)
  assets/
    download.js          # fetch + save binary/text assets, dedupe, content hash
    rewrite.js            # rewrite manifest references to local relative paths
  render/
    site.js               # emits index.html/css/js from manifest
    templates/            # our own modern, accessible markup (not Esri's)
    map.js                 # client-side map viewer (vendored MapLibre/Leaflet + cached GeoJSON)
  cache/
    store.js              # on-disk cache of raw API responses, keyed by appid
test/
  fixtures/                # cached raw JSON for the 3 example appids
  normalize.test.js
  assets.test.js
docs/
  todo.md (this file)
  use-cascade.md
```

## Phase 1 — Project scaffolding

- [ ] `pnpm init`; set `"type": "module"`, Node engine `>=18`.
- [ ] Add `bin` entries in `package.json` for `migrate` and `dev` (or a single
      `storymap-archiver` bin with subcommands).
- [ ] Pick minimal dependencies: an HTTP client (native `fetch` is fine on
      Node 18+, no dependency needed), a CLI arg parser (e.g. `node:util
      parseArgs`, avoid adding a dependency if the built-in suffices), a tiny
      static file server for `dev` (native `http` + a small MIME lookup, or
      one small dependency like `sirv`).
- [ ] Add `.gitignore` entries already present (`output/`, `node_modules/`)
      plus a `.cache/` entry for raw API response caching.
- [ ] Basic `README.md` usage section stays accurate as the CLI takes shape
      (update if flags/behavior diverge from what's documented today).

## Phase 2 — Fetch layer

- [ ] `resolvePortal(oldUrlOrAppid, { portal })`: accept either a bare `appid`
      or a full old Cascade URL (parse `appid` + host from it, per
      `docs/use-cascade.md` examples) to determine the sharing REST base.
- [ ] `getItem(appid)` → item info JSON; hard-fail with a clear message if
      `access !== "public"` or the item 404s (private/deleted items are out
      of scope for v1 — note this in README).
- [ ] `getItemData(appid)` → the `values` story JSON.
- [ ] `listItemResources(appid)` / `getItemResource(appid, filename)`.
- [ ] `getWebmapLayers(webmapItemId)` → normalized list of operational layers
      with type (`feature-collection` vs `feature-service`), geometry/renderer,
      popup template, and either inline features or a queryable URL.
- [ ] `queryFeatureLayer(url)` → paginate through `.../query?f=geojson` using
      `resultOffset`/`exceededTransferLimit` until all features are retrieved.
- [ ] Raw-response caching in `.cache/<appid>/...` so re-running the pipeline
      during development (and any future re-migration) doesn't hammer ArcGIS
      and preserves a point-in-time copy of the raw source data itself — this
      raw cache **is** the primary "avoid loss of data" artifact and should be
      easy to keep/export even before rendering succeeds.
- [ ] Network error handling: retries with backoff for transient failures,
      but a clear terminal error (not a silent skip) for 404/403 on anything
      the story references.

## Phase 3 — Normalize into a story manifest ✅

- [x] Define our own manifest schema (title, description, credit/license,
      theme colors/fonts, ordered list of sections with a small closed set of
      normalized types: `cover`, `immersive`, `panel`, `credits`, `map`, ...).
- [x] Write one normalizer per observed Esri section/background/media type,
      starting with the confirmed set: `cover`, `immersive` w/ `image`/`color`/
      `webmap` backgrounds, image media, and the trailing credits section.
- [x] Add a **strict fallback**: any section/background/media `type` not
      explicitly handled must produce a visible warning in the CLI output and
      a placeholder marker in the manifest (never drop it silently) — expect
      to extend normalizers as real-world stories surface new types beyond
      the 3 examples.
- [x] Unit test normalizers against cached fixtures for all 3 example appids.

Findings/deviations from the original plan:

- Real section types observed (via cached raw JSON, not just the earlier
  paraphrased API summaries) are `cover`, `title`, `sequence`, `immersive`,
  `credits` — there is no bare `panel`/`map` type; `sequence` is the linear
  narrative panel, and `immersive` sections carry their own `views[]`, each
  with its own `background` (`color`/`image`/`webmap`) and `foreground.panels[]`.
  A `webmap` background only ever appears inside an immersive view, holding a
  `webmapId` plus per-view layer visibility overrides (`layerOverrides`) — the
  actual webmap layer data is fetched once per `webmapId` (Phase 2) and shared
  across every section/view that references it.
- Block types observed inside `sequence`/`immersive` panels: `text`, `image`,
  `image-gallery`. `credits` sections have their own panel-level types
  (`blocks`, `credits`) — the inner shape of a populated `credits` array
  entry has not been observed (empty in all 3 examples), so it's passed
  through verbatim rather than guessed.
- Implementation lives in `src/normalize/{image,blocks,background,manifest}.js`
  rather than one file per section type under `src/normalize/sections/` — the
  background/block/image normalizers are shared by every section kind, so
  splitting by section type would have fragmented that shared logic for no
  benefit at this size.
- All 3 example stories normalize with **zero warnings**, confirmed both by
  `test/normalize.test.js` (fixtures checked into `test/fixtures/<appid>/`)
  and by re-running `bin/migrate.js` live. Synthetic tests also confirm an
  unrecognized section/block type is flagged (warning + `kind: "unknown"`
  passthrough) rather than silently dropped.

## Phase 4 — Asset localization ✅

- [x] Download every item resource and every external image URL referenced
      by the manifest into `output/<base>/assets/images/...`; rewrite manifest
      to relative paths.
- [x] For `webmap` sections: write each layer's snapshotted features as local
      `.geojson` files under `output/<base>/assets/data/...`; keep renderer
      metadata (symbology/popup fields) alongside so the client can restyle
      without needing the live service.
- [x] Vendor the chosen client-side map library into `assets/vendor/` at
      build time instead of loading from a CDN, in keeping with the "no
      external dependencies" aim. **Chose Leaflet, not MapLibre GL** — every
      basemap observed across the 3 reference stories is a plain raster
      ArcGIS Tiled Map Service, not a vector tile style, so Leaflet's
      `L.tileLayer` is a direct fit and the library is far smaller.
- [ ] Video embeds (YouTube/Vimeo): cannot be self-hosted from this API.
      Deferred — no example story has actually surfaced a video block yet
      (Phase 3's normalizer already flags one loudly as `kind: "unknown"`
      rather than dropping it, so nothing is lost in the meantime; see
      Known limitations).
- [x] Skip re-downloading assets already present: item-resource and external
      images/layers are both read through the same on-disk cache as Phase 2
      (`src/cache/store.js`), keyed by filename or a hash of the URL, so a
      re-run only re-fetches from ArcGIS what isn't already cached locally.

Findings/deviations from the original plan, all discovered by actually
running the full pipeline against the live "Closure of Syringa" example
(the only one of the 3 with real `webmap` sections) rather than by
inspection alone:

- **Esri JSON → GeoJSON needs a real dependency, not hand-rolled code.**
  Converting Esri polygon rings to GeoJSON correctly (ring winding order,
  grouping holes with their outer ring) is a well-known, easy-to-get-subtly-
  wrong problem; used Esri's own `@esri/arcgis-to-geojson-utils` rather than
  reimplementing it. It only handles geometry *shape*, not reprojection.
- **Web Mercator reprojection was missing and is required.** Inline "Feature
  Collection" layers embedded directly in a webmap's JSON carry raw,
  unprojected coordinates (observed wkid 102100). A live layer query with
  `f=geojson` *is* reprojected to WGS84 by the ArcGIS REST API itself, but
  inline features are not — `src/assets/geometry.js` reprojects Web Mercator
  (102100/102113/3857) to WGS84 by hand, verified against a real feature
  whose attributes happened to carry both its raw geometry and its true
  lon/lat independently (exact match to 6 decimal places). Anything in an
  unrecognized spatial reference is left alone and flagged with a warning
  rather than silently mis-plotted.
- **A single unfiltered "reference" layer can be enormous.** One webmap in
  the Syringa story included a *nationwide* Census block-group layer
  (217,178 features) purely for visual context, with no server-side
  `definitionExpression` to scope it down — the first live run hung
  attempting to page through all of it. Added a `MAX_FEATURES_PER_LAYER`
  safety cap (5000; comfortably above nationwide county-level data at
  ~3,200 features) in `src/fetch/webmap.js` — a layer over the cap is
  skipped with a warning rather than downloaded. This is a genuine,
  disclosed scope tradeoff, not a bug fix; revisit the threshold (or make it
  a CLI flag) if a real story needs a bigger single layer.
- **Failures are common and must be scoped to the smallest unit possible.**
  Live-testing surfaced, in one story: a layer needing an ArcGIS subscriber
  token it doesn't have (`499 Token Required`, e.g. Living Atlas content), a
  referenced webmap item that no longer exists (`400` — deleted/private), and
  a layer whose underlying feature service URL has itself rotted
  (`400 Invalid URL`, since renamed/removed at the source, independent of
  this project). Every one of these is now caught at the narrowest possible
  scope (per-layer, or per-webmap if the whole item is unreachable) and
  turned into a warning + a degraded-but-present manifest node
  (`background.unavailable: true` for a whole dead webmap, a layer entry
  with no `dataFile` for one blocked/oversized layer) rather than aborting
  the migration or silently omitting the section.
- Added an explicit per-request timeout (`AbortSignal.timeout`, 20s) to
  `fetchWithRetry` in `src/fetch/portal.js` — with none, a slow/unresponsive
  service could hang the whole run indefinitely with no feedback.
- Implementation lives in `src/assets/{download,vendor,geometry,localize}.js`
  rather than the originally proposed `download.js`/`rewrite.js` split —
  rewriting manifest references is inherently interleaved with downloading
  (the local path is only known once the download completes), so a separate
  "rewrite" module would just pass the same url→path map back and forth.

## Phase 5 — Render the new static site

- [ ] Build fresh, semantic, accessible HTML/CSS from the manifest — not a
      reskin of Cascade's markup. Target: correct landmarks/heading order,
      keyboard-navigable scroll/immersive interactions, `prefers-reduced-motion`
      support, alt text carried over from Esri media captions where present.
- [ ] Recreate the core Cascade *interactions* called out in the README aim:
      cover section, scroll-driven immersive narrative panels, in-page
      navigation/bookmarks — using modern vanilla JS (IntersectionObserver
      instead of whatever legacy scroll-binding Cascade used).
  - [ ] Cross-check the rendered result against the original by running the
        story through `Storymaps-Cascade-1.23.0/` per `docs/use-cascade.md`,
        side by side, for each of the 3 example stories.
- [ ] Map sections render via the vendored map library reading the local
      GeoJSON snapshots; basemap tiles are the one live network dependency
      (see Known limitations) with a config option to swap tile providers.
- [ ] Inject `site`/`base` CLI options into `<base href>`, canonical/OG tags,
      and any absolute internal links so the output folder is portable to
      the documented deployment path.
- [ ] Generate a minimal `robots.txt`/meta noindex by default (matches the
      original template's disabled-SEO default) unless told otherwise.

## Phase 6 — CLI wiring

- [ ] `pnpm migrate --appid <id> [--site <url>] [--base </path>] [--portal <host>]`
      runs fetch → normalize → localize → render, writing to
      `output/<base-or-slugified-title>/`.
- [ ] Clear progress output per phase; a final summary listing any warnings
      (unhandled section types, failed asset downloads, external embeds kept).
- [ ] `pnpm dev [--dir <output-folder>]` serves the chosen output folder
      statically on localhost, honoring the folder's `base` path so relative
      links behave the same as in production.
- [ ] `--help` documents all options; keep in sync with README.

## Phase 7 — Testing & validation

- [ ] Fixture-based tests using cached raw JSON for the 3 README example
      appids (checked into `test/fixtures/`, refreshed manually — don't hit
      live ArcGIS in CI).
- [ ] End-to-end smoke test: run the full pipeline against fixtures, assert
      the manifest and output folder contain everything expected (no dropped
      sections, all asset references resolve to files that exist on disk).
- [ ] Manual accessibility pass (e.g. axe DevTools or `pa11y`) on rendered
      output for at least one example story, per the "improve accessibility"
      aim.
- [ ] Manually re-run all 3 README examples end-to-end before calling v1 done.

## Known limitations / open decisions to revisit

- **Basemap tiles can't be fully self-contained.** Vendoring a global raster/
  vector tileset offline isn't feasible; the generated site will depend on a
  live tile provider (Esri or OSM) for map backgrounds. This is a deliberate,
  documented exception to the "no external dependencies" aim — everything
  else (data, images, map library code) is local.
- **Video embeds stay external** (YouTube/Vimeo iframes) — no API exists here
  to download the underlying video file legitimately.
- **Private/secured stories are out of scope for v1** — only public items are
  supported, matching `docs/use-cascade.md`'s stated assumption.
- **Only 3 stories' worth of section/media types have been verified.** Treat
  the normalizer's strict "unknown type → warn + placeholder" behavior as
  load-bearing, not optional, until more stories have been migrated and the
  type coverage is proven out.
- Live webmap feature services referenced by a story may themselves go away
  later (they're not part of the retired Cascade product but are still
  someone's ArcGIS Online content). Snapshotting their data at migration time
  (Phase 4) is what makes the archive durable — don't add a "live query"
  fallback mode that would undermine that.
