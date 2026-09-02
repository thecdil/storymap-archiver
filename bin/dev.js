#!/usr/bin/env node
import { parseArgs } from "node:util";
import { createServer } from "node:http";
import { readdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";

const USAGE = `Usage: storymap-dev [options]

Serve a migrated story folder locally for review.

Options:
  --dir <path>       Folder to serve directly (an "output/<project>" folder)
  --project <name>   Name of the project folder under output/ to serve
                     (shorthand for --dir output/<name>)
  --port <n>          Port to listen on (default: 8080)
  -h, --help          Show this help message

With no --dir/--project, the output/ directory is checked: if it contains
exactly one migrated project, that one is served automatically.
`;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8",
};

function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      dir: { type: "string" },
      project: { type: "string" },
      port: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  return values;
}

async function resolveServeDir({ dir, project }) {
  if (dir) {
    return path.resolve(process.cwd(), dir);
  }

  const outputDir = path.resolve(process.cwd(), "output");

  if (project) {
    return path.join(outputDir, project);
  }

  let entries;
  try {
    entries = await readdir(outputDir, { withFileTypes: true });
  } catch {
    throw new Error(
      `No "output/" directory found. Run storymap-migrate first, or pass --dir.`,
    );
  }

  const projects = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  if (projects.length === 0) {
    throw new Error(`"output/" has no migrated projects yet. Run storymap-migrate first.`);
  }

  if (projects.length > 1) {
    throw new Error(
      `Multiple projects found in "output/": ${projects.join(", ")}\n` +
        `Pass --project <name> or --dir <path> to pick one.`,
    );
  }

  return path.join(outputDir, projects[0]);
}

function isPathInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function resolveRequestedFile(rootDir, pathname) {
  const decoded = decodeURIComponent(pathname.split("?")[0]);
  const safeSuffix = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(rootDir, safeSuffix);

  if (!isPathInside(rootDir, filePath)) {
    return null;
  }

  try {
    let stats = await stat(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      stats = await stat(filePath);
    }
    if (stats.isFile()) {
      return filePath;
    }
  } catch {
    // fall through to 404
  }

  return null;
}

function createRequestHandler(rootDir) {
  return async (req, res) => {
    const filePath = await resolveRequestedFile(rootDir, req.url ?? "/");

    if (!filePath) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }

    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    createReadStream(filePath).pipe(res);
  };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }

  const port = args.port ? Number(args.port) : 8080;
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid --port value: ${args.port}`);
  }

  const rootDir = await resolveServeDir(args);

  const server = createServer(createRequestHandler(rootDir));
  server.on("error", (err) => {
    console.error(`Server error: ${err.message}`);
    process.exitCode = 1;
  });

  server.listen(port, () => {
    console.log(`Serving ${rootDir}`);
    console.log(`  http://localhost:${port}/`);
  });
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});
