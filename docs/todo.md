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

## Phase 5 — Render the new static site ✅

- [x] Build fresh, semantic, accessible HTML/CSS from the manifest — not a
      reskin of Cascade's markup. Target: correct landmarks/heading order,
      keyboard-navigable scroll/immersive interactions, `prefers-reduced-motion`
      support, alt text carried over from Esri media captions where present.
- [x] Recreate the core Cascade *interactions* called out in the README aim:
      cover section, scroll-driven immersive narrative panels, in-page
      navigation/bookmarks — using modern vanilla JS (IntersectionObserver
      instead of whatever legacy scroll-binding Cascade used).
  - [x] Cross-check the rendered result against the original by running the
        story through `Storymaps-Cascade-1.23.0/` per `docs/use-cascade.md`,
        side by side, for each of the 3 example stories.
- [x] Map sections render via the vendored map library reading the local
      GeoJSON snapshots; basemap tiles are the one live network dependency
      (see Known limitations). A tile-provider config option was **not**
      added — no real need for it surfaced, and it's easy to add later
      (`src/render/background.js`'s `buildTileLayers`).
- [x] Inject `site`/`base` CLI options into `<base href>`, canonical/OG tags,
      and any absolute internal links so the output folder is portable to
      the documented deployment path. **Skipped the literal `<base href>`
      tag** — every asset/script/data reference is already a relative path,
      which makes the output folder portable to *any* deployment path with
      zero configuration (more robust than requiring `--base` to be correct
      in advance); `site`/`base` are only used to build absolute canonical/OG
      URLs when `--site` is given.
- [x] Generate a minimal `robots.txt`/meta noindex by default (matches the
      original template's disabled-SEO default) unless told otherwise. (No
      flag to invert this exists yet — add one if a real story needs to be
      indexable.)

Implementation: `src/render/{escape,blocks,background,sections,site}.js`
build the HTML from the manifest; `src/render/assets/{site.css,site.js}` are
static files copied as-is into every output (not templated — all per-story
theming goes through a small `<style>` block of CSS custom properties, and
all per-map data goes through embedded `<script type="application/json">`
config blocks that `site.js` reads at runtime). Immersive scrollytelling uses
a `position: sticky` background + negative-margin-overlaid floating panels,
a standard CSS-only technique — no scroll-linked JS/animation library needed.

Findings from actually rendering + visually verifying all 3 example stories
(via a headless-Chromium screenshot harness driven over the DevTools
Protocol — see below; not just reading the generated HTML):

- **The original Cascade viewer is *already* broken for at least one of the
  3 example stories.** Running "Closure of Syringa" through
  `Storymaps-Cascade-1.23.0/` for the side-by-side comparison, its cover
  rendered fine, but its first map section now shows an ArcGIS "Please sign
  in to ArcGIS Online" prompt instead of the map — Esri has apparently
  tightened anonymous access to the map-loading path since the story was
  authored. storymap-archiver's own output renders that same map (data +
  basemap tiles) with no login, from the GeoJSON snapshotted in Phase 4.
  This isn't a hypothetical: the source is actively rotting *now*, which is
  the whole reason this tool exists.
- **A real caption-escaping bug**, caught only by looking at a screenshot
  (grep/DOM-dump checks didn't show it): Esri's `caption` fields on images
  are rich-text-editor output — the same trust level as a `text` block's
  `html` — not plain strings. Escaping them for display produced literal
  `&nbsp;` text in captions instead of a space. Fixed in
  `src/render/blocks.js`/`background.js`: captions render as trusted HTML
  (matching block text), and a new `htmlToPlainText()` helper
  (`src/render/escape.js`) derives a real plain-text `alt` from them.
  Regression-tested in `test/escape.test.js` against the actual source
  caption that exposed it.
- Added a scroll-down chevron to hero (cover/title) sections after noticing
  the original had one and the migrated version didn't — a cheap, direct
  match to the "recreate the core interactions" aim.
- **Font vendoring was deliberately skipped.** All 3 example stories use the
  same theme ("Open Sans" / "Noto Serif"), and those exact webfont files
  happen to already be vendored locally in `Storymaps-Cascade-1.23.0/resources/fonts/`
  — vendoring them into new output too was considered but cut for scope; the
  theme's own fallback stacks (already captured in Phase 3's manifest) give
  a readable, correctly-themed system-font result instead. Worth revisiting
  if pixel-level typographic fidelity ever matters.
- **Visual verification method**: no browser automation library is a
  dependency of this project (nor should it be, for a CLI tool), so
  verification here used a throwaway Node+CDP script (native `WebSocket`,
  Node ≥ 22) driving a system-installed headless Chromium — real navigation,
  real `window.scrollTo`, real screenshots, not just HTML/DOM inspection.
  That script isn't part of the repo; it was scratch tooling for this
  session. A real regression suite for rendered *visuals* is out of scope
  for now (see Phase 7) but the technique is worth remembering if one is
  ever wanted.

## Phase 6 — CLI wiring ✅

- [x] `pnpm migrate --appid <id> [--site <url>] [--base </path>] [--portal <host>]`
      runs fetch → normalize → localize → render, writing to
      `output/<base-or-slugified-title>/`. (Already wired incrementally as
      each earlier phase landed — nothing new needed here.)
- [x] Clear progress output per phase; a final summary listing any warnings
      (unhandled section types, failed asset downloads, external embeds kept).
      Previously each phase printed its own warnings inline as it found them;
      `bin/migrate.js` now collects every warning (tagged by phase) and
      prints one consolidated list at the end instead, with a short "N
      warning(s), see summary below" note left in place during each phase so
      it's still clear *when* something went wrong, not just that it did.
      Exit code stays 0 on a run with warnings (they're a degraded-but-usable
      result, not a failure) — see the message telling the user to review
      them before publishing.
- [x] `pnpm dev [--dir <output-folder>]` serves the chosen output folder
      statically on localhost, honoring the folder's `base` path so relative
      links behave the same as in production. Built in Phase 1; needed no
      changes — Phase 5's decision to use only relative paths (never a
      literal `<base href>`) means the output folder behaves identically
      whether it's served from `/` in dev or `/loggerettes` in production,
      with no base-path-aware serving logic required at all.
- [x] `--help` documents all options; keep in sync with README. Updated
      `README.md`'s "Options" and "Migrating a story" sections, which had
      drifted (missing `--portal`, no actual command syntax, didn't mention
      that `--appid` also accepts an old Cascade URL) — now match `--help`
      output for both `storymap-migrate` and `storymap-dev`.

## Phase 7 — Testing & validation ✅

- [x] Fixture-based tests using cached raw JSON for the 3 README example
      appids (checked into `test/fixtures/`, refreshed manually — don't hit
      live ArcGIS in CI). Already in place since Phase 3
      (`test/normalize.test.js`).
- [x] End-to-end smoke test: run the full pipeline against fixtures, assert
      the manifest and output folder contain everything expected (no dropped
      sections, all asset references resolve to files that exist on disk).
      Added `test/pipeline.test.js`: it reuses the real "Aly - Dairy Drought"
      fixture (relabeled to a fake, cache-isolated appid via a global
      string-replace so it never touches `.cache/` for the real story or the
      live API) with `globalThis.fetch` mocked, then runs the *real*
      `getItem`/`getItemData`/`normalizeStory`/`localizeAssets`/`renderSite`
      — the same functions `bin/migrate.js` calls — end to end into a temp
      directory. Asserts every image reference in the final manifest is a
      relative `assets/images/...` path that actually exists on disk, all
      expected output files are present, and there's no dropped/`unknown`
      section. This is also the first automated test of `src/assets/*`
      (download/localize) at all — Phase 4 was validated live but had no
      regression coverage until now.
- [x] Manual accessibility pass (e.g. axe DevTools or `pa11y`) on rendered
      output for at least one example story, per the "improve accessibility"
      aim. Ran `pa11y` (WCAG2AA, `htmlcs` runner) via `pnpm dlx` — a one-off
      tool, not added as a project dependency — against the rendered
      "Closure of Syringa" output (the richest example: cover, chapter
      dividers, narrative panels, live maps, credits). **Zero errors.**
      Warnings broke down into 3 categories, each actually investigated
      rather than mass-ignored:
      - **Real, fixed**: `.story-nav` used `opacity: 0.6` on links over a
        translucent, blurred nav background, and `.immersive-panel` used
        `rgba()` backgrounds over a live, pannable/zoomable map — both mean
        contrast can't be *guaranteed* against arbitrary content underneath
        (WCAG 1.4.3, checked via the `G18.Alpha` technique). Nav is now a
        solid, opaque background with solid-color (not opacity-based) text.
        Panel backgrounds went from 0.92/0.85 alpha to 0.97/0.95 — a
        judgment call, not fully opaque: at 0.97 the practical contrast risk
        is negligible, and full opacity would lose the intentional
        "floating over the scene" look; pa11y still flags any alpha < 1 on
        principle; this is a considered tradeoff, not an oversight. Also
        fixed a genuine cascade bug while at it: `leaflet.css` loads *after*
        `site.css`, so an equal-specificity Leaflet rule
        (`.leaflet-container a`) was silently winning over an attribution
        link color override — needed `!important` to actually apply an
        override against a vendored stylesheet loaded later in the page.
      - **Third-party, not ours to fix**: Leaflet's own zoom-control markup
        triggers a generic "mark up as a list" notice, and its small
        attribution "flag" icon has its own low-contrast SVG fill — both are
        inside the vendored library's own DOM/CSS, not something to patch
        without forking Leaflet.
      - **Source-data limitation, not a renderer defect**: ~208 `<img>`
        elements render with `alt=""`, because the *original story* never
        provided caption text for them (confirmed directly against the
        fixture — most of these images have no `caption` field at all).
        `alt=""` is the WCAG-correct choice when no text alternative exists;
        inventing alt text would misrepresent Esri's original content. This
        is a real, honest gap in what can be automatically recovered from a
        classic Story Map, not something to silently paper over.
- [x] Manually re-run all 3 README examples end-to-end before calling v1
      done — clean runs, zero unexpected warnings (Syringa's 8 warnings are
      the already-understood, disclosed webmap/token/link-rot cases from
      Phase 4), full test suite green (48 tests).

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
