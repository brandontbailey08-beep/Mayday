# MAYDAY scenery credits

## Aerial imagery

**USDA, USGS The National Map: Orthoimagery.**

Source: [USGS Imagery Only service](https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer).
Service attribution at download: "USDA, USGS The National Map: Orthoimagery. Data refreshed June, 2024.v1.2."

Public-domain US government orthoimagery from the Colorado Front Range / Longmont area, downloaded October 4, 2026. The service's refresh date is not the photography's acquisition date.

- `colorado-ortho.jpg`: 4096 × 4096 regional image. Requested geographic bounds: west -105.24, south 40.06, east -104.96, north 40.275.
- `airport-ortho.jpg`: 2048 × 2048 airport-area detail. Requested bounds: west -105.078, south 40.094, east -105.022, north 40.137.
- Both exported as JPEG using geographic input coordinates (EPSG:4326), Web Mercator output (EPSG:3857) and the service's square-image aspect adjustment.

Images are bundled with the game and served from the same host. Players do not contact a third-party map service, need a map key, or download new map tiles during flight.

## Fictional airport and terrain

The airport, runway, taxiways, terminal, hangars, tower, parked aircraft, trees, buildings, lighting and height field are original procedural game scenery. The photographs are arranged and repeated to fit the fictional approach. This is not a geographically accurate reconstruction of a real airport, and the hills are not surveyed elevation data.

Runway markings and light placement are simplified for gameplay. PAPI colors respond to the game's glide-path error. The scenery is visual only; collision, landing and aircraft state remain controlled by the server.
