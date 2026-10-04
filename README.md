# MAYDAY: FLIGHT 404

**One aircraft. Every second. All of you.**

A browser-first asymmetric cooperative aviation disaster game. This repository contains the first playable vertical slice: a pilot and flight engineer divert a failing aircraft to Runway 27, coordinate repairs, and hand-fly the final approach and landing. Built with **Babylon.js 9, TypeScript, Vite, Node.js, and Socket.IO**.

## Run it

On this workstation, the updated public release is **https://mayday.playit.plus**, with the game at **http://localhost:3002** behind Caddy. Use `Start-Mayday-Game.cmd` and `Start-Mayday-HTTPS.cmd` beside this project to restart those services. Keep Playit running. The older local process on 3000 is separate from this public release. The source folder and source ZIP include the latest flight deck and ortho scenery update.

Use Node.js 22 LTS (20.18+ also supported by this locked toolchain).

```sh
npm ci
npm run dev
```

Open **http://localhost:5173**. For another device on your local network, use `http://YOUR-PC-LAN-IP:5173`. Allow the development server through the private-network firewall if prompted. Both devices must reach the same server.

For a public tunnel or production-style local hosting:

```sh
npm run build
npm start
```

Open **http://localhost:3000**. This single port serves the built client, Socket.IO, and `/health`. No separate client URL or CORS configuration is needed for normal same-origin local play.

## Aerial scenery (0.4)

The forward cockpit and exterior view now use bundled **4096px USGS/USDA Colorado orthoimagery**, a blended **2048px airport-area detail layer**, and rolling procedural terrain. Roads, fields, towns and lakes provide ground-motion cues. Runway 27 has worn asphalt, threshold numbers and bars, touchdown markings, edge/approach lights and glide-responsive PAPI. Taxiways, an apron, terminal, hangars, tower, parked aircraft, cars, fences, trees and nearby buildings complete the airfield.

The entire environment moves consistently with altitude, distance and cross-track position. Interpolated snapshots smooth the view between network updates. Scenery is visual only and never changes the authoritative landing rules. Static geometry is batched by material, textures use mipmaps, and rendering sleeps behind the engineer workspace or in a hidden tab.

The two JPEGs total about 7 MB and are served by the game itself; no imagery API key or live map requests are required. [Imagery attribution and source bounds](client/public/scenery/ATTRIBUTION.md). The airport and height field are fictional, arranged over real photographs rather than a reconstruction of a real airport.

## First flight

### Solo testing and bots

Create a flight, choose Pilot or Engineer, then click **Fill empty stations with bots**. Bots are automatically ready; ready your own station and dispatch. Individual **Add/Remove pilot bot** and **Add/Remove engineer bot** controls are also available to the host in the lobby. Choose **Observer** and fill both stations to watch a fully automated test flight.

Bots use the same station commands and repair interlocks as humans. The engineer bot shows a prominent request when it needs you to reduce thrust; the pilot bot handles thrust changes for a human engineer. Bots announce their decisions in the crew frequency. Humans can take a bot’s seat in the lobby; bots cannot displace people, become host, or keep an abandoned room alive.

### Guided tutorial

Click **Learn to fly · Solo tutorial** on the start screen for a pilot lesson with an engineer bot. A callsign is optional for this shortcut. To learn the engineer station, create a flight, choose Engineer, add the pilot bot, and select **Guided tutorial** before readying and dispatching.

The six stages cover route setup, engine fire, oil routing, rack replacement and rewiring, approach and landing. Position, damage and fuel are held steady during the first five stages. The final stage uses live flight; APP can guide the approach before handing control back at 150 FT; a failed training landing repositions you for another try. Each stage advances after the required actions succeed. The windshield coach and engineer’s next-action card explain each step; **Guide** opens the detailed instructions. Refreshing restores your tutorial step within the normal reconnect window. Return to briefing after touchdown to replay or switch to **Standard flight** with live physics and random failures.

Standard flights use the same contextual coach. **Crew** opens the manifest, invite and radio callouts.


### Virtual flight deck and MCP

The pilot station fills the browser window with a forward Babylon.js cockpit view, primary flight display, runway navigation display, a virtual yoke and a functional **Mode Control Panel**. The full MCP stays visible on desktop; use **MCP** to open its drawer on phones. The ⛶ button enters browser fullscreen where supported.

- **IAS + A/T:** select and hold airspeed. Moving the thrust lever releases autothrottle.
- **HDG SEL:** track the selected heading. **LOC:** intercept the runway centerline.
- **ALT HOLD:** capture current altitude; editing the altitude selection alone does not leave hold.
- **FLCH:** climb/descend to the selected altitude. **V/S:** use the selected vertical speed and capture the selected altitude on arrival.
- **APP:** arm localizer/glideslope capture when approach entry conditions and system health permit. The windshield explains the next unmet condition. At **150 FT**, AP and A/T release for manual landing; **Flare** eases descent below **50 FT**.
- **FD:** guidance bars only. **AP CMD / DISENGAGE:** engage or release steering. Hydraulic/electrical faults trip AP; it must be re-engaged after repairs.
- **A/D:** hold to bank left/right; release to level. **W/S:** nose down/up (decrease/increase vertical speed); pitch remains set when released. **Q/E:** hold left/right rudder; release to center. Manual flight input releases AP. Keyboard controls ignore typed fields and open dialogs.
- Touch: drag the yoke, use the bank/descent/thrust sliders and hold the rudder pedals. Rudder expires automatically if a release packet is lost.

The engineer has dedicated **Overview, Engines, Oil circuit and Avionics** workspaces, a numbered next action, visible pilot thrust and repair interlocks. The oil inlet/outlet, matching connector shapes and success states stay visible while working. Cockpit and shared UI use a blue-gray and navy aviation palette; amber remains reserved for cautions and oil flow.

### Multiplayer diversion

1. Create a flight with your callsign. Copy its invitation or share the five-character room code.
2. Your friend opens the same website and joins. The first player is assigned pilot; the second is engineer. You can choose a vacant station in the lobby.
3. Both active players mark ready. The host dispatches the flight. Voice is not built in: use a call or sit together. Quick callout buttons work in-game.
4. **Pilot:** select **1,200 FT** on the MCP and press **FLCH**, follow the changing **intercept heading** to close the centerline offset, maintain **170–240 KT**, and lower the gear.
5. **Engineer:** isolate the burning engine, coordinate **≤40% thrust**, then discharge its bottle. Repair hydraulics by rotating oil pipes from PUMP to RETURN and pressure-testing the route. For an electrical fault, coordinate **≤55% thrust**, isolate power, unplug three cables, remove the module marked FAULT, insert its replacement, match cable symbols to ports, then test and restart. Restore thrust after repairs; a single engine needs about **100%**.
6. Within **0.6–3.5 NM**, lower gear and use **AP CMD + APP** to capture the runway and glide path, or choose **Hand-fly final**. AP disconnects at **150 FT**; you fly **bank, pitch, rudder and thrust** to touchdown. Follow the flight director's cues and visible runway; level the wings after turns. Below **50 FT**, press **Flare** to ease descent to **−240 FT/MIN**. Touch down on the runway at **150–225 KT**, within **0.05 NM** of centerline, heading within **8°**, bank within **8°**, and descent no faster than **480 FT/MIN**. Landing is never completed by a timer.
7. **Go around** provides two explicit arcade repositions to final. Standard flights can fail from a missed runway, unsafe touchdown, terrain impact, damage or the eight-minute limit. Training automatically retries an unsuccessful final.

The three failures arrive in a seeded random order, at variable times, with a random engine affected. A run usually takes 4–6 minutes, depending on approach corrections and repairs. The controls are deliberately approachable game mechanics, not a real aircraft model or aviation training material.

## What is implemented

- Room creation/joining, shareable URLs, five-character codes, eight-seat capacity, unique active roles, readiness, host-only dispatch/restart, host migration.
- **Two active roles** and up to six observers. Observers see the exterior view and shared flight instruments. The remaining planned roles are not presented as finished features.
- Optional pilot/engineer testing bots, solo play, automated observer flights, and a six-stage interactive tutorial for either station.
- Server-authoritative aircraft simulation at 20 Hz; per-player snapshots at 10 Hz. Clients send validated commands; they never upload aircraft state.
- Role-filtered snapshots, input sequence checks, command rate limits, payload size limits, origin validation, bounded rooms and logs.
- Disconnect pause, private resume token, 60-second seat reservation, expired-seat replacement by an observer, empty-room cleanup. Browser refresh reconnects to the same seat within the grace period.
- Procedural fire, electrical, and hydraulic faults; coupled repairs; stall, damage, fuel, approach conditions, victory/failure, score report and replay.
- Babylon.js aircraft, terrain and clouds built from original geometry; responsive desktop/phone stations, keyboard-accessible inputs, reduced-motion support, WebGL failure fallback.
- Locked dependencies, strict TypeScript, simulation/room/live-network tests, CI, container build and deployment guide.

## Structure

```text
client/                 Vite browser app
  src/main.ts           UI, input, connection lifecycle and station views
  src/cockpit.ts        Full-window cockpit, MCP, PFD and navigation display
  src/engineering.ts    Focused system tasks and repair progress
  src/flight-controls.ts QWEASD keyboard and touch rudder controls
  src/stations.ts       Oil grid and rack service bay
  src/scene.ts          Babylon renderer (lazy loaded, display-only)
  src/style.css         Shared blue aviation theme
  src/deck.css          Cockpit and engineer workspace layouts
server/
  index.ts              Process lifecycle and environment configuration
  app.ts                HTTP, Socket.IO, validation boundary, tick scheduling
  rooms.ts              Lobby, role authority, reconnection, per-role snapshots
  bots.ts               Station-limited bot decisions and crew coordination
  simulation.ts         Pure aircraft mechanics and seeded failure director
  autopilot.ts          Authoritative MCP modes and approach capture
shared/protocol.ts      Network types, runtime request schemas and constants
shared/puzzles.ts       Pipe connectivity, solvable layouts and rack harnesses
shared/approach.ts      Glide path and flight-director calculations
shared/tutorial.ts      Contextual guidance and tutorial stage descriptions
tests/                  Simulation, room invariants and real Socket.IO tests
docs/                   Architecture, hosting and future work
```

## Commands

| Command             | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `npm run dev`       | Client hot reload on 5173 + server watch on 3000            |
| `npm run typecheck` | Check browser, shared code and server                       |
| `npm test`          | Room/security/reconnect, seeded missions, live socket tests |
| `npm run build`     | Production browser bundle and compiled server               |
| `npm start`         | Serve production build on `PORT` (default 3000)             |
| `npm run check`     | Typecheck, tests and production build                       |

## Hosting and next steps

See [deployment](docs/DEPLOYMENT.md), [protocol and architecture](docs/ARCHITECTURE.md), and [roadmap](docs/ROADMAP.md).

The current room state lives in one Node process. Restarting the server ends existing flights. Always-on deployment should run **one replica** with automatic restart and HTTPS. Horizontal scaling, persistent progression, built-in voice, manual landing, and six additional active stations are future work.
