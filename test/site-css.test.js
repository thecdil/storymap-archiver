import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const CSS_PATH = path.join(import.meta.dirname, "../src/render/assets/site.css");
const css = await readFile(CSS_PATH, "utf8");

/** The (brace-balanced) body of every top-level block whose selector matches `marker`. */
function extractBlocks(source, marker) {
  const blocks = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf(marker, from);
    if (start === -1) break;
    const openBrace = source.indexOf("{", start);
    let depth = 1;
    let i = openBrace + 1;
    while (depth > 0 && i < source.length) {
      if (source[i] === "{") depth++;
      if (source[i] === "}") depth--;
      i++;
    }
    blocks.push(source.slice(openBrace + 1, i - 1));
    from = i;
  }
  return blocks;
}

/**
 * These check the *text* of the stylesheet rather than rendering it —
 * there's no CSS engine in this project's test suite — but each one
 * guards a specific, previously-hit bug (see docs/polish.md Phase G) that
 * a plausible future edit could easily reintroduce.
 */

test("reduced motion is targeted per-effect, not a blanket rule that could clobber Leaflet's own transitions", () => {
  assert.doesNotMatch(
    css,
    /\*\s*\{\s*animation-duration:\s*0\.001ms/,
    "a blanket `* { animation-duration: 0.001ms }` was replaced with rules next to each specific effect",
  );

  // Concatenate every reduced-motion block's own content, and check each
  // decorative motion effect gets an explicit off-switch inside one of them.
  const blocks = extractBlocks(css, "@media (prefers-reduced-motion: reduce)");
  assert.ok(blocks.length >= 3, "expected several small, targeted reduced-motion blocks, not one big one");
  const combined = blocks.join("\n");
  for (const selector of [
    ".scroll-invite-btn",
    "[data-reveal].bring-in",
    ".immersive-bg",
    ".immersive-title",
    ".imm-panel.layout-scroll-full.bring-in",
  ]) {
    assert.match(combined, new RegExp(selector.replace(/[.[\]]/g, "\\$&")), `expected a reduced-motion rule for ${selector}`);
  }
});

test("the print stylesheet hides .immersive-filler instead of letting it cover the unpinned title/panels", () => {
  const printBlockStart = css.indexOf("@media print");
  assert.notEqual(printBlockStart, -1, "expected an @media print block");
  const printBlock = css.slice(printBlockStart);
  assert.match(
    printBlock,
    /\.immersive-filler\s*\{[^}]*display:\s*none/,
    // .immersive-filler is `inset: 0` against the sticky stage as a solid
    // backdrop; once print unpins the stage, that same `inset: 0` covers
    // the whole (now much taller) section — including the title and
    // panels below it — with an opaque rectangle unless explicitly hidden.
    "regression: without this, print mode paints the title/panels over with a solid rectangle",
  );
});

test("the print stylesheet un-pins every sticky stage instead of reserving a full 100vh per section", () => {
  const printBlockStart = css.indexOf("@media print");
  const printBlock = css.slice(printBlockStart);
  assert.match(printBlock, /\.hero-cover\s*\{[^}]*position:\s*static/);
  assert.match(printBlock, /\.immersive-stage\s*\{[^}]*position:\s*static/);
});

test("the print stylesheet forces readable text for components that otherwise rely on a CSS background alone for contrast", () => {
  const printBlockStart = css.indexOf("@media print");
  const printBlock = css.slice(printBlockStart);
  assert.match(printBlock, /\.imm-card,\s*\n\s*\.text-background\s*\{[^}]*background:\s*#fff[^}]*color:\s*#000/s);
});
