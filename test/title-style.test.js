import { test } from "node:test";
import assert from "node:assert/strict";
import { titleStyleClasses } from "../src/render/title-style.js";

test("no authored titleStyle → the viewer default: white text with a shadow, no box", () => {
  assert.deepEqual(titleStyleClasses(null), { wrapper: "text-background", text: "title-text text-light text-shadow" });
});

test("a light box with dark text and no shadow (the most common authored style)", () => {
  assert.deepEqual(titleStyleClasses({ shadow: false, text: "dark", background: "light" }), {
    wrapper: "text-background background-light",
    text: "title-text text-dark",
  });
});

test("light text with shadow and no box", () => {
  assert.deepEqual(titleStyleClasses({ shadow: true, text: "light", background: null }), {
    wrapper: "text-background",
    text: "title-text text-light text-shadow",
  });
});

test("a dark box", () => {
  assert.equal(titleStyleClasses({ shadow: false, text: "light", background: "dark" }).wrapper, "text-background background-dark");
});
