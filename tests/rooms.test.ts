import { test } from "node:test";
import assert from "node:assert/strict";
import { RoomService } from "../server/rooms.js";
import type { Reply } from "../shared/protocol.js";
function session(reply: Reply) {
  assert.equal(reply.ok, true);
  if (!reply.ok || !reply.session) throw new Error("No session");
  return reply.session;
}
function crew() {
  let now = 0;
  const service = new RoomService(() => now);
  const pilot = session(
    service.request("p", { type: "create", name: "Pilot" }),
  );
  const engineer = session(
    service.request("e", { type: "join", code: pilot.code, name: "Engineer" }),
  );
  return {
    service,
    pilot,
    engineer,
    advance: (ms: number) => {
      now += ms;
      service.step(0.05);
    },
    room: service.rooms.get(pilot.code)!,
  };
}
function start(service: RoomService) {
  service.request("p", { type: "ready", ready: true });
  service.request("e", { type: "ready", ready: true });
  assert.deepEqual(service.request("p", { type: "start" }), { ok: true });
}
test("lobby requires both ready stations, prevents conflicts, enforces host and eight-seat capacity", () => {
  const { service, pilot, room } = crew();
  assert.equal(service.request("p", { type: "start" }).ok, false);
  assert.equal(service.request("e", { type: "role", role: "pilot" }).ok, false);
  assert.equal(service.request("e", { type: "start" }).ok, false);
  for (let i = 0; i < 6; i++)
    assert.equal(
      service.request(`o${i}`, {
        type: "join",
        code: pilot.code,
        name: "Observer",
      }).ok,
      true,
    );
  assert.equal(
    service.request("ninth", {
      type: "join",
      code: pilot.code,
      name: "No seat",
    }).ok,
    false,
  );
  start(service);
  assert.equal(room.phase, "flying");
});
test("invalid payloads, spoofed state, role violations and replayed inputs cannot mutate aircraft", () => {
  const { service, room } = crew();
  start(service);
  const initial = JSON.stringify(room.aircraft);
  for (const value of [NaN, Infinity, -1, 5])
    assert.equal(
      service.request("p", {
        type: "command",
        sequence: 1,
        command: { type: "throttle", value },
      }).ok,
      false,
    );
  assert.equal(
    service.request("p", {
      type: "command",
      sequence: 1,
      command: { type: "altitude", value: 2000, integrity: 100 },
    }).ok,
    false,
  );
  assert.equal(
    service.request("e", {
      type: "command",
      sequence: 1,
      command: { type: "throttle", value: 0.8 },
    }).ok,
    false,
  );
  assert.equal(JSON.stringify(room.aircraft), initial);
  assert.equal(
    service.request("p", {
      type: "command",
      sequence: 2,
      command: { type: "throttle", value: 0.8 },
    }).ok,
    true,
  );
  assert.equal(
    service.request("p", {
      type: "command",
      sequence: 2,
      command: { type: "throttle", value: 0.2 },
    }).ok,
    false,
  );
  assert.equal(room.aircraft.throttle, 0.8);
});
test("snapshots redact resume tokens, other station controls and future failure schedule", () => {
  const { service, room, pilot } = crew();
  start(service);
  const p = service.snapshot(room, "p"),
    e = service.snapshot(room, "e");
  assert.ok(p.flight.pilot);
  assert.equal(p.flight.engineer, undefined);
  assert.ok(e.flight.engineer);
  assert.equal(e.flight.pilot, undefined);
  assert.equal(JSON.stringify(p).includes(pilot.token), false);
  assert.equal("schedule" in p, false);
});
test("disconnect pauses simulation, migrates host, and resumes by private token", () => {
  const { service, pilot, room, advance } = crew();
  start(service);
  service.disconnect("p");
  const elapsed = room.aircraft.elapsed;
  advance(30_000);
  assert.equal(room.aircraft.elapsed, elapsed);
  assert.equal(service.paused(room), true);
  assert.equal(room.hostId, room.members.find((m) => m.socketId === "e")!.id);
  assert.equal(
    service.request("fake", {
      type: "resume",
      code: pilot.code,
      token: "00000000-0000-4000-8000-000000000000",
    }).ok,
    false,
  );
  assert.equal(
    service.request("p2", {
      type: "resume",
      code: pilot.code,
      token: pilot.token,
    }).ok,
    true,
  );
  advance(100);
  assert.equal(service.paused(room), false);
  assert.ok(room.aircraft.elapsed > elapsed);
});
test("expired seat can be filled by observer and empty rooms are reclaimed", () => {
  const { service, pilot, room, advance } = crew();
  start(service);
  service.request("o", { type: "join", code: pilot.code, name: "Relief" });
  service.disconnect("p");
  advance(60_001);
  assert.equal(service.request("o", { type: "role", role: "pilot" }).ok, true);
  assert.equal(service.paused(room), false);
  assert.equal(
    service.request("p2", {
      type: "resume",
      code: pilot.code,
      token: pilot.token,
    }).ok,
    false,
  );
  service.disconnect("o");
  service.disconnect("e");
  advance(60_001);
  assert.equal(service.rooms.size, 0);
});
test("restart returns completed crew to a clean lobby", () => {
  const { service, room } = crew();
  start(service);
  room.aircraft.integrity = 0;
  service.step(0.05);
  assert.equal(room.phase, "crashed");
  assert.equal(service.request("e", { type: "restart" }).ok, false);
  assert.equal(service.request("p", { type: "restart" }).ok, true);
  assert.equal(room.phase, "lobby");
  assert.equal(room.report, null);
  assert.equal(room.aircraft.integrity, 100);
  assert.ok(room.members.every((m) => !m.ready));
});
