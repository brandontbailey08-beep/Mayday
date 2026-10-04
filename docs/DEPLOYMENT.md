# Local, Playit, and always-on hosting

## One public endpoint

Production Node serves both the Vite build and Socket.IO on `0.0.0.0:3000` (or `PORT`). The browser connects to its own origin. Keep `/socket.io/` on the same public host; a static-only host cannot run the multiplayer server.

Build and start from this repository:

```sh
npm ci
npm run build
npm start
```

`GET /health` returns a small status object. For local testing, open `http://localhost:3000` in two independent tabs and create/join a room. If you duplicate a tab with an existing session, the copied resume token cannot take over a connected seat; it returns to check-in for a new player.

## Playit

For the existing **mayday.playit.plus** HTTP(S) tunnel, use Local IP **127.0.0.1**, HTTP Port **80**, HTTPS Port **443**, and Proxy Protocol **None**. Do not include a port in the Local IP field. Playit forwards TLS to the local machine; Caddy handles certificates and forwards requests and WebSockets to the updated game on port **3001** on this workstation. The generic npm start default remains 3000. The older process on 3000 is not used by the public tunnel.

The checked-in `deploy/playit/Caddyfile` configures this domain. On this workstation, `Start-Mayday-HTTPS.cmd` beside the project folder runs Caddy, keeping certificate data in `work/caddy`. The companion `Start-Mayday-Game.cmd` runs the updated game with PORT=3001; use http://localhost:3001 locally. Keep both services and Playit running. Do not run a second copy while either service is already running. Caddy needs outbound Internet access for certificate renewal. These launchers do not install automatically starting Windows services.

Other tunnel types may forward directly to **127.0.0.1:3000**. Share the browser-reachable HTTP(S) address and port provided by the tunnel. A raw TCP tunnel does not itself guarantee an HTTPS website; use the scheme supported by your actual tunnel/proxy configuration.

Build first and expose the production Node port, not the Vite development server. If the tunnel/proxy rewrites the Host header, set the exact public browser origin, then restart Node. PowerShell example:

```powershell
$env:PUBLIC_ORIGINS = 'https://your-real-public-host.example'
$env:PORT = '3000'
npm start
```

Replace the placeholder with your actual address, including a non-default port if there is one. Multiple allowed origins are comma-separated. Environment files are examples only; the server does not automatically read `.env`.

Verify from a phone on cellular data:

1. Open the public URL; confirm “TOWER CONNECTED”.
2. Create a flight and join from a second device.
3. Dispatch, change an altitude setting, and confirm the other device's telemetry changes.
4. Refresh one device. The flight should pause briefly and reconnect to the same station.

The PC, Node process, Caddy (for the HTTP(S) tunnel) and Playit agent must all stay running.

## Always-on container

The included multi-stage Dockerfile builds all assets, removes development dependencies, runs as an unprivileged user, and exposes port 3000.

```sh
docker build -t mayday-flight-404 .
docker run --name mayday --restart unless-stopped -p 3000:3000 -e PUBLIC_ORIGINS=https://your-game.example mayday-flight-404
```

On a container hosting service: use this Dockerfile, route HTTPS to container port 3000, configure `/health`, enable WebSocket upgrades, and use **one always-on instance** without scale-to-zero. Set `PUBLIC_ORIGINS` to the exact public URL. On a VPS, put a TLS reverse proxy in front of port 3000.

Example Caddy configuration (replace the domain):

```caddyfile
your-game.example {
    reverse_proxy 127.0.0.1:3000
}
```

For another proxy, preserve Host or configure allowed origins, allow WebSocket upgrades, and set its idle timeout above 60 seconds. Long polling remains available if WebSocket upgrades cannot pass through the tunnel.

## Operational limits

- One in-memory room owner: do not add replicas behind a load balancer yet. A Socket.IO adapter alone would not share the simulation state.
- Deploys/restarts end all flights. Durable sessions/checkpoints are future work.
- Logs are bounded per room; rooms disappear after the final disconnected reservation expires. A client deliberately holding a live room can keep it open, so put public traffic behind edge abuse limits.
- Browser assets are bundled locally; no paid assets, CDN, external API key or database is required.
- Run `npm run check` before releases. Docker deployment and an actual public Playit endpoint require validation in the target environment; local checks do not prove external routing.

No hosting service is purchased or provisioned by these files.
