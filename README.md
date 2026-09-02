# storymap-archiver

In 2026 classic "Esri Story Maps" was retired (in favor of current "ArcGIS StoryMaps").
The content and data for classic projects still exists, but is not available as a live story website. 

The storymap-archiver project contains automated scripts for extracting the data from existing projects and creating a new self-contained static web version.
Provide the ArcGIS "appid" for a retired Cascade Esri Story Map and the migrator will output a folder of standalone, static web files ready to deploy in a new location on a static server.

To use storymap-archiver, you will need `pnpm`.

Options: 

- `appid` - ArcGIS appid for a retired Story Map, e.g. `545cd13f571b4ca087a3667951f9da44`
- `site` - the domain where the new site will be deployed, e.g. `https://cdil.lib.uidaho.edu`
- `base` - the path where the new site will be deployed, e.g. `/loggerettes`

## Repository Contents

- "Storymaps-Cascade-1.23.0" - this is the source code of the original Esri Story Maps Cascade layout for reference. It can be used to view old stories in their original form for recovery or reference. See "docs/use-cascade.md" for info.

## Migrating a story

1. Install storymap-archiver dependencies `pnpm install`
2. Find the retired Story Map's appid.
3. Run the migration script.
4. Run the dev server to review the output in "output/" (new project directory is named following the `base` value).
5. Manually copy the new project directory to its production location on your server.

## Examples 

Example retired projects:

- Aly - Dairy Drought, https://uidaho.maps.arcgis.com/apps/Cascade/index.html?appid=545cd13f571b4ca087a3667951f9da44
- Closure of Syringa, https://uidaho.maps.arcgis.com/apps/Cascade/index.html?appid=a459d05f5e2c4b5c9cd9e535e0c4afaa
- Flunkies and Loggerettes, https://www.arcgis.com/apps/Cascade/index.html?appid=cd897eb9ea4c4544af3e1972ec924745
