# storymap-archiver

In 2026 classic "Esri Story Maps" was retired (in favor of current "ArcGIS StoryMaps").
The content and data for classic projects still exists, but is not available as a live story website. 

The storymap-archiver project contains automated scripts for extracting and downloading the data and assets from existing projects and creating a new self-contained static web version.
Provide the ArcGIS "appid" for a retired Cascade Esri Story Map and the migrator will output a folder of standalone, static web files ready to deploy in a new location on a static server.

To use storymap-archiver, you will need `pnpm`.

Options:

- `--appid` - ArcGIS appid for a retired Story Map, e.g. `545cd13f571b4ca087a3667951f9da44`.
  Also accepts the story's old Cascade URL directly, e.g.
  `https://uidaho.maps.arcgis.com/apps/Cascade/index.html?appid=545cd13f571b4ca087a3667951f9da44`
  (the appid is read out of it).
- `--site` - the domain where the new site will be deployed, e.g. `https://cdil.lib.uidaho.edu`.
  Optional; only used to fill in canonical/OG tags.
- `--base` - the path where the new site will be deployed, e.g. `/loggerettes`.
  Optional; used to name the output folder under `output/` (falling back to
  the story's own title if not given). The generated site itself uses only
  relative paths, so it doesn't need to know its deployment path to work.
- `--portal` - the ArcGIS portal host to query, if not `www.arcgis.com` (or
  the host from an `--appid` URL), e.g. `uidaho.maps.arcgis.com`.

Run `pnpm migrate --help` or `pnpm dev --help` for the full list of options.

## Repository Contents

- "Storymaps-Cascade-1.23.0" - this is the source code of the original Esri Story Maps Cascade layout for reference. It can be used to view old stories in their original form for recovery or reference. See "docs/use-cascade.md" for info.

## Project Aims

- Capture and download retired content accurately to avoid loss of data.
- Recreate the original Cascade theme interactions and presentation in a self-contained static web package with no external dependencies.
- Improve the theme with modernized html, css, best practices, and accessibility to ensure long term useability.

## Migrating a story

1. Install storymap-archiver dependencies: `pnpm install`
2. Find the retired Story Map's appid.
3. Run the migration script, e.g.:
   ```
   pnpm migrate --appid 545cd13f571b4ca087a3667951f9da44 \
     --site https://cdil.lib.uidaho.edu --base /loggerettes
   ```
   Any warnings (a map layer that's gone, an image that failed to download,
   ...) are listed at the end — the migration still completes, review these
   before publishing since some content may be missing or degraded.
4. Run the dev server to review the output in "output/" (new project directory is named following the `base` value, or the story's title if `--base` wasn't given):
   ```
   pnpm dev
   ```
   (Pass `--project <name>` or `--dir <path>` if `output/` has more than one migrated project.)
5. Manually copy the new project directory to its production location on your server.

## Examples 

Example retired projects:

- Aly - Dairy Drought, https://uidaho.maps.arcgis.com/apps/Cascade/index.html?appid=545cd13f571b4ca087a3667951f9da44
- Closure of Syringa, https://uidaho.maps.arcgis.com/apps/Cascade/index.html?appid=a459d05f5e2c4b5c9cd9e535e0c4afaa
- Flunkies and Loggerettes, https://www.arcgis.com/apps/Cascade/index.html?appid=cd897eb9ea4c4544af3e1972ec924745
