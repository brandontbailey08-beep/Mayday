# Architecture and protocol v2

## Authority

The server is the only writer of aircraft state. Shared TypeScript types improve development, while Zod validates all inbound requests at runtime. The browser presents snapshots and submits commands. Changing the browser's local representation cannot change a room's simulation.

`RoomService` is independent of HTTP and testable with an injected clock. `simulation.ts` holds deterministic state transitions, the seeded failure schedule, command interlocks, approach checks, and scoring. The server creates private random seeds; schedule details never go to clients.

## Socket.IO events

The client emits `request(payload, acknowledgement)`. An acknowledgement is `{ ok: true, session? }` or `{ ok: false, error }`. A session is returned only to the creating, joining, or resuming client: `{ code, playerId, token }`. The bearer token is generated with a cryptographic UUID and kept in tab-scoped session storage. Treat it as secret; it is excluded from manifests, logs and snapshots.

| Request type | Payload beyond `type`                         | Authority                                                  |
| ------------ | --------------------------------------------- | ---------------------------------------------------------- |
| `create`     | `name` (trimmed, 1–20 chars)                  | Not already in room                                        |
| `join`       | `name`, `code` (5 uppercase chars)            | Room under eight seats                                     |
| `resume`     | `code`, `token`                               | Matching disconnected seat within 60 seconds               |
| `role`       | `pilot`, `engineer`, or `observer`            | Unique active roles; lobby or vacant paused-flight station |
| `ready`      | boolean `ready`                               | Lobby only                                                 |
| `start`      | none                                          | Host; connected, ready pilot and engineer                  |
| `restart`    | none                                          | Host; completed flight                                     |
| `leave`      | none                                          | Own membership only                                        |
| `command`    | monotonic `sequence`, discriminated `command` | Connected active flight, correct station, valid interlocks |

The server emits `snapshot`. It includes protocol version, monotonic room tick, room code, recipient ID, host ID, public manifest, phase, pause flag, filtered flight view, last twelve log events, and optional result. Full snapshots remove the need for a delta replay buffer. Local command confirmation is immediate; other players receive the next 10 Hz broadcast.

Pilot-only fields: selected throttle, altitude, heading, bank, descent, rudder and full MCP mode/selection state. Engineer-only fields: engine fire/fuel/bottle/temperature state, exact system faults, remaining fuel, actual pilot thrust for repair coordination, oil tile orientations, rack stage and cable connections. Both see position-related instruments, structural integrity, gear status, generic cockpit warnings and crew messages. Observers receive shared fields only. Future stations should extend projection and authorization together.

The renderer interpolates aircraft bank and pitch from received telemetry. It has no physics authority and does not predict or reconcile gameplay state. UI controls send on committed change rather than flooding every drag frame.

## Lifecycle

```text
lobby -> flying -> landed | crashed -> lobby
            |
            +-> paused while either required station is disconnected/unoccupied
```

On disconnect, the flight pauses, the active host migrates to a connected member, and the station stays reserved for 60 seconds. A valid private token restores it. After expiry the member is removed; an observer can claim the now-vacant station. Explicit leave frees the seat immediately. Late joins are observers. When every member leaves or their disconnected reservations expire, the room is deleted.

The server takes one fixed 50 ms simulation step per timer callback. Overload slows simulation rather than applying a giant lethal catch-up delta. Production monitoring should track event-loop delay before increasing room limits. A single process currently caps rooms at 100; this is a guardrail, not a benchmarked capacity guarantee.

## Boundaries

- Maximum Socket.IO message: 4 KiB. Requests are strict schemas, finite numbers and bounded enums.
- Token bucket per connection: burst 40, refill 25 requests/second. Sequence numbers reject duplicate/out-of-order commands; sequence resets only when reattaching a socket.
- Same-origin browser requests by default; exact `PUBLIC_ORIGINS` list for public proxy setups. Both polling and WebSocket handshakes are checked. Non-browser clients without Origin are allowed; origin checking is not authentication.
- Player names are escaped before HTML display. No arbitrary text chat or executable markup enters snapshots.
- Room codes provide casual invitation access, not private-room authentication. No accounts, database, payment, or personal data beyond ephemeral callsigns.
- Add edge connection/IP throttling and room idle timeouts before opening a heavily promoted public service. Current application rate limits are not distributed abuse protection.

## Testing crew and tutorial

The host may send `bot { role: "pilot" | "engineer", enabled: boolean }` and `training { enabled: boolean }` in the lobby. Bots count toward the eight seats, are always ready, have no socket or resumable token, and never become host. Human lobby joins and role changes may replace a bot. Neither bot management nor mission changes are allowed during flight. Changing mission mode clears human readiness.

Every 0.8 simulation seconds, a bot may propose one normal command for its station. `applyCommand` enforces the same role and interlock rules. A testing bot can inspect the authoritative aircraft to coordinate with its partner; it is deliberately more informed than a human client and is not a model of human information constraints. Actions are logged, and `botAdvice` carries the engineer's pending request to the human pilot. No humans connected pauses even a two-bot observer flight; no remaining human reservations deletes the room.

Snapshots include `training`, `tutorialStage` and the public `bot` marker on each member. Training replaces the random director with six server-owned stages: setup, fire, hydraulics, electrical, approach and landing. Aircraft simulation is held during the first five stages, while bot decisions keep running. Successful task state advances the tutorial; after the electrical repair, the server positions the aircraft on final approach. Normal landing mechanics complete the final stage. Tutorial progress belongs to the room and survives client refresh; a server restart still ends the session.

The client renders hints from shared guidance functions without controlling progression. Standard flights use the same hints selected by current warnings. Guidance can be collapsed; coordination requests remain visible.

## Upstream references

- [Babylon.js ES modules](https://doc.babylonjs.com/setup/frameworkPackages/es6Support/)
- [Socket.IO server options](https://socket.io/docs/v4/server-options/)
- [Vite guide](https://vite.dev/guide/)

Versions actually installed are pinned in `package-lock.json`. Vite 6 supports the Node 20.18 runtime available during this build; deployment uses Node 22 LTS.

## Manual approach and repair puzzles (v2)

`land` now transfers to manual final; it never starts a completion timer. `bank` (−25…25°) changes heading through bank physics, `descent` (−1800…600 FT/MIN) controls vertical speed, and `throttle` stays live. Cross-track position is integrated from heading and speed with mild lateral drift. A touchdown succeeds only inside the runway footprint and all landing limits. `goAround` is an explicit arcade reposition with two uses. Shared flight-director functions provide cues, not automatic inputs.

Hydraulic `pipe {tile}` rotates one tile in a solvable 4×4 grid. `hydraulics` pressure-tests the authoritative inlet-to-return connectivity, rejecting leaks. The bot searches visible tile shapes and sends normal rotation commands; no solution is transmitted in snapshots.

Electrical repairs use `rackPower`, `wire {cable,port}` (port −1 disconnects), `rackRemove {slot}`, `rackInstall`, and finally `electrical`. Stage, thrust, cable occupancy and symbol matching interlocks are checked on the server. Client-side button state is only guidance. Puzzle state is copied into engineer snapshots and retained through reconnection. Production restarts still discard rooms.


## Virtual cockpit and MCP (protocol v4)

`server/autopilot.ts` owns AP engagement, FD indication, A/T speed control, heading/localizer modes and ALT HOLD/V/S/FLCH/glideslope modes. `holdAltitude` is separate from the MCP altitude selection. APP captures only when localizer, glide-path proximity and normal landing requirements are satisfied. At 150 FT it releases AP and A/T; there is no autoland. System faults disconnect automation. Pilot manual commands override AP, and manual throttle overrides A/T.

`rudder {value}` (-1…1) produces a small yaw rate separately from bank. A 350 ms authoritative lease clears it after lost release packets. The client renews held controls at 6.7 Hz, centers rudder and levels keyboard bank on release/focus loss, and ignores flight keys in editable fields/dialogs. Numeric MCP edits retain local drafts while snapshots arrive.

Station UI modules own their event lifetimes. A fixed cockpit keeps MCP, PFD and manual controls onscreen; phone layouts use an MCP drawer. The engineer mounts one focused repair workspace at a time. Babylon’s pilot camera follows actual heading, bank and vertical motion from snapshots; all movement and landing decisions remain server-authoritative. Training permits APP capture while physics is otherwise frozen during instruction.

## Ortho scenery (client 0.4; protocol remains v4)

`client/src/scenery.ts` builds an airport-centered scene graph. The root translates by cross-track position, altitude and threshold distance using 110 world units per nautical mile, with feet converted at the same scale. Both terrain and airport share that transform. `scene.ts` interpolates render state between server snapshots, snaps on tutorial/go-around repositions, and wraps heading interpolation across north. The rendered values do not feed back into commands or simulation.

USGS Imagery Only JPEG exports are bundled in `client/public/scenery`. The 4096px regional map repeats over a height field; the 2048px local image uses an opacity feather and matched Web Mercator UV registration. A failed regional image falls back to procedural grass, and the detail mesh appears only after its image loads. Terrain heights are decorative; the playable approach corridor stays flat. The server owns all flight and touchdown decisions.

Airport surface textures are generated once on local canvases. Static airport and vegetation meshes are merged by material; four PAPI lamps remain individually colored from the shared glide-altitude function. There is no map API key, streaming tile service or imagery request outside the game host. Canvas rendering is skipped for hidden documents and the engineer workspace. Browser HTTP caching reuses the images between sessions.
