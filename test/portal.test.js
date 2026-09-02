import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePortal, sharingRestBase } from "../src/fetch/portal.js";

test("resolvePortal accepts a bare appid, defaulting to www.arcgis.com", () => {
  const result = resolvePortal("545cd13f571b4ca087a3667951f9da44");
  assert.deepEqual(result, {
    appid: "545cd13f571b4ca087a3667951f9da44",
    portalHost: "www.arcgis.com",
  });
});

test("resolvePortal reads the appid and host from an old Cascade URL", () => {
  const result = resolvePortal(
    "https://uidaho.maps.arcgis.com/apps/Cascade/index.html?appid=545cd13f571b4ca087a3667951f9da44",
  );
  assert.deepEqual(result, {
    appid: "545cd13f571b4ca087a3667951f9da44",
    portalHost: "uidaho.maps.arcgis.com",
  });
});

test("resolvePortal lets an explicit --portal override the URL's host", () => {
  const result = resolvePortal(
    "https://uidaho.maps.arcgis.com/apps/Cascade/index.html?appid=545cd13f571b4ca087a3667951f9da44",
    { portal: "www.arcgis.com" },
  );
  assert.equal(result.portalHost, "www.arcgis.com");
});

test("resolvePortal rejects a URL with no appid query parameter", () => {
  assert.throws(
    () => resolvePortal("https://uidaho.maps.arcgis.com/apps/Cascade/index.html"),
    /appid/i,
  );
});

test("resolvePortal rejects a malformed appid", () => {
  assert.throws(() => resolvePortal("not-an-appid"), /valid ArcGIS item id/i);
});

test("sharingRestBase builds the sharing REST root for a host", () => {
  assert.equal(
    sharingRestBase("www.arcgis.com"),
    "https://www.arcgis.com/sharing/rest",
  );
});
