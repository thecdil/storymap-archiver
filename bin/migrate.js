#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolvePortal } from "../src/fetch/portal.js";
import { getItem, getItemData, listItemResources } from "../src/fetch/item.js";
import { normalizeStory } from "../src/normalize/manifest.js";
import { localizeAssets } from "../src/assets/localize.js";
import { writeJsonCache } from "../src/cache/store.js";
import { slugify } from "../src/util/slug.js";

const USAGE = `Usage: storymap-migrate --appid <appid> [options]

Migrate a retired Esri Story Map Cascade project into a self-contained
static site.

Options:
  --appid <id|url>   ArcGIS appid for the retired Story Map (required), or
                     the story's old Cascade URL (the appid is read from it)
                     e.g. 545cd13f571b4ca087a3667951f9da44
                     e.g. https://uidaho.maps.arcgis.com/apps/Cascade/index.html?appid=545cd13f571b4ca087a3667951f9da44
  --site <url>       Domain where the new site will be deployed
                     e.g. https://cdil.lib.uidaho.edu
  --base <path>       Path where the new site will be deployed
                     e.g. /loggerettes
  --portal <host>      ArcGIS portal host to query, overriding the default
                     (www.arcgis.com, or the host from an --appid URL)
                     e.g. uidaho.maps.arcgis.com
  -h, --help          Show this help message
`;

function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      appid: { type: "string" },
      site: { type: "string" },
      base: { type: "string" },
      portal: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  return values;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }

  if (!args.appid) {
    process.stderr.write("Error: --appid is required\n\n");
    process.stderr.write(USAGE);
    process.exitCode = 1;
    return;
  }

  const { appid, portalHost } = resolvePortal(args.appid, { portal: args.portal });
  const options = {
    appid,
    portalHost,
    site: args.site ?? null,
    base: args.base ?? null,
  };

  console.log("storymap-archiver migrate");
  console.log("  appid: ", options.appid);
  console.log("  portal:", options.portalHost);
  console.log("  site:  ", options.site ?? "(not set)");
  console.log("  base:  ", options.base ?? "(not set)");
  console.log();

  console.log("Fetching item info...");
  const item = await getItem(options.appid, { portalHost: options.portalHost });
  console.log(`  title: ${item.title}`);
  console.log(`  type:  ${item.type}`);

  console.log("Fetching story content...");
  const data = await getItemData(options.appid, { portalHost: options.portalHost });
  const sections = data?.values?.sections ?? [];
  console.log(`  template: ${data?.values?.template?.name ?? "(unknown)"}`);
  console.log(`  sections: ${sections.length}`);

  console.log("Fetching item resource list...");
  const resources = await listItemResources(options.appid, { portalHost: options.portalHost });
  console.log(`  resources: ${resources.length}`);

  console.log("Normalizing story content...");
  const { manifest, warnings } = normalizeStory({
    item,
    data,
    appid: options.appid,
    portalHost: options.portalHost,
  });
  const kindCounts = manifest.sections.reduce((counts, section) => {
    counts[section.kind] = (counts[section.kind] ?? 0) + 1;
    return counts;
  }, {});
  for (const [kind, count] of Object.entries(kindCounts)) {
    console.log(`  ${kind}: ${count}`);
  }

  if (warnings.length > 0) {
    console.warn(`  ${warnings.length} warning(s) during normalization:`);
    for (const warning of warnings) {
      console.warn(`    [${warning.path}] ${warning.message}`);
    }
  }

  await writeJsonCache(options.appid, "manifest", manifest);

  const projectSlug = slugify(options.base ? options.base.replace(/^\/+/, "") : manifest.meta.title);
  const outputDir = path.resolve(process.cwd(), "output", projectSlug);
  await mkdir(outputDir, { recursive: true });

  console.log("Downloading images and map data...");
  const { warnings: assetWarnings } = await localizeAssets(manifest, {
    appid: options.appid,
    portalHost: options.portalHost,
    outputDir,
  });
  if (assetWarnings.length > 0) {
    console.warn(`  ${assetWarnings.length} warning(s) during asset localization:`);
    for (const warning of assetWarnings) {
      console.warn(`    [${warning.path}] ${warning.message}`);
    }
  }

  await writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log();
  console.log(`Assets and manifest written to output/${projectSlug}/`);
  console.log("Rendering the new site is not implemented yet — see docs/todo.md, Phase 5.");
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});
