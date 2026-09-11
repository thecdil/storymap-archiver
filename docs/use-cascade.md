# Viewing Old Cascade Story Maps

The source code for the Cascade Story Map template is available in "Storymaps-Cascade-1.23.0".

To view an existing retired Cascade Story Map you need the `appid` from the story's old URL. 
Old URLs look like: `https://uidaho.maps.arcgis.com/apps/Cascade/index.html?appid=545cd13f571b4ca087a3667951f9da44`.
You can find it on the retired items page in "URL".
The `/apps` + a template like `/Cascade` tells you it is old style story map and the template it used.
Public story maps do not require any special authentication or set up.

To view the story:

- Open terminal in "Storymaps-Cascade-1.23.0/"
- Start a local server 
    - ruby: `ruby -run -e httpd . -p 8000`
    - python: `python3 -m http.server 8000`
    - node: install `npm install -g http-server`, run `http-server`
- Use the local url with the appid of your existing item
    - `http://127.0.0.1:8000/index.html?appid=545cd13f571b4ca087a3667951f9da44`

## ArcGIS docs

- [Cascade source](https://github.com/Esri/storymap-cascade/releases/tag/V1.23.0)
- [MapJournal source](https://github.com/Esri/storymap-journal/releases/tag/1.31.0)
- [view classic stories docs](https://community.esri.com/t5/arcgis-storymaps-blog/how-to-view-your-classic-esri-story-maps-after/ba-p/1599422)
- [story maps retirement notes](https://community.esri.com/t5/arcgis-storymaps-blog/managing-the-classic-esri-story-maps-retirement-in/ba-p/1599398)
- [story converter notebook](https://www.arcgis.com/home/item.html?id=bc35e93d5d374e1a9c3583be0cc9f1d7)
- [story converter docs](https://community.esri.com/t5/arcgis-storymaps-blog/try-the-classic-story-conversion-helper/ba-p/1262201)
