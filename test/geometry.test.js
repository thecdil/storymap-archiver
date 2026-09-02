import { test } from "node:test";
import assert from "node:assert/strict";
import { isWebMercatorWkid, reprojectWebMercatorGeometry } from "../src/assets/geometry.js";

test("isWebMercatorWkid recognizes the common Web Mercator wkids", () => {
  assert.equal(isWebMercatorWkid(102100), true);
  assert.equal(isWebMercatorWkid(102113), true);
  assert.equal(isWebMercatorWkid(3857), true);
  assert.equal(isWebMercatorWkid(4326), false);
  assert.equal(isWebMercatorWkid(null), false);
});

test("reprojectWebMercatorGeometry converts a Point to WGS84 lon/lat", () => {
  // Ground truth: a real feature from the "Closure of Syringa" story whose
  // attributes independently carry both its Web Mercator geometry and its
  // true longitude/latitude (Syringa Mobile Home Park, Moscow, Idaho).
  const result = reprojectWebMercatorGeometry({
    type: "Point",
    coordinates: [-13018196.18, 5899894.01],
  });

  assert.equal(result.type, "Point");
  assert.ok(Math.abs(result.coordinates[0] - -116.944446) < 1e-4);
  assert.ok(Math.abs(result.coordinates[1] - 46.740959) < 1e-4);
});

test("reprojectWebMercatorGeometry handles nested coordinate arrays (Polygon)", () => {
  const result = reprojectWebMercatorGeometry({
    type: "Polygon",
    coordinates: [
      [
        [-13018196.18, 5899894.01],
        [-13018196.18, 5899894.01],
        [-13018196.18, 5899894.01],
      ],
    ],
  });

  assert.equal(result.coordinates[0].length, 3);
  for (const [lon, lat] of result.coordinates[0]) {
    assert.ok(Math.abs(lon - -116.944446) < 1e-4);
    assert.ok(Math.abs(lat - 46.740959) < 1e-4);
  }
});

test("reprojectWebMercatorGeometry passes through a geometry with no coordinates", () => {
  assert.equal(reprojectWebMercatorGeometry(null), null);
  assert.deepEqual(reprojectWebMercatorGeometry({ type: "GeometryCollection" }), {
    type: "GeometryCollection",
  });
});
