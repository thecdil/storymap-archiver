import { createRequire } from "node:module";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

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
