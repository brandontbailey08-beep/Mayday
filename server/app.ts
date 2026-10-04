import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import {
  PROTOCOL_VERSION,
  SNAPSHOT_RATE,
  TICK_RATE,
  type ClientEvents,
  type ServerEvents,
} from "../shared/protocol.js";
import { RoomService } from "./rooms.js";

export function createGameServer(
  options: { origins?: string[]; autoTick?: boolean } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; worker-src 'self' blob:; frame-ancestors 'none'",
    );
    next();
  });
  const http = createServer(app);
  const io = new Server<ClientEvents, ServerEvents>(http, {
    serveClient: false,
    maxHttpBufferSize: 4096,
    cors: options.origins?.length ? { origin: options.origins } : undefined,
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      // Browser access is same-origin by default. Explicit origins work behind TLS proxies.
      let allowed = !origin;
      try {
        allowed ||= options.origins?.length
          ? options.origins.includes(origin!)
          : new URL(origin!).host === req.headers.host;
      } catch {
        /* invalid origin */
      }
      callback(null, allowed);
    },
  });
  const rooms = new RoomService();
  app.get("/health", (_req, res) =>
    res.json({
      status: "ok",
      protocol: PROTOCOL_VERSION,
      rooms: rooms.rooms.size,
    }),
  );
  const clientDist = fileURLToPath(new URL("../client/", import.meta.url));
  // At runtime this module lives in dist/server; Vite emits dist/client.
  app.use(
    express.static(clientDist, {
      index: "index.html",
      maxAge: "1h",
      setHeaders: (res, path) => {
        if (path.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );
  function broadcast() {
    for (const room of rooms.rooms.values())
      for (const member of room.members) {
        if (member.socketId)
          io.to(member.socketId).emit(
            "snapshot",
            rooms.snapshot(room, member.socketId),
          );
      }
  }
  io.on("connection", (socket) => {
    let tokens = 40,
      last = Date.now();
    socket.on("request", (request, ack) => {
      if (typeof ack !== "function") return;
      const now = Date.now();
      tokens = Math.min(40, tokens + (now - last) * 0.025);
      last = now;
      if (tokens < 1) {
        ack({ ok: false, error: "Too many inputs. Please slow down." });
        return;
      }
      tokens--;
      const reply = rooms.request(socket.id, request);
      ack(reply);
      // Immediate local confirmation; the next network tick updates other crew.
      const room = rooms.roomFor(socket.id);
      if (room) socket.emit("snapshot", rooms.snapshot(room, socket.id));
    });
    socket.on("disconnect", () => {
      rooms.disconnect(socket.id);
      broadcast();
    });
  });
  let ticks = 0;
  const timer =
    options.autoTick === false
      ? undefined
      : setInterval(() => {
          rooms.step(1 / TICK_RATE);
          if (++ticks % (TICK_RATE / SNAPSHOT_RATE) === 0) broadcast();
        }, 1000 / TICK_RATE);
  return {
    http,
    io,
    rooms,
    broadcast,
    close: async () => {
      clearInterval(timer);
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
