import { createRequire } from "node:module";
import { cp, mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/**
 * Copy Leaflet's built files (js, css, marker icons) into the output
 * folder so map sections have no runtime dependency on a CDN. Leaflet was
 * chosen over a vector-tile library (e.g. MapLibre GL) because every
 * basemap observed in the 3 reference stories is a plain raster ArcGIS
 * Tiled Map Service, which Leaflet's L.tileLayer consumes directly.
 */
export async function vendorLeaflet(outputDir) {
  const leafletDistDir = path.join(path.dirname(require.resolve("leaflet/package.json")), "dist");
  const targetDir = path.join(outputDir, "assets/vendor/leaflet");
  await mkdir(targetDir, { recursive: true });
  await cp(leafletDistDir, targetDir, { recursive: true });
  return "assets/vendor/leaflet";
}

const CASCADE_RESOURCES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../Storymaps-Cascade-1.23.0/resources",
);

/**
 * Cascade's theme picker (`THEME_FONT_OPTIONS` in the builder) offers
 * exactly 4 fonts: Georgia and Arial are plain system fonts needing no
 * files at all; Open Sans and Noto Serif are the two Google-Fonts-hosted
 * webfonts this vendors. Each family's 4 files below are its "latin"
 * Unicode subset (Basic Latin + Latin-1 Supplement + a handful of
 * typographic extras — see `LATIN_SUBSET_RANGES`), which is what the
 * original CSS's own base `@font-face` declarations resolve to once you
 * account for a corrupted `unicode-range` token in the shipped viewer CSS
 * (literally `U00` with no codepoints — invalid, so browsers fall back to
 * matching everything). That's enough for English and most Western
 * European text; Cascade's separate latin-ext/greek/cyrillic/vietnamese
 * subset files (needed for e.g. Polish, Czech, Turkish, or non-Latin
 * scripts) are deliberately not vendored — seeing them would require a
 * real story that needs them, which none of the 3 references do.
 */
const FONT_FILES = {
  open_sans: {
    license: "lib/calcite-bootstrap/fonts/OpenSans-LICENSE.txt",
    faces: [
      { weight: 400, style: "normal", file: "lib/calcite-bootstrap/fonts/OpenSans-Light-webfont.woff2" },
      { weight: 400, style: "italic", file: "lib/calcite-bootstrap/fonts/OpenSans-LightItalic-webfont.woff2" },
      { weight: 700, style: "normal", file: "lib/calcite-bootstrap/fonts/OpenSans-Semibold-webfont.woff2" },
      { weight: 700, style: "italic", file: "lib/calcite-bootstrap/fonts/OpenSans-SemiboldItalic-webfont.woff2" },
    ],
  },
  noto_serif: {
    // This license file is literally named for Droid Serif, an earlier
    // release of the same typeface family under the same Apache-2.0 terms —
    // it's the license Cascade itself ships alongside these Noto Serif
    // files, so it's carried over as-is rather than renamed.
    license: "fonts/DroidSerif-LICENSE.txt",
    faces: [
      { weight: 400, style: "normal", file: "fonts/noto-serif/latin/noto-serif-400-normal.woff2" },
      { weight: 400, style: "italic", file: "fonts/noto-serif/latin/noto-serif-400-italic.woff2" },
      { weight: 700, style: "normal", file: "fonts/noto-serif/latin/noto-serif-700-normal.woff2" },
      { weight: 700, style: "italic", file: "fonts/noto-serif/latin/noto-serif-700-italic.woff2" },
    ],
  },
};

const SYSTEM_FONT_FAMILIES = new Set(["georgia", "arial"]);

/** The primary family Cascade put first in a fontFamily CSS list, e.g. `"'open_sans', 'Helvetica Neue', ..."` → `"open_sans"`. */
function primaryFamily(fontFamily) {
  const match = /^\s*['"]?([^'",]+)['"]?/.exec(fontFamily ?? "");
  return match ? match[1].trim().toLowerCase() : null;
}

function themeFontFamilies(theme) {
  return [primaryFamily(theme?.fonts?.titleFont?.fontFamily), primaryFamily(theme?.fonts?.bodyFont?.fontFamily)].filter(
    Boolean,
  );
}

/** Which of the 2 vendorable families this theme's title/body fonts reference — never more than the story actually uses. */
export function referencedFontFamilies(theme) {
  return [...new Set(themeFontFamilies(theme).filter((family) => FONT_FILES[family]))];
}

/**
 * A font family this theme names that's neither one of Cascade's built-in
 * system fonts (Georgia, Arial) nor one we know how to vendor — surfaced as
 * a warning rather than silently rendering in whatever the browser
 * defaults to, since it means the story's theme JSON diverges from the 3
 * reference stories in a way not yet seen.
 */
export function unvendorableFontFamilies(theme) {
  return [...new Set(themeFontFamilies(theme).filter((family) => !FONT_FILES[family] && !SYSTEM_FONT_FAMILIES.has(family)))];
}

/**
 * Vendor the webfont(s) this story's theme actually uses (never both,
 * unless both title and body fonts need it) into assets/fonts/<family>/,
 * alongside the license covering those files, and write the @font-face
 * rules that reference them by Cascade's own family name so the existing
 * `--story-title-font`/`--story-body-font` custom properties (already the
 * full `'open_sans', 'Helvetica Neue', ...` fallback chain from the
 * theme JSON) pick them up with no other change. Returns the families
 * vendored, so the caller knows whether to link the stylesheet at all.
 */
export async function vendorFonts(outputDir, theme) {
  const families = referencedFontFamilies(theme);
  if (families.length === 0) return [];

  const fontsDir = path.join(outputDir, "assets/fonts");
  const rules = [];

  for (const family of families) {
    const def = FONT_FILES[family];
    const familyDir = path.join(fontsDir, family);
    await mkdir(familyDir, { recursive: true });
    await copyFile(path.join(CASCADE_RESOURCES, def.license), path.join(familyDir, path.basename(def.license)));
    for (const face of def.faces) {
      const filename = path.basename(face.file);
      await copyFile(path.join(CASCADE_RESOURCES, face.file), path.join(familyDir, filename));
      rules.push(
        `@font-face{font-family:'${family}';src:url('${family}/${filename}') format('woff2');` +
          `font-weight:${face.weight};font-style:${face.style};font-display:swap}`,
      );
    }
  }

  await writeFile(path.join(fontsDir, "fonts.css"), rules.join("\n") + "\n");
  return families;
}

// The Unicode ranges Cascade's own vendored "latin" subset files actually
// cover (Google Fonts' standard "latin" subset) — see FONT_FILES above for
// why this project treats that as the vendored coverage rather than the
// broken unicode-range string the original CSS ships.
const LATIN_SUBSET_RANGES = [
  [0x00, 0xff],
  [0x131, 0x131],
  [0x152, 0x153],
  [0x2c6, 0x2c6],
  [0x2da, 0x2da],
  [0x2dc, 0x2dc],
  [0x2000, 0x206f],
  [0x2074, 0x2074],
  [0x20ac, 0x20ac],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
];

/**
 * Whether `text` contains a character outside the vendored fonts' Latin
 * subset (e.g. Polish/Czech/Turkish letters, Greek, Cyrillic, Vietnamese
 * tone marks). HTML markup in `text` never trips this — every character
 * HTML syntax itself can use is already inside Latin-1. A true hit means
 * that character will render in a fallback system font instead of the
 * story's own theme typeface.
 */
export function hasUnsupportedGlyphs(text) {
  for (const ch of text ?? "") {
    const code = ch.codePointAt(0);
    if (!LATIN_SUBSET_RANGES.some(([start, end]) => code >= start && code <= end)) return true;
  }
  return false;
}
