import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSections } from "../src/render/sections.js";

test("renderSections lists only author-enabled bookmarks, never an automatic outline", () => {
  const { bookmarks } = renderSections([
    { kind: "cover", title: "My Story", subtitle: "", background: null, bookmark: { enabled: false, title: "" } },
    { kind: "sequence", background: null, blocks: [], bookmark: { enabled: true, title: "The Company Town" } },
    { kind: "title", title: "Chapter Two", credits: "", background: null, bookmark: { enabled: false, title: "Chapter Two" } },
    // Enabled with a blank label falls back to the section's own title.
    { kind: "title", title: "Chapter Three", credits: "", background: null, bookmark: { enabled: true, title: "" } },
    { kind: "immersive", views: [], bookmark: { enabled: true, title: "Maps" } },
  ]);

  assert.deepEqual(
    bookmarks.map((n) => n.label),
    ["The Company Town", "Chapter Three", "Maps"],
  );
});

test("renderSections returns no bookmarks when a story (like all 3 references) enables none", () => {
  const { bookmarks } = renderSections([
    { kind: "cover", title: "My Story", subtitle: "", background: null, bookmark: { enabled: false, title: "" } },
    { kind: "title", title: "Chapter Two", credits: "", background: null },
  ]);
  assert.deepEqual(bookmarks, []);
});

test("renderSections assigns unique ids even when titles collide", () => {
  const { html, bookmarks } = renderSections([
    { kind: "cover", title: "Intro", subtitle: "", background: null, bookmark: { enabled: true, title: "" } },
    { kind: "title", title: "Intro", credits: "", background: null, bookmark: { enabled: true, title: "" } },
  ]);

  const ids = bookmarks.map((n) => n.id);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, ids.length, "ids must be unique");
  for (const id of ids) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("renderSections renders the cover pinned with its titleStyle box and a real scroll-invite button", () => {
  const { html } = renderSections([
    {
      kind: "cover",
      title: "Flunkies",
      subtitle: "Women in the forest",
      titleStyle: { shadow: false, text: "dark", background: "light" },
      background: { type: "color", value: "#123" },
    },
  ]);
  assert.match(html, /class="hero hero-cover"/);
  assert.match(html, /<div class="text-background background-light">/);
  assert.match(html, /<h1 class="cover-title title-text text-dark">Flunkies<\/h1>/);
  assert.match(html, /<p class="cover-subtitle title-text text-dark">Women in the forest<\/p>/);
  assert.match(html, /<button type="button" class="scroll-invite-btn" data-scroll-invite/);
  assert.doesNotMatch(html, /hero-scrim/, "Cascade has no gradient scrim over the cover");
});

test("renderSections renders a title section with the viewer's default titleStyle when none was authored", () => {
  const { html } = renderSections([
    { kind: "title", title: "Chapter", credits: "<p>Photo: someone</p>", size: "large", background: null },
  ]);
  assert.match(html, /class="hero hero-title size-large"/);
  assert.match(html, /<h2 class="fg-title title-text text-light text-shadow">Chapter<\/h2>/);
  assert.match(html, /<div class="fg-credits"><p>Photo: someone<\/p><\/div>/);
});

test("renderSections renders a visible fallback for an unrecognized section kind, not silence", () => {
  const { html } = renderSections([{ kind: "unknown", sourceType: "map-tour", raw: { type: "map-tour" } }]);
  assert.match(html, /section-unsupported/);
  assert.match(html, /"map-tour"/);
});

test("renderSections renders every known section kind without throwing", () => {
  const sections = [
    { kind: "cover", title: "Cover", subtitle: "Sub", background: { type: "color", value: "#fff" } },
    { kind: "title", title: "Title", credits: "<p>Credit</p>", background: null },
    { kind: "sequence", background: null, blocks: [{ type: "text", html: "<p>Body</p>" }] },
    {
      kind: "immersive",
      views: [
        {
          transition: "fade-fast",
          background: { type: "color", value: "#000" },
          title: { value: "View title", global: true },
          panels: [{ layout: "scroll-full", position: "left", size: "medium", style: "background", theme: "white-over-black", blocks: [] }],
        },
      ],
    },
    {
      kind: "credits",
      background: null,
      panels: [
        { type: "blocks", blocks: [{ type: "text", html: "<p>Thanks</p>" }] },
        { type: "credits", credits: [] },
      ],
    },
  ];

  const { html } = renderSections(sections);
  assert.match(html, /class="hero hero-cover"/);
  assert.match(html, /class="hero hero-title size-medium"/);
  assert.match(html, /class="sequence"/);
  assert.match(html, /class="immersive"/);
  assert.match(html, /class="credits"/);
});
