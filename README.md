# storymap-archiver

In 2026 classic "Esri Story Maps" was retired (in favor of current "ArcGIS StoryMaps").
The content and data for classic projects still exists, but is not available as a live story website. 

storymap-archiver provides automated scripts for extracting and downloading the data and assets from existing projects and outputting a new self-contained static web version.
Provide the ArcGIS "appid" for a retired Cascade Esri Story Map and the migrator will output a folder of standalone, static web files ready to deploy in a new location on any server.

storymap-archiver aims to:

- Capture and download retired content accurately to avoid loss of data.
- Recreate the original Cascade theme interactions and presentation in a self-contained static web package with no external dependencies.
- Improve the theme with modernized html, css, best practices, and accessibility to ensure long term useability.
- It does not provide an editing interface or migration to a new platform.

## Use 

### Set Up

To use storymap-archiver, you will need [pnpm](https://pnpm.io/) (as node package manager).

To install storymap-archiver's dependencies, open a terminal in this repository and type

`pnpm install`

### Migrate a Story Map

1. Find the retired Esri Story Maps appid.
    - If you have the link to the retired story, look for the appid at the end of the URL. e.g. `https://www.arcgis.com/apps/Cascade/index.html?appid=cd897eb9ea4c4544af3e1972ec924745`
    - the appid will become the the appid option like: `--appid cd897eb9ea4c4544af3e1972ec924745`
2. Decide where you will to host the migrated story.
    - e.g. `https://cdil.lib.uidaho.edu/loggerettes/`
    - the domain will become the site option like: `--site https://cdil.lib.uidaho.edu`
    - the path will become the base option like: `/loggerettes`
3. Open a terminal in this repository and run the migrate script with the appid, site, and base options.
    - `pnpm migrate --appid cd897eb9ea4c4544af3e1972ec924745 --site https://cdil.lib.uidaho.edu --base /loggerettes`
    - the script will download content and data, then output a new folder in "output/". The new project directory is named following the `base` value or the story's title if no base was set.
4. Run the dev server to review the output 
    - `pnpm dev`
    - If you have more than one story migrated in the "output/" directory, add `--dir <path>` option to select one.
5. Deploy the project to new server location. 
    - Manually copy the folder of files from "output/" to your server.

The output folder is fully self-contained: images, map data, and webfonts are all stored locally in "assets/". 
The only remaining live dependency is basemap tiles for any interactive map sections.

### Full Options

Options:

- `--appid` - ArcGIS appid for a retired Story Map, e.g. `545cd13f571b4ca087a3667951f9da44`. Also accepts the story's old Cascade URL directly, e.g. `https://uidaho.maps.arcgis.com/apps/Cascade/index.html?appid=545cd13f571b4ca087a3667951f9da44` (the appid is read out of it).
- `--site` - the domain where the new site will be deployed, e.g. `https://cdil.lib.uidaho.edu`. Optional; only used to fill in canonical/OG tags.
- `--base` - the path where the new site will be deployed, e.g. `/loggerettes`. Optional; used to name the output folder under `output/` (falling back to the story's own title if not given). The generated site itself uses only relative paths, so it doesn't need to know its deployment path to work.
- `--portal` - the ArcGIS portal host to query, if not `www.arcgis.com` (or the host from an `--appid` URL), e.g. `uidaho.maps.arcgis.com`.

Run `pnpm migrate --help` or `pnpm dev --help` for the full list of options.

## Original Cascade Theme

The folder "docs/Storymaps-Cascade-1.23.0" is the original Esri Story Maps Cascade package.
This source is used by the migration script. 
It can also be used to view old stories in their original form for reference or recovery. 
See "docs/use-cascade.md" for info.

## Examples 

Example retired projects:

- Dairy Drought, https://uidaho.maps.arcgis.com/apps/Cascade/index.html?appid=545cd13f571b4ca087a3667951f9da44
- Closure of Syringa, https://uidaho.maps.arcgis.com/apps/Cascade/index.html?appid=a459d05f5e2c4b5c9cd9e535e0c4afaa
- Flunkies and Loggerettes, https://www.arcgis.com/apps/Cascade/index.html?appid=cd897eb9ea4c4544af3e1972ec924745
