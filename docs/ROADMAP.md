# From vertical slice to full crew

## Shipped foundation

Two stations, three interacting failure types, one diversion mission, manual approach and flare, oil-routing puzzle, replaceable and rewirable avionics rack, seed variation, focused engineering workspace, full-window virtual cockpit, functional MCP/approach capture, QWEASD and touch controls, blue-gray aviation theme, responsive interfaces, real aerial imagery, detailed airport and rolling terrain, exterior 3D view, shared simulation, room/reconnect flow and flight report.

## Next playable milestone

1. Playtest with two humans. Measure repair comprehension, mission win rate, warning readability and phone control errors. Tune timing based on observations.
2. Navigator station with weather cells, route choices and terrain clearance. With two players, merge navigation tasks into the pilot; with three, move them to the navigator and redact that private information from the pilot projection.
3. Add a communications station with private ATC clearances and diversion choices; retain quick callouts and add an optional voice solution only after deployment requirements are decided.
4. Add cabin and operations stations, with meaningful controls and dependency loops. Define seventh/eighth crew seats as copilot and systems specialist only when each has distinct work. Do not fill seats with cosmetic roles.

## Depth and presentation

- Cascading fuel, pressure, engine, electrical and weather systems; data-driven failure catalog; difficulty budget and overlapping emergencies.
- Expand the manual approach with crosswinds, landing quality scoring and a continuously flown go-around (the current retry is an explicit arcade reposition).
- Audio mixer, warning priorities, engine sounds, screen shake controls, controller/key bindings and onboarding prompts.
- Procedural storm environment, aircraft damage effects, expanded airport activity and full-screen spectator mode.
- Murphy Mode: deliberate station rotations, updated visibility/permissions, and a handover grace period.
- Misleading instruments with fair cross-checks, flight medals and shareable reports.

## Service hardening before broad launch

- Idle/abandoned-room expiry, edge connection throttling, structured metrics and health beyond basic liveness.
- Browser end-to-end tests in CI, multi-device/mobile Safari playtests, accessibility pass, load/soak test and network impairment testing.
- Version negotiation for rolling deployments; graceful room draining; optional durable checkpoints.
- If scale requires multiple owners, partition rooms and route each flight to exactly one authoritative simulation process. Add persistent progression separately.
- Verify contest rules and deadline against the official current rules before submission. No eligibility or deadline assumption from the brainstorming conversation is encoded here.
