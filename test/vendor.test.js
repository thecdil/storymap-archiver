import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  referencedFontFamilies,
  unvendorableFontFamilies,
  hasUnsupportedGlyphs,
  vendorFonts,
} from "../src/assets/vendor.js";

const OPEN_SANS_THEME = { fonts: { titleFont: { fontFamily: "'open_sans', 'Helvetica Neue', sans-serif" }, bodyFont: { fontFamily: "'noto_serif', Georgia, serif" } } };
const SYSTEM_FONTS_THEME = { fonts: { titleFont: { fontFamily: "'Arial', sans-serif" }, bodyFont: { fontFamily: "'Georgia', serif" } } };
const CUSTOM_FONT_THEME = { fonts: { titleFont: { fontFamily: "'Comic Sans MS', cursive" }, bodyFont: { fontFamily: "'open_sans', sans-serif" } } };

test("referencedFontFamilies finds only the families this project knows how to vendor", () => {
  assert.deepEqual(referencedFontFamilies(OPEN_SANS_THEME), ["open_sans", "noto_serif"]);
  assert.deepEqual(referencedFontFamilies(SYSTEM_FONTS_THEME), [], "Georgia/Arial are system fonts, not vendored");
  assert.deepEqual(referencedFontFamilies(null), []);
});

test("referencedFontFamilies dedupes when title and body share the same family", () => {
  const theme = { fonts: { titleFont: { fontFamily: "'open_sans'" }, bodyFont: { fontFamily: "'open_sans'" } } };
  assert.deepEqual(referencedFontFamilies(theme), ["open_sans"]);
});

test("unvendorableFontFamilies flags a font that's neither a known webfont nor a system font", () => {
  assert.deepEqual(unvendorableFontFamilies(CUSTOM_FONT_THEME), ["comic sans ms"]);
  assert.deepEqual(unvendorableFontFamilies(OPEN_SANS_THEME), []);
  assert.deepEqual(unvendorableFontFamilies(SYSTEM_FONTS_THEME), [], "Georgia/Arial are recognized system fonts");
});

test("hasUnsupportedGlyphs accepts plain English (and HTML markup around it), rejects non-Latin text", () => {
  assert.equal(hasUnsupportedGlyphs("Hello, world! Café résumé — 100%"), false);
  assert.equal(hasUnsupportedGlyphs('<p class="block">Plain <b>HTML</b> &amp; text</p>'), false, "HTML syntax chars are all Latin-1");
  assert.equal(hasUnsupportedGlyphs(""), false);
  assert.equal(hasUnsupportedGlyphs(null), false);
  assert.equal(hasUnsupportedGlyphs("Zażółć gęślą jaźń"), true, "Polish letters are outside the latin subset");
  assert.equal(hasUnsupportedGlyphs("Привет"), true, "Cyrillic");
  assert.equal(hasUnsupportedGlyphs("Ελληνικά"), true, "Greek");
});

test("vendorFonts copies only the referenced family's files plus its license, and writes matching @font-face rules", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "storymap-archiver-fonts-"));
  try {
    const families = await vendorFonts(outputDir, OPEN_SANS_THEME);
    assert.deepEqual(families, ["open_sans", "noto_serif"]);

    const css = await readFile(path.join(outputDir, "assets/fonts/fonts.css"), "utf8");
    assert.match(css, /font-family:'open_sans'.*font-weight:400.*font-style:normal/);
    assert.match(css, /font-family:'open_sans'.*font-weight:700.*font-style:italic/);
    assert.match(css, /font-family:'noto_serif'.*font-weight:400.*font-style:normal/);
    assert.match(css, /font-display:swap/);
    // Every rule's url() must point at a file that actually exists on disk.
    for (const match of css.matchAll(/url\('([^']+)'\)/g)) {
      assert.ok(existsSync(path.join(outputDir, "assets/fonts", match[1])), `missing font file: ${match[1]}`);
    }

    assert.ok(existsSync(path.join(outputDir, "assets/fonts/open_sans/OpenSans-LICENSE.txt")));
    assert.ok(existsSync(path.join(outputDir, "assets/fonts/noto_serif/DroidSerif-LICENSE.txt")));

    // 4 weight/style files per family, no leftovers from the other family.
    const openSansFiles = await readdir(path.join(outputDir, "assets/fonts/open_sans"));
    assert.equal(openSansFiles.filter((f) => f.endsWith(".woff2")).length, 4);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("vendorFonts vendors nothing for a theme that only uses system fonts", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "storymap-archiver-fonts-"));
  try {
    const families = await vendorFonts(outputDir, SYSTEM_FONTS_THEME);
    assert.deepEqual(families, []);
    assert.equal(existsSync(path.join(outputDir, "assets/fonts")), false);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("vendorFonts does nothing for a story with no theme at all", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "storymap-archiver-fonts-"));
  try {
    assert.deepEqual(await vendorFonts(outputDir, null), []);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
