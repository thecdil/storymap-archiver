# Polish: recreating the Cascade reading experience

Implementation plan for making `storymap-archiver` output *feel* like the
original Esri Story Map Cascade viewer — the scroll-driven "scrollytelling"
presentation where backgrounds stay pinned while narrative panels fade in
over them, backgrounds cross-fade or swipe between views, and media eases in
as it enters the viewport.

This plan is based on reading the shipped viewer in
`Storymaps-Cascade-1.23.0/app/viewer-min.{js,css}` (minified, but the CSS
rules, Handlebars templates, and scroll handlers are recoverable) and on the
three cached reference stories in `test/fixtures/`. Every number quoted below
(durations, widths, thresholds) was pulled from that source, not guessed.

Companion docs: `docs/todo.md` (phases 1–7, the pipeline that exists today)
and `docs/use-cascade.md` (running the original viewer for side-by-side
comparison).

## 1. What the original actually does

### 1.1 Page chrome

- **Header** (`.story-header`): `position: fixed`, 50px tall, black,
  `z-index: 999`, containing the story title (item title, 2.1em, single line
  with ellipsis), an optional logo, an optional link (`settings.header.link`
  → `{url, title}`), a share button (`settings.header.social.enabled`), and
  the bookmarks list. While the viewport is still within the cover
  (`scrollTop <= windowHeight - 90`), the header is **compact**: transparent
  background, no shadow, title hidden (`opacity: 0`), bookmarks hidden.
  Past the cover it becomes solid black with a 1s background transition and
  the title fades in over 1s.
- **Progress bar** (progress.js "blue" theme): a 2px `#3498db` bar pinned at
  the very top, width = `(scrollTop + windowHeight) / storyHeight`.
- **Bookmarks**: only sections with `section.bookmark.enabled === true` are
  listed, using `bookmark.title` (a ≤20-char label the author typed). In all
  three reference stories **no bookmark is enabled** — so the original shows
  no in-page navigation at all. Today's output invents a nav from cover/title
  headings; that's a deviation (see §5).
- **Scroll invite** on the cover: a 130×52px pulsing chevron image
  (`blinker` keyframes, 2.5s infinite) that scrolls to section 1 on click.
- Body is 14px `open_sans` (weight 300 for the "400" face, 600 for "700"),
  `line-height: 180%`, `color: #4c4c4c`, `overflow-x: hidden`. The theme's
  `bgMain`/`textMain` colors and `titleFont`/`bodyFont` families are applied
  on top; `themeMajor: "dark"` swaps section/background fills to `#0E0E0E`.

### 1.2 Cover (`type: "cover"`, `layout: "cover-1"`)

- `.section-layout-cover { height: 100vh }` and its `.wrapper` is
  `position: fixed; top: 0; height: 100%` — the cover is **pinned** and every
  later section scrolls *over* it. When it's no longer the active section it
  gets `visibility: hidden`.
- Foreground is vertically centered, white, `text-shadow: 0 0 8px
  rgba(0,0,0,.95)`, shifted up 50px. Title `7em` (5em ≤1200px, 2.7em on
  mobile), subtitle `margin-top: 30px` (1.7em ≤1200px, 1.1em mobile).
- `foreground.options.titleStyle` `{ shadow, text, background }` is applied
  to both cover and title sections and to the immersive global title:
  - `background: "light"` → wrapper gets `rgba(255,255,255,.75)` box,
    `padding: 20px 35px` on the cover (10px 30px elsewhere), `min-width:
    300px`; `"dark"` → `rgba(0,0,0,.75)`; `null` → no box.
  - `text: "dark"` → `color: #000` + `text-shadow: 0 0 8px rgba(255,255,255,.95)`;
    `"light"` → white text.
  - `shadow: false` → `text-shadow: none`.
- The cover style is chosen by `CoverStyleFactory`; with `options: {}` (all
  three examples) it's `CoverStatic`: **no** entrance animation and **no**
  scroll-linked effect. (The other styles — scale, blur, delay, curtain,
  partial-page, blend-header — exist in the code but are only reachable via
  a `?coverStyle=` URL parameter or unreleased builder options. Not needed.)

### 1.3 Title (`type: "title"`, `layout: "title-regular"`)

This is a **short banner band, not a full-screen hero** — today's output
gets this wrong.

- `section.options.size` picks the band height: `small` → 90px, `medium`
  (the default when absent) → 200px, `large` → 400px. The background image is
  `background-size: cover` with the `placement` crop (§1.6) and no parallax.
- Title text (`.fg-title`): 52px `open_sans`, `line-height: 105%`, white
  with the same 8px black text-shadow, vertically centered, `titleStyle`
  applied as above. Mobile: 34px.
- `foreground.credits` (HTML) is rendered bottom-left at 14px, `opacity:
  .65`.

### 1.4 Sequence (`type: "sequence"`, `layout: "sequence-1"`)

- Full-width white (theme) band; blocks are centered columns:
  `p.block` / `h2.block` **40% width, max 768px**, `font-size: 20px`,
  `line-height: 150%`; `h1.block` 40% / 110%; `blockquote` 35% / max 672px,
  24px `noto_serif`. `.block { margin-top: 30px }`, foreground
  `padding-bottom: 45px`. Tablet (<1025px): 50% width; mobile (<768px):
  90% width, 16px text.
- **Media blocks fade in** (`div.block.bring-in { animation: fade-in-media
  1s }`, starting from `opacity: 0`) when their top is within 100px of the
  viewport bottom, and the class is removed again if the block goes back
  below the viewport (so it re-animates when scrolling back down). Text
  blocks (`p`, `h1`, `h2`, `blockquote`) are **not** animated.
- Image block width comes from `image.options.size`: `small` → 40% (27% if
  portrait), `medium` (default) → 80% (57% portrait), `large` → 100%.
  Caption: 14px `open_sans`, `opacity: .65`, centered, `margin-top: 5px`.
  Image galleries: 80% width, max 1536px, `margin: 30px auto 0`.
- `.first-letter-huge` on a block → 200% drop cap in `#a5a948`.

### 1.5 Immersive (`type: "immersive"`) — the scrollytelling core

DOM shape produced by the Handlebars template (one per section):

```
div.section.section-immersive[data-views = nbViews + 1]
  div.background-title > .background-title-wrapper.text-background > h2.title-text
  div.background-credits
  div.background-filler                      (solid #FFF / #0E0E0E behind everything)
  div.background.background-type-*.transition-<t>   ×  one per *unique* media
  div.background-swipe-trans-extras > .separator-vertical, .separator-horizontal
  div.foreground                            (padding-top: 100vh)
    div.imm-panel.style-*.theme-*.placement-*.size-*.view-transition-*  × one per view
      div.blocksWrapper > div.blocks > (blocks)
```

**Backgrounds**

- All views' backgrounds are stacked in the section; when the section is
  active they are `position: fixed`, full viewport. Exactly one has
  `.active` (opacity 1, visible); the rest are `opacity: 0; visibility:
  hidden; pointer-events: none`.
- A view becomes active when `currentSectionScroll + windowHeight >
  panel.top` for its panel — i.e. as soon as the panel's top edge enters the
  viewport from the bottom, the background behind it switches.
- The switch animates according to `view.transition`
  (the CSS class lives on the *incoming* background):
  - `fade-fast` → `transition: opacity .5s ease-in-out, visibility .5s`
  - `fade-slow` → `1.5s ease-in-out`
  - `none` → instant
  - `swipe-vertical` / `swipe-horizontal` → **scroll-linked**, not timed: the
    incoming background is clipped with `clip: rect(...)` where the reveal
    edge = `windowHeight − 1.3 × scrollWithinView` (vertical) or
    `windowWidth − 1.3 × scrollWithinView / windowHeight × windowWidth`
    (horizontal), plus a 10px inset box-shadow "separator" line at the edge.
- `_applyTransitionRules()` overrides authored values: view 0 is **always**
  `fade-fast`; a view whose media is identical to the previous view's
  (same image URL / same webmap id and layer set) is forced to `none`;
  swipe is only honored between two views of the *same* webmap whose
  visible-layer sets differ (then the map itself is swiped by clipping the
  layer canvases, not by swapping backgrounds).
- The **global title** (`views[0].foreground.title`, `global: true`) is one
  `h2` at `top: 60px`, centered, 36px, white + black shadow, with
  `titleStyle` applied; it fades in (1s) when the section activates and gets
  `hide-title` (opacity 0) while the last view is scrolling off. Only
  `views[0]`'s title is ever read.
- Webmap backgrounds: consecutive views referencing the **same** webmap id
  share **one** map instance; on each view change the viewer just applies
  that view's `layers[]` visibility overrides (and `extent` / `popup` if the
  author set them — none of the reference stories do, but the fields exist).

**Panels**

- `.foreground { padding-top: 100vh }` → the reader sees one full viewport
  of pure background before the first panel arrives.
- `.imm-panel { min-height: 100vh; padding-top: 20px; padding-bottom:
  380px }` — each view is at least a viewport tall plus a 380px "dwell" so
  the background lingers after the panel text ends.
- `.blocksWrapper` is the visible card: `min-width: 250px`, `margin-left:
  30px`, sized by `settings.size`: `small` 28% / max 300px, `medium` 38% /
  max 400px, `large` 48% / max 600px. `settings["position-x"]` →
  `placement-left` (default), `placement-right` (`margin-right: 30px`),
  `placement-center`. Mobile: always centered.
- `.blocks { padding: 15px }`, `font-size: 1.3em; line-height: 160%`.
  `settings.theme`: `white-over-black` → white text on `rgba(0,0,0,.75)`;
  `black-over-white` → black on `rgba(255,255,255,.75)`. `settings.style`:
  `background` (the box) or `text-shadow` (no box, `text-shadow: 0 0 8px`
  black/white instead). Links `#56a5d8`.
- `panel.layout` (also mirrored in `settings.layout`):
  - `scroll-full` (every reference panel): panel is `opacity: 0` until the
    reader has scrolled **5% of a viewport** into that view
    (`viewScroll / windowHeight > 0.05`), then gets `.bring-in` →
    `animation: fade-in-media 1s`. Scrolling back above the threshold
    removes the class so it replays.
  - `scroll-partial`: continuous opacity from the card's position in the
    viewport (top/bottom distances as fractions of `windowHeight`): 0 when
    the card's top is still below 95% of the viewport; ramps 0→1 between
    95%→55%; fully 1 in the middle band; ramps 1→0 as its bottom crosses
    45%→5%; 0 above.
- A panel consisting of a single **empty** text block hides its
  `.blocksWrapper` entirely (background-only view).
- Blocks inside panels are `.bring-in` immediately (no per-block fade;
  the panel as a whole fades).

### 1.6 Image placement (`image.options.placement`)

Applies to cover, title, and immersive image backgrounds
(`.background .image` is a CSS `background-image`, `background-size: cover`,
`background-position: 50% 50%` by default):

- `{ type: "fill", fill: { x, y } }` — the author's focal point as 0–1
  ratios. `findCropDistance` computes the pixel offset so that the focal
  point stays in view; the practical equivalent is
  `background-position: calc(x*100%) calc(y*100%)` with `background-size:
  cover`, or `object-fit: cover; object-position: x% y%` on an `<img>`.
- `{ type: "fit", fit: { color } }` — `background-size: contain`, centered,
  letterboxed with `fit.color` (the builder samples a dominant edge color).
  Very common in "Aly – Dairy Drought" (charts/screenshots as backgrounds).
- `image["mobile-pos"]` (rare) overrides `background-position-x` on phones.
- `image.sizes[]` (Unsplash/Flickr sources) lists width variants; the
  viewer picks the smallest variant whose `longestSide >= bodyWidth − 50`.
  Uploaded item resources have only `url` + `thumbUrl`.

### 1.7 Credits (`type: "credits"`, `layout: "credits-1"`)

Dark band: `background: #323232`, `color: #f8f8f8`, 18px `open_sans`,
`padding: 20px 10px`, blocks column 40% / max 768px, centered.

### 1.8 Breakpoints

`body.mobile-view` when `browserWidth < 768`; `body.tablet-view` when
`< 1025`. Both set `app.isMobileView`, which centers immersive panels and
narrows/widens text columns as noted above.

### 1.9 Fonts

Theme font names are `'open_sans'` and `'noto_serif'` (not the Google
names). Files are already in the repo:

- `Storymaps-Cascade-1.23.0/resources/lib/calcite-bootstrap/fonts/OpenSans-{Light,LightItalic,Semibold,SemiboldItalic}-webfont.woff2` (latin)
  and `resources/fonts/opensans-all/open-sans-all-{300,600}-{normal,italic}.woff2` (latin-ext) — declared as
  `open_sans` weight **400 → Light**, **700 → Semibold**.
- `resources/fonts/noto-serif/{latin,latin-ext,...}/noto-serif-{400,700}-{normal,italic}.woff2` → `noto_serif`.

Licenses: Open Sans (Apache 2.0, `OpenSans-LICENSE.txt` alongside), Noto
Serif (OFL). Both are redistributable in generated output.

## 2. Gap analysis: current output vs. original

| Area | Original | `storymap-archiver` today | Gap |
|---|---|---|---|
| Cover | Pinned (`fixed`), content slides over it; `titleStyle` box/shadow; 7em title | `position: relative` hero, scrolls away; gradient scrim; ignores `titleStyle` | Pinning, title styling |
| Header | Fixed 50px bar, compact→solid on scroll, story title, progress bar, link/logo | Sticky white `.story-nav` of generated headings, no title/progress | Whole component |
| Bookmarks | Only `bookmark.enabled` sections (none in examples) | Nav built from every cover/title | Fidelity |
| Title | 90/200/400px band, 52px title, credits bottom-left | 100vh hero identical to cover | Wrong section shape |
| Sequence | 40%/768px columns, media fade-in, `options.size` widths | 40rem column, no animation, image sizes ignored | Typography, motion, sizes |
| Immersive bg | Stacked, one active, cross-fade `.5s`/`1.5s`/none/swipe | One `sticky` div per view; no cross-fade possible (each view's bg is a separate sticky element) | Engine |
| Immersive panels | 100vh lead-in; per-view ≥100vh + 380px dwell; fade-in at 5%; scroll-partial ramp; size/placement/theme/style classes | Panels centered in a single 100vh flex column per view; opaque `0.97` card; `position`/`theme` only | Layout + motion |
| Global title | Fixed at top 60px, fades with section, `titleStyle` | Rendered inline as an `h2` above the first panel | Placement + motion |
| Webmaps | One map per webmap id per section; per-view layer visibility | One Leaflet map per *view* (re-created), overrides ignored | Reuse + overrides |
| Image crop | `fill` x/y focal point; `fit` + letterbox color | `object-fit: cover` centered | Placement |
| Image size | picks `sizes[]` variant ≥ viewport width | downloads only `image.url` (Unsplash default = 1024w) | Resolution |
| Fonts | vendored `open_sans` / `noto_serif` | system fallbacks | Typography |
| Reduced motion | none | global `animation-duration: 0.001ms` | Keep, but make it targeted |

Normalization currently **drops** the fields that drive all of this:
`section.layout`, `section.options`, `foreground.options.titleStyle`,
`image.options` (size, placement, mobile-pos), `image.sizes`,
`section.bookmark`, `settings.header`, `theme.colors.themeMajor`, and webmap
`extent`/`popup`. `view.transition` and panel `settings` are carried but not
rendered.

## 3. Target architecture

Keep the existing split (normalize → localize → render, static assets copied
verbatim). Add interaction data to the manifest, restructure the immersive
markup so cross-fades are possible, and add one small, dependency-free scroll
engine to `site.js`.

**Principles**

- CSS owns *states* (active/inactive background, `bring-in`, compact header)
  and their timed transitions; JS only flips classes. This keeps the
  `.5s`/`1.5s` fades declarative and reduced-motion-friendly.
- JS owns *scroll-progress* effects that can't be expressed as states:
  swipe clipping, `scroll-partial` opacity, the progress bar. One
  `requestAnimationFrame`-throttled `scroll` listener + `IntersectionObserver`
  for the coarse "which section / which view is active" question.
  (CSS scroll-driven animations — `animation-timeline: view()` — would be the
  pure-CSS answer for the ramps, but Firefox support is still incomplete;
  use them only as a progressive enhancement, if at all.)
- No new runtime dependencies. Leaflet stays the only vendored library.
- Every original behavior that depends on a data field must degrade sanely
  when the field is absent (older stories / other authoring versions).

**Immersive markup (new)**

```html
<section class="immersive" id="…" data-views="3">
  <div class="immersive-stage">                <!-- position: sticky; top: 0; height: 100vh -->
    <div class="immersive-filler"></div>
    <div class="immersive-bg" data-view="0" data-transition="fade-fast">…image/map…</div>
    <div class="immersive-bg" data-view="1" data-transition="fade-slow">…</div>
    <div class="immersive-bg" data-view="2" data-transition="swipe-vertical">…</div>
    <div class="immersive-swipe-edge" hidden></div>
    <h2 class="immersive-title text-background background-light text-dark">…</h2>
  </div>
  <div class="immersive-panels">              <!-- margin-top: -100vh; padding-top: 100vh -->
    <div class="imm-panel layout-scroll-full size-medium placement-left theme-white-over-black style-background" data-view="0">
      <div class="imm-card">…blocks…</div>
    </div>
    …
  </div>
</section>
```

`position: sticky` replaces Cascade's toggling of `position: fixed` — same
visual result, no JS needed to pin/unpin, and it never bleeds into the next
section. All of a section's backgrounds sit in one stage so opacity
cross-fades work. Backgrounds are `<img>` with `object-fit`/`object-position`
(keeps alt text and lazy-loading) rather than CSS `background-image`, except
`fit` placement which needs the letterbox color on the wrapper.

**Cover markup**: same sticky-stage idea (`.hero-cover { position: sticky;
top: 0; height: 100vh }` with the next section given a solid background and
higher stacking) reproduces the "content slides over the pinned cover"
effect without `position: fixed` or `visibility` toggling.

## 4. Phases

Each phase is independently shippable; the order front-loads the changes
that touch the manifest schema (so fixtures/tests settle early) and the
immersive engine (the biggest visible win).

### Phase A — Carry interaction data through the manifest ✅

`src/normalize/*`

- [x] `normalizeImage`: add `options: { size, fitHeight, placement: { type, fill: {x,y} | fit: {color} }, mobilePos }`
      and `sizes: [{ url, width, height, longestSide }]` (sorted largest
      first; empty for item resources). Unknown `placement.type` values are
      kept as `{ type: "unknown", raw }` plus a warning.
- [x] `normalizeCover` / `normalizeTitle`: add `titleStyle` (from
      `foreground.options.titleStyle`, `null` when absent), `layout`, and for
      title `size` (`small|medium|large`, anything else → `medium`).
- [x] `normalizeImmersive`: add `view.title.style`, keep the authored
      `transition` and add `effectiveTransition` from the pure rule helper
      `src/normalize/transitions.js` (`resolveTransitions`,
      `backgroundMediaKey`). Add `panel.layout` (defaulting to
      `scroll-full`) and `panel.isEmpty`.
- [x] Webmap background: `extent` and `popup` passed through (`null` in all
      reference stories).
- [x] Every section: `bookmark: { enabled, title }` and `layout`.
- [x] `meta.header`: `{ logo: {enabled,url,builtin,link}, link: {url,title}, social: {enabled} }`.
      `themeMajor`/`themeContrast` were already inside `meta.theme.colors`.
- [x] `src/assets/localize.js`: background images (cover/title/immersive)
      fetch their largest `sizes[]` variant, which becomes `image.url`
      (with `width`/`height` updated); `image.sizes` is rewritten to the
      localized variants actually on disk, largest first, for a future
      `srcset` — remote variant URLs never survive into the manifest. Block
      images keep the single original file. An enabled external header logo
      is downloaded; the built-in Esri logo path is nulled instead.
- [x] Tests: `test/transitions.test.js` (rule table, 9 cases),
      `test/normalize.test.js` (+7: fixture presentation fields for all 3
      stories, image options/sizes, unknown placement, empty panel +
      bookmark, title size/titleStyle/header), `test/pipeline.test.js`
      (largest variant present on disk, no remote URLs remain). 64 tests
      green; all 3 reference stories still normalize with zero warnings.

Findings while implementing (deviations from the plan text above):

- **`image.options.fitHeight`** exists on block images in all three stories
  (→ Cascade's `.fit-height`, `max-height: 100vh` on the media) and wasn't
  in the plan; now carried as `options.fitHeight`.
- **`section.layout` is not universal**: immersive sections never have one
  (their layout is per-panel) and at least one older sequence section in
  "Closure of Syringa" omits it — it's `null` in the manifest in those
  cases, so don't key rendering on it.
- **The "largest variant" step is sometimes a no-op by design.** In
  "Flunkies and Loggerettes" the author's default `url` for the shared
  title-band background is *already* the 2048px Unsplash variant, so the
  largest equals the original, nothing extra is fetched, and `sizes` ends
  up `[]` (one file, no srcset candidates). "Aly – Dairy Drought" is the
  other case (1024px default, 2048px variant fetched) and is what the
  pipeline test asserts on. Verified by a live run of the Loggerettes story
  (zero warnings) — the Dairy story's live run with real 2048px downloads
  is still worth doing once before Phase F relies on it.
- Transition rules verified against the minified source, one subtlety worth
  restating: between two consecutive views of the *same* webmap only
  `swipe-vertical` is ever authorized (not `swipe-horizontal`, not the
  fades) — everything else collapses to `none`.

### Phase B — Cover, header, progress bar, bookmarks ✅

`src/render/site.js`, `src/render/sections.js`, `src/render/title-style.js`,
`site.css`, `site.js`

- [x] `.story-nav` replaced by `.story-header` (`<header>`, fixed 50px,
      black, `data-has-cover`): logo (enabled + localized only), story title
      as `<a href="#top">`, `<nav class="story-bookmarks">` built only from
      `bookmark.enabled` sections and omitted entirely otherwise, tagline
      link. `compact` while the cover is on screen, using the original's
      exact rule (`windowHeight − scrollTop − 50 >= 40`), toggled from a
      shared rAF-throttled scroll loop in `site.js` that Phase E will reuse.
      Skip-link kept.
- [x] 2px progress bar, `aria-hidden` (decorative).
- [x] Cover: `position: sticky` stage (`100vh`/`100dvh`), 7em/5em/2.7em
      title, 30px subtitle gap, no scrim; `titleStyle` via
      `titleStyleClasses()` (one `.text-background` box wrapping title *and*
      subtitle, exactly like Cascade's template); scroll invite is a real
      `<button>` with an inline-SVG chevron matching the original PNG,
      blinking 2.5s, scrolling to the next section on click.
- [x] Section stacking: `main > section { position: relative; z-index: 1;
      scroll-margin-top: 60px }`; `.sequence`/`.credits` get an opaque
      `--bg-main` default so they cover the pinned cover.
- [x] Title sections use the same `titleStyle` box and get `size-*`
      classes + `.fg-credits`, but are still full-height heroes until
      Phase D.
- [x] Share button skipped, as planned.
- [x] Tests: `test/title-style.test.js` (4), `test/site.test.js` (4, via a
      newly exported `renderDocument`), `test/sections.test.js` reworked
      for bookmarks + cover/title markup. 75 tests green.
- [x] `scripts/screenshot.js` (Phase H's harness, pulled forward): CDP over
      Node's native WebSocket driving system Chromium, `--scroll 0,0.5vh,…`.
      Used to eyeball the Loggerettes story at 1440×900 and 390×844.

Findings:

- **Snap-confined Chromium can't be signalled** from a child-process
  handle (`kill → EACCES`), which orphans the browser. The script now sends
  `Browser.close` over CDP before exiting; that is the reliable path.
- A `.text-background` box is `display: inline-block; max-width: 90%` here
  vs. a block `div` in the original — when a long cover title wraps, both
  produce a ~90%-wide band, so the visible result matches; a short title
  gets a hugging box here, which is arguably what the builder intended.
- Fonts are still system fallbacks (Phase F): the cover title renders in
  the system sans at weight 300, which at 7em reads heavier than
  Cascade's Open Sans Light. Expect the biggest typographic shift when the
  webfonts land.
- Existing `manifest.json` files from before Phase A re-render fine (all
  new fields are optional in the renderer) — no need to regenerate old
  outputs just to get the new header/cover.

### Phase C — Sequence typography and media motion ✅

`src/render/blocks.js`, `src/render/sections.js`, `site.css`, `site.js`.

- [x] Column widths, scoped under `.sequence-content` by tag rather than a
      wrapping container (percentages are relative to the section, not a
      narrowed shared column — `.sequence-content`'s own `max-width` was
      removed for exactly this reason): `p.block`/`h2.block`/`h3.block`
      40%/768px, 20px/150%; `h1.block` 40%/768px, 110%; `blockquote.block`
      35%/672px, 24px body font; every block (text or media) gets a 30px
      `margin-top` (20px on mobile — Cascade doesn't exempt the first
      block, so neither do we); `.first-letter-huge::first-letter` drop
      cap. Tablet (≤1024px): 50%/45%/50% widths. Mobile (≤767px): 90%/80%
      widths, 16/30/20px text.
- [x] Image/gallery blocks (`renderBlock`/`renderImage` now take
      `{ sized, reveal }`): standalone images get `block-size-{small|
      medium|large}` from `image.options.size` (default medium) with the
      40/80/100% widths, `518/1094px` portrait caps (`width < height`),
      `min-width: 170px`; galleries stay at the fixed 80%/1536px Cascade
      uses regardless of size (no reference story sets a per-image size
      inside a gallery, confirmed against all 3 fixtures — matches the
      original, which has no such option either). Captions: 14px, `.65`
      opacity, centered.
- [x] Media fade-in: `renderBlock(block, { reveal: true })` — passed only
      from `renderSequence` — adds `data-reveal="image"` /
      `data-reveal="gallery"` to standalone image/gallery figures (one
      `data-reveal` per gallery, not per photo inside it, matching
      Cascade's per-`div.block` fade). `initSequenceReveal()` in site.js:
      an `IntersectionObserver` with `rootMargin: "0px 0px 100px 0px"`
      adds `.bring-in` on entry; removed only when the element re-enters
      "below the viewport" territory (`boundingClientRect.top >= 0`), so
      scrolling past something upward never re-hides it — ported from
      Cascade's `isNearViewportBottom`/`_loadBlocks`. Text blocks never
      carry `data-reveal` and are never hidden.
- [x] Tests: `test/blocks.test.js` (+5: size default/override/unknown,
      portrait, reveal-only-when-asked, gallery-as-one-unit),
      `test/sections.test.js` (+1: sequence media gets `data-reveal`,
      credits/immersive media sharing the same block renderer does not).
      96 tests green.
- Verified visually (Loggerettes' first sequence, the richest example:
  2 images + 5 paragraphs) at 1440×900 and 390×844 — 40%/80%-width
  columns, left-aligned justified-feeling text, centered captions, full
  reveal on load (page opens already scrolled past them, so the observer
  fires immediately — expected), and correct mobile stacking. Confirmed
  immersive/credits block rendering is untouched (no `data-reveal`, no
  `.sequence-content`-scoped width rules leaking in) since those panels
  never pass `reveal: true` and use their own `.imm-card`/`.credits-content`
  selectors.

Findings:

- The generic (unscoped) `.block-text`/`figure.block-image` rules from
  before this phase are kept as the fallback for contexts that render the
  same block HTML outside a sequence (immersive panels, credits) — only
  `.sequence-content`-scoped selectors got Cascade's real numbers.
  Specificity, not source order, is what makes the scoped rules win inside
  a sequence (`.sequence-content .block-text p.block` beats the older
  `.block-text :first-child` reset); verified this holds rather than
  assumed it.
- No `first-letter-huge`, `h1.block`, or per-gallery-image size ever
  appears in the 3 reference stories — implemented anyway (cheap, and the
  CSS/data already exist for them) but unverified against a real story;
  flag if a future migration surfaces one and it looks off.

### Phase D — Title band ✅

`src/render/sections.js`, `site.css`.

- [x] `renderTitle` now emits `<section class="title-band size-{small|
      medium|large}">` — a `.title-band-bg` layer (image/color/placeholder,
      same `renderBackground` output as everything else) behind a flex-
      centered `.title-band-content` holding the `titleStyle` box and
      `h2.fg-title`, plus `.fg-credits` absolutely positioned bottom-left
      over the whole band. Not a hero: no `position: sticky`, no scroll
      cue, `min-height` (not `height`) 90/200/400px by `size` — Cascade's
      own numbers, and a floor, not a cap, so an unusually long title that
      wraps to two lines still grows the band rather than clipping (the
      original's `.foreground` behaves the same way: `min-height` +
      `overflow: hidden` on a block box that isn't actually capped).
      Background fill color is the theme's own `--bg-main` (white unless
      dark-themed), matching Cascade's `.background{background-color:#FFF}`
      default — the cover kept its earlier `#111` choice from Phase B,
      out of scope here.
- [x] Heading levels were already right from Phase B (cover `h1`, title
      band + immersive global title `h2`, authored block headings
      untouched) — nothing left to do for that bullet.
- [x] Tests: `test/sections.test.js` rewritten for the new markup
      (`title-band size-large`, the empty `.title-band-bg` wrapper,
      `doesNotMatch(/class="hero/)`) plus a default-size case. 97 tests
      green.
- Verified visually on Loggerettes (4 title sections, all `size-medium`
  since none of the 3 references ever set `options.size`) at 1440×900 and
  390×844: a ~200px banner sitting right under the fixed header with the
  pinned cover sliding beneath it, box centered on the image, correct
  34px mobile title size and full-width stacking. `size-small`/`size-large`
  are exercised only by the unit tests — no reference story uses them.

### Phase E — Immersive engine ✅

Markup per §3. `src/render/immersive.js` (new) + `src/render/background.js`
+ `src/render/assets/engine.js` (new) + `site.css` + `site.js`.

- [x] **Render** (`renderImmersive`, `planBackgrounds`): one sticky
      `.immersive-stage` with a filler, one `.immersive-bg[data-bg]
      [data-transition]` per unique media (keyed by `backgroundMediaKey`,
      like `isMediaAlreadyLoaded`; a swipe between two states of the same
      webmap gets its own element so it can be clipped), the swipe edge,
      and the global title (`views[0].title` only, with its `titleStyle`).
      Then one `.imm-panel.layout-*.size-*.placement-*.theme-*.style-*
      [data-view][data-bg][data-transition]` per view; `isEmpty` panels keep
      their scroll space but render no card. No JSON config for the
      section — the panels' data attributes are the view table.
- [x] **CSS**: every number from §1.5 (panel `min-height: 100vh; padding:
      20px 0 380px`; 28/38/48% cards with 300/400/600px caps, 250px floor,
      30px margins, centered ≤767px; `1.3em/160%`; `.75` alpha themes;
      `style-text-shadow`; `#56a5d8` links; `.5s`/`1.5s` fades keyed on
      `data-transition`; title at 60px/36px with a 1s fade, hidden by
      `.is-leaving`). Card alpha is back at the original `.75` — the WCAG
      check is Phase H's call.
- [x] **Engine**: `engine.js` is a plain browser script holding the pure
      math (`activeViewIndex`, `isNavigatingAway`, `viewScroll`,
      `scrollFullBringIn`, `scrollPartialOpacity`, `swipeClip`,
      `headerCompact`, `storyProgress`), evaluated under `node --test` in a
      `vm` sandbox; `site.js` does the DOM work: background switching with
      the outgoing one held beneath (`.was-active`, z-index, timer matched
      to the fade), scroll-full `bring-in`, scroll-partial card opacity for
      the current + previous panel, swipe `clip-path` + shadow edge,
      `.is-leaving` on the last view, all through the shared scroll loop.
      Reduced motion: instant switches, no clip animation, no `bring-in`
      animation (CSS), `scrollIntoView` without smoothing.
- [x] **Maps**: one Leaflet map per unique webmap per section; config
      carries every snapshotted layer plus a per-view `visible` list and
      `extent`; `applyView` adds/removes layers on view change. First
      framing uses the webmap **item's saved extent** (newly fetched in
      `getWebmapLayers` — Cascade framed maps the same way), else the
      visible data's bounds; an authored per-view `extent` (never seen)
      re-frames. `interaction !== "enabled"` → no dragging/keyboard and
      `pointer-events: none`. Leaflet's controls are pushed below the
      fixed header. **Vector-tile basemaps** (unsupported by Leaflet; 2 of
      Syringa's 6 maps) now fall back to Esri's raster Light/Dark Gray
      Canvas — dark if the original basemap's title says so — with a
      migration warning, instead of a blank grey stage.
- [x] `100vh` + `100dvh` on the stage and panels.
- [x] Image `placement` (Phase F's first item) landed here since the
      background markup was being rewritten anyway: `fill` →
      `object-position`, `fit` → `.background-fit` letterbox wrapper with
      the sampled color; shared by hero sections.
- [x] Tests: `test/engine.test.js` (9), `test/immersive.test.js` (5),
      `test/background.test.js` (+2, incl. fallback tiles / extent /
      interaction). 91 tests green. Verified visually on Loggerettes
      (image views, `fit` letterboxing, 2-view switch, stage leaving with
      the last panel) and Syringa (3 different webmaps switching in one
      section, per-view layers, saved-extent framing, dark fallback canvas,
      unavailable-map placeholder) via `scripts/screenshot.js`, which now
      accepts `@selector:offset` targets.

Findings:

- **`border-box` everywhere in Cascade too** (`*,:after,:before`), so an
  `.imm-panel` is `max(100vh, content + 400px)` — the 380px "dwell" only
  extends views whose text runs longer than a viewport. The output matches
  that exactly; don't "fix" it to `100vh + 380px`.
- Webmap JSON never carries an extent; the *item* record does, in WGS84
  `[[xmin,ymin],[xmax,ymax]]`. Without it the national maps opened on a
  fit of all US counties. `getWebmapLayers` now fetches item info too (one
  small extra request per webmap; a dead webmap fails the same way it did).
- The `@selector:offset` screenshot targets plus a persistent shell `cwd`
  bit me once: `bin/migrate.js` resolves `output/` from `process.cwd()`,
  so a stray `cd` writes the site somewhere unexpected. Nothing to change
  in the tool — just run it from the repo root.

### Phase F — Image fidelity and fonts

- [x] `renderBackground` (image): `object-position: x% y%` for `fill`
      placement; `fit` → `.background-fit` wrapper with `fit.color` and
      `object-fit: contain`. Cover/title/immersive share it (done in
      Phase E).
- [ ] Apply `mobile-pos` via a `data-mobile-pos` attribute read by a
      `(max-width: 767px)` rule or by JS (none of the reference stories
      set it).
- [ ] Use the largest fetched variant for backgrounds (Phase A); emit
      `srcset`/`sizes` when multiple variants were fetched. Never
      resample images in the pipeline (no `sharp`); fidelity comes from
      picking the right source file.
- [ ] Vendor fonts: copy the `open_sans` (Light/LightItalic/Semibold/
      SemiboldItalic, latin + latin-ext) and `noto_serif` (400/700
      normal/italic, latin + latin-ext) `.woff2` files from
      `Storymaps-Cascade-1.23.0/resources/...` into `assets/fonts/`, with
      the two license files, and write `@font-face` rules using the *theme's
      family names* (`'open_sans'`, `'noto_serif'`) with the same
      weight mapping (400→Light, 700→Semibold) and `font-display: swap`. Only
      copy families the story's theme actually references; other subsets
      (cyrillic, greek, vietnamese) only when the text contains those ranges
      — simplest first cut: latin + latin-ext always, others never, and log
      a warning if non-Latin text is detected.
- [ ] `themeMajor: "dark"`: swap `--bg-main`-driven fills to `#0E0E0E`
      (sequence, filler, title band fallback) and body text to the theme's
      `textMain`.

### Phase G — Motion, accessibility, and responsiveness pass

- [ ] Replace the global `* { animation-duration: 0.001ms }` reduced-motion
      rule with targeted rules: no `fade-in-media`, no background
      cross-fade, no swipe, no scroll-invite blink, `scroll-behavior: auto`;
      the header/progress bar can keep instantaneous updates.
- [ ] Never hide narrative text with `visibility: hidden` or `display:
      none` for animation purposes — `opacity` only — so screen readers,
      find-in-page, and print all see the full story. Backgrounds (images,
      maps) *may* use `visibility` since they're decorative or duplicated.
- [ ] Immersive panels get `role="complementary"`? The original does this,
      but it's semantically wrong for primary narrative; use plain `<div>`
      inside the `<section>` and rely on heading structure instead.
- [ ] Keyboard: scroll-invite is a `<button>`; bookmarks are links; map
      containers are focusable only when interaction is enabled.
- [ ] Breakpoints: `< 768px` mobile (`2.7em` cover title, `34px` band
      title, centered 100%-width panels, `16px` sequence text), `< 1025px`
      tablet (50% columns). Prefer `clamp()` for font sizes but keep the
      endpoints matching the original.
- [ ] Print stylesheet (small): unpin stages, show all backgrounds inline,
      full opacity everywhere. Cheap and makes the archive PDF-able.

### Phase H — Verification

- [ ] **Side-by-side screenshots.** Bring back the throwaway CDP harness
      from Phase 5 as a checked-in dev script (`scripts/screenshot.js`,
      Node ≥ 22 native `WebSocket`, system Chromium, no npm dependency) that,
      given a URL and a list of scroll offsets, writes PNGs. Run it against
      the original viewer (`docs/use-cascade.md`) and the new output for all
      three fixtures at the same viewport (1440×900, 1024×768, 390×844) and
      the same scroll positions; compare visually. Record the notable
      remaining differences in this doc.
- [ ] **Unit tests**: `transitions.test.js` (rule table), `sections.test.js`
      (immersive DOM shape: one bg per unique media, `data-view` mapping,
      panel classes, empty-panel omission, title band size classes, bookmark
      nav omitted when none enabled), `background.test.js` (placement
      styles, `srcset`), `blocks.test.js` (`block-size-*`, portrait),
      `normalize.test.js` (new fields), `pipeline.test.js` (fonts and
      largest-variant image present on disk).
- [ ] **Behavior tests** for `site.js` logic: extract the pure functions
      (active-view selection, scroll-full threshold, scroll-partial ramp,
      swipe edge, header-compact rule) into `src/render/assets/engine.js`
      that `site.js` imports at build time (concatenate or emit as a second
      `<script>`), so they run under `node --test` with synthetic
      rects — no browser needed.
- [ ] Re-run `pa11y` (WCAG2AA) on all three outputs; the card-alpha decision
      in Phase E is settled here.
- [ ] Update `README.md` (aims: "recreate the original Cascade theme
      interactions" now true; note fonts/licenses in the output) and
      `docs/todo.md` Phase 5 notes to point here.

## 5. Decisions to make up front

1. **Bookmarks vs. generated nav.** Recommendation: be faithful — render the
   header bookmarks only from `bookmark.enabled` sections. Keep a
   *visually hidden* but keyboard-reachable "Contents" list of cover/title
   headings? No — that's inventing UI the author didn't design. If an
   outline is wanted later, gate it behind a CLI flag (`--nav outline`).
2. **Card opacity.** Original `.75`; current `.95–.97`. Recommendation:
   start at the original and let the pa11y pass decide; the archive's job is
   to look like the story did.
3. **Cover pinning.** Sticky (recommended) reproduces the effect with
   less risk than `position: fixed` + visibility toggling.
4. **Immersive lead-in.** The original's 100vh of background before the
   first panel is a deliberate pacing device; keep it (it reads as
   "slow" today only because nothing fades in yet).
5. **Swipe transitions.** No reference story uses them (all `fade-fast`),
   and the rule engine forces most to `none`/`fade` anyway. Implement the
   clip-path version because it's small, but treat it as lowest priority in
   Phase E; a correct `fade`/`none` engine ships first.
6. **`scroll-partial`.** Also unused in the references. Implement (it's ~20
   lines given the engine), but don't block on it.

## 6. Out of scope (unchanged from `docs/todo.md`)

- Cover styles other than static (`scale`, `blur`, `delay`, `curtain`,
  `partial-page`, `blend-header`) — not reachable from saved story data.
- Video / webscene / webpage / audio media (none observed; still flagged
  loudly as `unknown` by the normalizer).
- The share dialog, bitly, autoplay mode, embed bar, builder mode.
- Basemap tiles remain a live dependency.

## 7. File-by-file summary

| File | Change |
|---|---|
| `src/normalize/image.js` | `options`, `sizes` |
| `src/normalize/manifest.js` | `titleStyle`, `layout`, `size`, `bookmark`, header/theme meta, `effectiveTransition`, `panel.layout`, `panel.isEmpty` |
| `src/normalize/transitions.js` (new) | pure transition-rule helper |
| `src/normalize/background.js` | webmap `extent`/`popup` passthrough |
| `src/assets/localize.js` | largest-variant backgrounds, logo, fonts copy |
| `src/assets/vendor.js` | `vendorFonts(outputDir, theme)` |
| `src/render/sections.js` | new cover/title/immersive/sequence markup, `titleStyleClasses` |
| `src/render/background.js` | placement styles, `srcset`, single-map-per-section config |
| `src/render/blocks.js` | `block-size-*`, portrait, `data-reveal` |
| `src/render/site.js` | header/progress markup, `@font-face` block, theme-major vars, engine script tag |
| `src/render/assets/site.css` | rewritten per §1 numbers |
| `src/render/assets/site.js` | scroll engine, header, reveal observer, map view switching |
| `src/render/assets/engine.js` (new) | pure, testable scroll math |
| `scripts/screenshot.js` (new, dev only) | CDP screenshot harness |
| `test/*.test.js` | as listed in Phase H |
| `README.md`, `docs/todo.md` | cross-references |
