import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_ROOT = path.resolve(process.cwd(), ".cache");

function sanitizeKey(key) {
  return key
    .split("/")
    .map((segment) => (segment === "" || segment === "." || segment === ".." ? "_" : segment))
    .join(path.sep);
}

function cachePath(namespace, key) {
  return path.join(CACHE_ROOT, sanitizeKey(namespace), sanitizeKey(key));
}

async function readCache(namespace, key) {
  try {
    return await readFile(cachePath(namespace, key));
  } catch (err) {
    if (err.code === "ENOENT") return undefined;
    throw err;
  }
}

async function writeCache(namespace, key, data) {
  const file = cachePath(namespace, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}

export async function readJsonCache(namespace, key) {
  const raw = await readCache(namespace, `${key}.json`);
  return raw === undefined ? undefined : JSON.parse(raw.toString("utf8"));
}

export async function writeJsonCache(namespace, key, data) {
  await writeCache(namespace, `${key}.json`, JSON.stringify(data, null, 2));
}

export async function readBinaryCache(namespace, key) {
  return readCache(namespace, key);
}

export async function writeBinaryCache(namespace, key, data) {
  await writeCache(namespace, key, data);
}
