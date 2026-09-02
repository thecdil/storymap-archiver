const DEFAULT_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
const DEFAULT_TIMEOUT_MS = 20_000;
const ITEM_ID_PATTERN = /^[0-9a-f]{32}$/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve an old Cascade URL or a bare appid into { appid, portalHost }.
 * An explicit `portal` option always wins over a host parsed from the URL.
 */
export function resolvePortal(input, { portal } = {}) {
  const trimmed = input.trim();
  let appid;
  let portalHost;

  if (/^https?:\/\//i.test(trimmed)) {
    let url;
    try {
      url = new URL(trimmed);
    } catch (err) {
      throw new Error(`"${input}" is not a valid URL: ${err.message}`);
    }
    appid = url.searchParams.get("appid");
    if (!appid) {
      throw new Error(`Could not find an "appid" query parameter in URL: ${input}`);
    }
    portalHost = portal ?? url.hostname;
  } else {
    appid = trimmed;
    portalHost = portal ?? "www.arcgis.com";
  }

  if (!ITEM_ID_PATTERN.test(appid)) {
    throw new Error(
      `"${appid}" does not look like a valid ArcGIS item id (expected 32 hex characters).`,
    );
  }

  return { appid, portalHost };
}

export function sharingRestBase(portalHost) {
  return `https://${portalHost}/sharing/rest`;
}

async function fetchWithRetry(url, { retries = DEFAULT_RETRIES, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }
      if (!response.ok) {
        throw Object.assign(
          new Error(`HTTP ${response.status} ${response.statusText} fetching ${url}`),
          { retryable: false },
        );
      }
      return response;
    } catch (err) {
      lastError =
        err.name === "TimeoutError"
          ? new Error(`Timed out after ${timeoutMs}ms fetching ${url}`)
          : err;
      if (err.retryable === false || attempt === retries) throw lastError;
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }
  throw lastError;
}

/** Fetch a `f=json` ArcGIS Sharing REST endpoint, throwing on ArcGIS-style error envelopes. */
export async function fetchArcGisJson(url, options) {
  const response = await fetchWithRetry(url, options);
  const body = await response.json();
  if (body && body.error) {
    const { code, message, details } = body.error;
    throw new Error(
      `ArcGIS API error${code ? ` ${code}` : ""}: ${message ?? "unknown error"}` +
        (Array.isArray(details) && details.length ? ` (${details.join("; ")})` : ""),
    );
  }
  return body;
}

/** Fetch a binary resource (e.g. an item resource file) as a Buffer. */
export async function fetchBinary(url, options) {
  const response = await fetchWithRetry(url, options);
  return Buffer.from(await response.arrayBuffer());
}
