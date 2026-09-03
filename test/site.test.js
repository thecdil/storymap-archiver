import { test } from "node:test";
import assert from "node:assert/strict";
import { renderDocument } from "../src/render/site.js";

function manifest({ header = {}, sections }) {
  return {
    meta: {
      title: "Flunkies & Loggerettes",
      snippet: "",
      sourcePortal: "www.arcgis.com",
      sourceAppid: "abc",
      theme: null,
      header: {
        logo: { enabled: false, url: null, builtin: false, link: null },
        link: { url: null, title: null },
        social: { enabled: false },
        ...header,
      },
    },
    sections,
  };
}

const cover = { kind: "cover", title: "Flunkies", subtitle: "", titleStyle: null, background: null, bookmark: { enabled: false, title: "" } };
const sequence = { kind: "sequence", background: null, blocks: [], bookmark: { enabled: false, title: "" } };

test("renderDocument emits a fixed header with the story title, a progress bar, and no nav when no bookmarks are enabled", () => {
  const html = renderDocument(manifest({ sections: [cover, sequence] }));
  assert.match(html, /<div class="story-progress" aria-hidden="true">/);
  assert.match(html, /<header class="story-header compact" data-has-cover="true">/);
  assert.match(html, /<a class="story-title" href="#top">Flunkies &amp; Loggerettes<\/a>/);
  assert.doesNotMatch(html, /story-bookmarks/);
  assert.doesNotMatch(html, /story-logo/);
  assert.doesNotMatch(html, /story-link/);
  assert.match(html, /<body id="top">/);
});

test("renderDocument starts the header solid (not compact) when the story doesn't open on a cover", () => {
  const html = renderDocument(manifest({ sections: [sequence] }));
  assert.match(html, /<header class="story-header" data-has-cover="false">/);
});

test("renderDocument lists enabled bookmarks and the author's tagline link", () => {
  const html = renderDocument(
    manifest({
      header: { link: { url: "https://www.lib.uidaho.edu/digital/", title: "A Potlatch Story Map" } },
      sections: [cover, { ...sequence, bookmark: { enabled: true, title: "The Company Town" } }],
    }),
  );
  assert.match(html, /<nav class="story-bookmarks" aria-label="Story bookmarks">/);
  assert.match(html, /<li><a href="#the-company-town">The Company Town<\/a><\/li>/);
  assert.match(html, /<div class="story-link"><a href="https:\/\/www.lib.uidaho.edu\/digital\/">A Potlatch Story Map<\/a><\/div>/);
});

test("renderDocument shows an enabled, localized logo but never the built-in Esri one", () => {
  const withLogo = renderDocument(
    manifest({
      header: { logo: { enabled: true, url: "assets/images/logo-abcd1234.png", builtin: false, link: "https://example.org" } },
      sections: [cover],
    }),
  );
  assert.match(withLogo, /<div class="story-logo"><a href="https:\/\/example.org"><img src="assets\/images\/logo-abcd1234.png" alt="Logo"><\/a><\/div>/);

  // The localizer nulls the URL of a built-in logo; the renderer must then omit it.
  const builtin = renderDocument(
    manifest({ header: { logo: { enabled: true, url: null, builtin: true, link: null } }, sections: [cover] }),
  );
  assert.doesNotMatch(builtin, /story-logo/);
});
