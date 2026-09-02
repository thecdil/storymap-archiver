import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSections } from "../src/render/sections.js";

test("renderSections builds a nav outline only from cover/title sections", () => {
  const { nav } = renderSections([
    { kind: "cover", title: "My Story", subtitle: "", background: null },
    { kind: "sequence", background: null, blocks: [] },
    { kind: "title", title: "Chapter Two", credits: "", background: null },
    { kind: "immersive", views: [] },
  ]);

  assert.deepEqual(
    nav.map((n) => n.label),
    ["My Story", "Chapter Two"],
  );
});

test("renderSections assigns unique ids even when titles collide", () => {
  const { html, nav } = renderSections([
    { kind: "cover", title: "Intro", subtitle: "", background: null },
    { kind: "title", title: "Intro", credits: "", background: null },
  ]);

  const ids = nav.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, "ids must be unique");
  for (const id of ids) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
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
  assert.match(html, /class="hero hero-title"/);
  assert.match(html, /class="sequence"/);
  assert.match(html, /class="immersive"/);
  assert.match(html, /class="credits"/);
});
