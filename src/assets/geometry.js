// ArcGIS Web Maps commonly store/query features in Web Mercator (wkid
// 102100, its older alias 102113, or the standard EPSG code 3857), but our
// output GeoJSON needs WGS84 lon/lat. Feature layer queries (`f=geojson`)
// are reprojected to WGS84 automatically by the ArcGIS REST API — but
// inline "Feature Collections" embedded directly in a webmap's JSON are
// raw, unprojected Esri geometry, so we have to reproject those ourselves.
const WEB_MERCATOR_WKIDS = new Set([102100, 102113, 3857]);
const EARTH_RADIUS_METERS = 6378137;

function webMercatorToWgs84([x, y]) {
  const lon = (x / EARTH_RADIUS_METERS) * (180 / Math.PI);
  const lat = (Math.PI / 2 - 2 * Math.atan(Math.exp(-y / EARTH_RADIUS_METERS))) * (180 / Math.PI);
  return [lon, lat];
}

function mapCoordinates(coordinates, project) {
  if (typeof coordinates[0] === "number") return project(coordinates);
  return coordinates.map((c) => mapCoordinates(c, project));
}

export function isWebMercatorWkid(wkid) {
  return WEB_MERCATOR_WKIDS.has(wkid);
}

export function reprojectWebMercatorGeometry(geometry) {
  if (!geometry?.coordinates) return geometry;
  return { ...geometry, coordinates: mapCoordinates(geometry.coordinates, webMercatorToWgs84) };
}
