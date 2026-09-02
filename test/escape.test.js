import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, htmlToPlainText } from "../src/render/escape.js";

test("escapeHtml escapes the 5 standard entities", () => {
  assert.equal(escapeHtml(`<a href="x">B & "C" 'D'</a>`), "&lt;a href=&quot;x&quot;&gt;B &amp; &quot;C&quot; &#39;D&#39;&lt;/a&gt;");
});

test("escapeHtml handles null/undefined as empty string", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("htmlToPlainText strips tags and decodes entities for alt text", () => {
  // Regression: this is a real caption from the "Closure of Syringa" story
  // (see test/fixtures) — Esri captions are pre-authored HTML, not plain
  // text, and a naive escapeHtml() on them produced a literal "&nbsp;" in
  // the page instead of a space.
  const caption =
    "Left: Inside Syringa (Photographer Denessy Rodriguez, October 31, 2017) Right: Derelict swimming pool in community center at Syringa&nbsp;(Photographer Denessy Rodriguez, October 31, 2017) ";
  const plain = htmlToPlainText(caption);
  assert.ok(!plain.includes("&nbsp;"), "should not contain a literal entity");
  assert.ok(plain.includes("Syringa (Photographer"), "entity should decode to a space");
});

test("htmlToPlainText strips markup tags", () => {
  assert.equal(htmlToPlainText('<p class="block">Hello <b>world</b></p>'), "Hello world");
});
