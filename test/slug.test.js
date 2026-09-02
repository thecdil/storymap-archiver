import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../src/util/slug.js";

test("slugify lowercases and hyphenates a title", () => {
  assert.equal(slugify("CLOSURE OF SYRINGA"), "closure-of-syringa");
});

test("slugify strips a leading slash left over from a --base path", () => {
  assert.equal(slugify("loggerettes"), "loggerettes");
});

test("slugify collapses punctuation and whitespace", () => {
  assert.equal(
    slugify("Flunkies and Loggerettes: Women in the White Pine Forest"),
    "flunkies-and-loggerettes-women-in-the-white-pine-forest",
  );
});

test("slugify falls back to a default for empty input", () => {
  assert.equal(slugify(""), "story");
  assert.equal(slugify("   "), "story");
});
