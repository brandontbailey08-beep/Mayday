# Validation — cockpit and aerial scenery

Validated on Windows, October 4, 2026. Prototype 0.4, protocol v4.

## Automated checks

- Client/server type checking and production client/server compilation pass.
- 34 tests pass, including real Socket.IO clients, station authority, role-filtered snapshots, room isolation, reconnects, replay protection and malformed payload rejection.
- MCP checks cover selected heading, separate current-altitude hold, FLCH, V/S altitude capture, A/T speed convergence, manual override, FD without AP steering, fault disconnection and low-altitude re-engagement rejection.
- APP captures approaches from left/center/right, tracks LOC and glide path, disconnects AP/A/T at 150 FT, then permits a successful manual landing. Capture waits for gear and approach requirements. Tutorial APP captures while instructional motion is held.
- Rudder changes heading independently of bank, obeys role/bounds validation, disconnects AP and returns to center when its input lease expires. Missed approach entry can be recovered with a limited go-around.
- Bots complete 20 standard failure seeds and both six-stage tutorials; 100 randomized oil puzzles are solvable. Rack isolation, faulty module selection, cable occupancy, symbol matching and thrust interlocks are covered.
- Vite production build used the programmatic API with symlink preservation and inline compiler settings in this restricted desktop session. The normal npm build is available outside this sandbox.

## Browser checks

- Pilot station: full-window forward camera, MCP, primary flight and navigation displays, numeric entry, knobs, manual pitch input, gear and AP CMD/APP/A/T interactions. Browser displayed LOC CAPTURED / G/S CAPTURED and changing altitude, heading and speed on a live approach.
- Found and fixed snapshot updates overwriting typed MCP values. Typed selections now commit with Enter, blur or a short pause while valid.
- Engineer station: completed fuel isolation and suppression, rotated a visible oil route, pressure-tested, isolated avionics power, unplugged three cables, removed the faulty rack, inserted a replacement, matched all three symbols and restarted successfully.
- Desktop and 390×844 phone layouts inspected. The phone cockpit has no horizontal overflow; the MCP drawer, instruments, sliders and rudder controls fit. Engineer repair controls remain scrollable and reachable.
- Blue-gray/navy cockpit and engineer screens visually checked; amber cautions and oil remain distinct. Pilot browser check reported no console errors.

## Scenery checks (0.4)

- Client/server type checks and all 34 existing gameplay tests pass after scenery integration. Vite produces the client bundle and copies both JPEGs plus source attribution into the production output. No server protocol changes were needed.
- Desktop cockpit and 390×844 phone viewport visually checked with real ortho textures, rolling terrain, airport geometry and atmospheric sky. Phone page width equals viewport width (390px), without horizontal overflow. No browser errors or warnings were reported during the scenery checks.
- Flew the guided tutorial into APP / LOC / G/S capture and inspected the airport from the live approach. Terrain, runway and buildings now move together with the aircraft; the former floating-ground mismatch is removed.
- Corrected terrain face winding after the first visual check, then checked the textured surface from above in the cockpit. Matched the detail image to the regional image using their projected source extents. A close approach exposed clamped dynamic texture coordinates; explicit wrapping and runway UV offset now keep centerlines, numbers, mown stripes and slab textures visible.
- Both bundled images and the attribution document return HTTP 200 with the expected JPEG/Markdown content types from the local production server. The regional image is 5,977,085 bytes and the detail image 987,417 bytes. The browser renders a procedural surface while the regional image is loading.
- Phone testing uses a desktop browser viewport; physical mobile GPU performance, slow-network timing and long-running frame-rate benchmarks have not been measured.

## Hosting

The game runs on **http://localhost:3002**. Caddy was restarted with the existing certificate storage and proxies **https://mayday.playit.plus** to that server. Local certificate-validated HTTPS `/health` returned status ok and protocol 4. The 0.4 public release was verified in the browser at https://mayday.playit.plus: the updated version label, textured exterior and TOWER CONNECTED indicator appeared, with no browser warnings or errors. Launch scripts and Caddy configuration now use port 3002. Older processes on other ports are separate from this release.

## Limits

The cockpit and MCP are arcade flight controls, not a model-specific aircraft simulation. There is no autoland: the pilot takes over at 150 FT. Go-around is an explicit reposition, not a continuously flown missed approach. Phone viewport checks do not replace physical iOS/Android testing. Human difficulty balancing, voice coordination, load/soak tests and adverse-network tests remain future work. Room progress is held in memory and is lost on server restart.
