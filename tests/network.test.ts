import { test } from "node:test";
import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import { createGameServer } from "../server/app.js";
import type {
  ClientEvents,
  Request,
  ServerEvents,
  Snapshot,
} from "../shared/protocol.js";

test("real Socket.IO clients share one aircraft, isolate rooms, and receive role-filtered snapshots", async () => {
  const game = createGameServer({ autoTick: false });
  await new Promise<void>((resolve) =>
    game.http.listen(0, "127.0.0.1", resolve),
  );
  const address = game.http.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const clients: Socket<ServerEvents, ClientEvents>[] = [];
  const connect = async () => {
    const socket: Socket<ServerEvents, ClientEvents> = io(url, {
      autoConnect: false,
      transports: ["websocket"],
      forceNew: true,
    });
    clients.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
      socket.connect();
    });
    return socket;
  };
  const send = (s: Socket<ServerEvents, ClientEvents>, r: Request) =>
    s.timeout(2000).emitWithAck("request", r);
  try {
    const [pilot, engineer, separate] = await Promise.all([
      connect(),
      connect(),
      connect(),
    ]);
    const created = await send(pilot, { type: "create", name: "Alpha" });
    assert.ok(created.ok && created.session);
    const joined = await send(engineer, {
      type: "join",
      code: created.session.code,
      name: "Bravo",
    });
    assert.ok(joined.ok);
    const other = await send(separate, { type: "create", name: "Charlie" });
    assert.ok(other.ok && other.session);
    await send(pilot, { type: "ready", ready: true });
    await send(engineer, { type: "ready", ready: true });
    assert.deepEqual(await send(pilot, { type: "start" }), { ok: true });
    assert.equal(
      (
        await send(engineer, {
          type: "command",
          sequence: 1,
          command: { type: "altitude", value: 1200 },
        })
      ).ok,
      false,
    );
    assert.equal(
      (
        await send(pilot, {
          type: "command",
          sequence: 1,
          command: { type: "altitude", value: 1200 },
        })
      ).ok,
      true,
    );
    const pState = new Promise<Snapshot>((resolve) =>
      pilot.once("snapshot", resolve),
    );
    const eState = new Promise<Snapshot>((resolve) =>
      engineer.once("snapshot", resolve),
    );
    const oState = new Promise<Snapshot>((resolve) =>
      separate.once("snapshot", resolve),
    );
    game.rooms.step(1);
    game.broadcast();
    const [p, e, o] = await Promise.all([pState, eState, oState]);
    assert.equal(p.flight.altitude, e.flight.altitude);
    assert.ok(p.flight.altitude < 3600);
    assert.equal(o.flight.altitude, 3600);
    assert.equal(o.code, other.session.code);
    assert.equal(p.flight.engineer, undefined);
    assert.equal(e.flight.pilot, undefined);
    assert.equal((await fetch(`${url}/health`)).status, 200);
  } finally {
    clients.forEach((s) => s.disconnect());
    await game.close();
  }
});
test("origin allowlist rejects unapproved browser handshakes", async () => {
  const game = createGameServer({
    origins: ["https://flight.example"],
    autoTick: false,
  });
  await new Promise<void>((resolve) =>
    game.http.listen(0, "127.0.0.1", resolve),
  );
  const address = game.http.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/socket.io/?EIO=4&transport=polling`,
      { headers: { Origin: "https://unapproved.example" } },
    );
    assert.equal(response.status, 403);
    const allowed = await fetch(
      `http://127.0.0.1:${address.port}/socket.io/?EIO=4&transport=polling`,
      { headers: { Origin: "https://flight.example" } },
    );
    assert.equal(allowed.status, 200);
  } finally {
    await game.close();
  }
});
