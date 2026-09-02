import { test } from "node:test";
import assert from "node:assert/strict";
import { renderBlock, renderBlocks } from "../src/render/blocks.js";

test("renderBlock renders text blocks as trusted pre-authored HTML, unescaped", () => {
  const html = renderBlock({ type: "text", html: '<p class="block">Hello & welcome</p>' });
  assert.equal(html, '<div class="block-text"><p class="block">Hello & welcome</p></div>');
});

test("renderBlock renders an image with its caption as visible HTML but a plain-text alt", () => {
  const html = renderBlock({
    type: "image",
    image: {
      url: "assets/images/a.jpg",
      width: 100,
      height: 80,
      caption: "Caption with a &amp; symbol",
    },
  });
  assert.match(html, /<figcaption>Caption with a &amp; symbol<\/figcaption>/);
  assert.match(html, /alt="Caption with a &amp; symbol"/);
});

test("renderBlock omits alt/figcaption gracefully when there is no caption", () => {
  const html = renderBlock({ type: "image", image: { url: "assets/images/a.jpg" } });
  assert.match(html, /alt=""/);
  assert.doesNotMatch(html, /<figcaption>/);
});

test("renderBlock returns empty string for an image block with no image", () => {
  assert.equal(renderBlock({ type: "image", image: null }), "");
});

test("renderBlock renders an image-gallery with all images and a shared caption", () => {
  const html = renderBlock({
    type: "image-gallery",
    caption: "Shared caption",
    images: [
      { url: "assets/images/a.jpg" },
      { url: "assets/images/b.jpg" },
    ],
  });
  assert.match(html, /assets\/images\/a\.jpg/);
  assert.match(html, /assets\/images\/b\.jpg/);
  assert.match(html, /<figcaption>Shared caption<\/figcaption>/);
});

test("renderBlock falls back to a visible, non-silent placeholder for an unknown block type", () => {
  const html = renderBlock({ type: "unknown", sourceType: "audio", raw: { type: "audio", url: "x.mp3" } });
  assert.match(html, /class="block-unsupported"/);
  assert.match(html, /"audio"/);
  assert.match(html, /x\.mp3/);
});

test("renderBlocks joins multiple blocks and handles an empty/missing list", () => {
  const html = renderBlocks([{ type: "text", html: "<p>A</p>" }, { type: "text", html: "<p>B</p>" }]);
  assert.match(html, /<p>A<\/p>/);
  assert.match(html, /<p>B<\/p>/);
  assert.equal(renderBlocks(undefined), "");
  assert.equal(renderBlocks([]), "");
});
