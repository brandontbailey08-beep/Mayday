import { test } from "node:test";
import assert from "node:assert/strict";
import { RoomService } from "../server/rooms.js";
import { botCommand } from "../server/bots.js";
import { createSchedule } from "../server/simulation.js";
import { guidance } from "../shared/tutorial.js";
import type { Request, Role } from "../shared/protocol.js";

function solo(role: Role = "pilot", training = false) {
  let now = 0;
  const service = new RoomService(() => now);
  const created = service.request("human", { type: "create", name: "Tester" });
  assert.ok(created.ok && created.session);
  const room = service.rooms.get(created.session.code)!;
  const send = (request: Request) => service.request("human", request);
  assert.ok(send({ type: "role", role }).ok);
  assert.ok(send({ type: "training", enabled: training }).ok);
  for (const station of ["pilot", "engineer"] as const) {
    if (station !== role)
      assert.ok(send({ type: "bot", role: station, enabled: true }).ok);
  }
  const start = () => {
    assert.ok(send({ type: "ready", ready: true }).ok);
    assert.ok(send({ type: "start" }).ok);
  };
  return {
    service,
    room,
    send,
    start,
    session: created.session,
    advance: (ms: number) => {
      now += ms;
      service.step(0.05);
    },
  };
}

test("host manages bots; bots are ready, count toward capacity and cannot take human seats", () => {
  const { service, room, send } = solo();
  assert.equal(room.members.find((m) => m.bot)?.role, "engineer");
  assert.ok(room.members.find((m) => m.bot)?.ready);
  assert.equal(send({ type: "bot", role: "pilot", enabled: true }).ok, false);
  assert.equal(send({ type: "bot", role: "pilot", enabled: false }).ok, false);
  service.request("guest", { type: "join", name: "Guest", code: room.code });
  assert.equal(
    service.request("guest", { type: "bot", role: "pilot", enabled: false }).ok,
    false,
  );
  assert.equal(
    service.request("guest", { type: "training", enabled: true }).ok,
    false,
  );
  // Joining in the lobby hands a bot station to a human.
  assert.equal(
    room.members.find((m) => m.socketId === "guest")?.role,
    "engineer",
  );
  assert.equal(
    room.members.some((m) => m.bot),
    false,
  );
  for (let i = 0; i < 6; i++)
    assert.ok(
      service.request(`observer-${i}`, {
        type: "join",
        name: "Observer",
        code: room.code,
      }).ok,
    );
  assert.ok(send({ type: "role", role: "observer" }).ok);
  assert.equal(send({ type: "bot", role: "pilot", enabled: true }).ok, false);
});

test("humans can take over a bot in the lobby; bot edits are blocked during flight", () => {
  const { room, send, start } = solo();
  assert.ok(send({ type: "role", role: "engineer" }).ok);
  assert.equal(
    room.members.some((m) => m.bot),
    false,
  );
  assert.ok(send({ type: "bot", role: "pilot", enabled: true }).ok);
  start();
  assert.equal(send({ type: "bot", role: "pilot", enabled: false }).ok, false);
  assert.equal(send({ type: "training", enabled: true }).ok, false);
});

test("engineer bot waits for the human pilot to reduce thrust before extinguishing", () => {
  const { service, room, send, start } = solo();
  start();
  room.schedule = [];
  room.aircraft.engines[1].fire = true;
  service.step(0.8);
  assert.equal(room.aircraft.engines[1].fuelOpen, false);
  assert.equal(room.aircraft.engines[1].fire, true);
  assert.match(service.snapshot(room, "human").botAdvice!, /40%/);
  assert.ok(
    send({
      type: "command",
      sequence: 1,
      command: { type: "throttle", value: 0.35 },
    }).ok,
  );
  service.step(0.8);
  assert.equal(room.aircraft.engines[1].fire, false);
  assert.equal(room.aircraft.resolved, 1);
  assert.match(service.snapshot(room, "human").botAdvice!, /100%/);
});

test("pilot bot coordinates reduced thrust with a human engineer", () => {
  const { service, room, send, start } = solo("engineer");
  start();
  room.schedule = [];
  room.aircraft.engines[1].fire = true;
  service.step(0.8);
  assert.equal(room.aircraft.throttle, 0.35);
  assert.ok(
    send({
      type: "command",
      sequence: 1,
      command: { type: "fuel", engine: 1, open: false },
    }).ok,
  );
  assert.ok(
    send({
      type: "command",
      sequence: 2,
      command: { type: "extinguish", engine: 1 },
    }).ok,
  );
  service.step(0.8);
  assert.equal(room.aircraft.throttle, 1);
});

test("two bots complete standard missions across twenty failure seeds", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { service, room, start } = solo("observer");
    start();
    room.schedule = createSchedule(seed);
    for (let i = 0; i < 6000 && room.phase === "flying"; i++)
      service.step(0.05);
    assert.equal(room.phase, "landed", `seed ${seed}: ${room.report?.reason}`);
    assert.equal(room.report?.resolved, 3);
  }
});

test("bots never become host, pause when all humans disconnect, and do not keep rooms alive", () => {
  const { service, room, advance, start } = solo("observer");
  start();
  service.disconnect("human");
  assert.equal(service.paused(room), true);
  assert.ok(!room.members.find((m) => m.id === room.hostId)?.bot);
  advance(30_000);
  assert.equal(room.aircraft.elapsed, 0);
  advance(30_001);
  assert.equal(service.rooms.size, 0);
  const second = solo();
  second.send({ type: "leave" });
  assert.equal(second.service.rooms.size, 0);
});

test("tutorial holds aircraft steady until the student completes the current task", () => {
  const { service, room, send, start } = solo("pilot", true);
  start();
  for (let i = 0; i < 1000; i++) service.step(0.1);
  assert.equal(room.tutorialStage, "setup");
  assert.equal(room.aircraft.altitude, 3600);
  assert.equal(room.aircraft.distance, 12);
  assert.equal(room.aircraft.integrity, 100);
  assert.equal(room.aircraft.elapsed, 0);
  assert.ok(
    send({
      type: "command",
      sequence: 1,
      command: { type: "altitude", value: 1200 },
    }).ok,
  );
  service.step(0.1);
  assert.equal(room.tutorialStage, "fire");
  for (let i = 0; i < 1000; i++) service.step(0.1);
  assert.equal(room.tutorialStage, "fire");
  assert.equal(room.aircraft.integrity, 100);
  const guide = guidance(service.snapshot(room, "human"), "pilot");
  assert.equal(guide.target, "throttle");
  assert.equal(guide.step, 2);
});

test("both student roles can complete all six tutorial stages with a bot partner", () => {
  for (const role of ["pilot", "engineer"] as const) {
    const { service, room, send, start } = solo(role, true);
    start();
    let sequence = 0;
    const stages = new Set([room.tutorialStage]);
    for (let i = 0; i < 6000 && room.phase === "flying"; i++) {
      const proposed = botCommand(room.aircraft, role);
      if (proposed)
        assert.ok(
          send({ type: "command", sequence: ++sequence, command: proposed }).ok,
        );
      service.step(0.05);
      stages.add(room.tutorialStage);
    }
    assert.equal(room.phase, "landed", `${role} tutorial`);
    assert.equal(stages.size, 6);
    assert.equal(room.report?.resolved, 3);
    assert.ok(send({ type: "restart" }).ok);
    assert.equal(room.tutorialStage, null);
    assert.equal(room.training, true);
    assert.ok(room.members.filter((m) => m.bot).every((m) => m.ready));
  }
});

test("refreshing a tutorial resumes the existing step and bot partner", () => {
  const { service, room, send, start, session } = solo("pilot", true);
  start();
  send({
    type: "command",
    sequence: 1,
    command: { type: "altitude", value: 1200 },
  });
  service.step(0.05);
  service.disconnect("human");
  assert.ok(
    service.request("resumed", {
      type: "resume",
      code: room.code,
      token: session.token,
    }).ok,
  );
  const s = service.snapshot(room, "resumed");
  assert.equal(s.tutorialStage, "fire");
  assert.equal(s.players.filter((p) => p.bot).length, 1);
  assert.equal(JSON.stringify(s).includes(session.token), false);
});

test("tutorial APP can capture while training motion is held", () => {
  const { service, room, send, start } = solo("pilot", true);
  start();
  // Reach the prepared approach through ordinary tutorial controls.
  let sequence = 0;
  for (let i = 0; i < 3000 && room.tutorialStage !== "approach"; i++) {
    const command = botCommand(room.aircraft, "pilot");
    if (command)
      assert.ok(send({ type: "command", sequence: ++sequence, command }).ok);
    service.step(0.05);
  }
  assert.equal(room.tutorialStage, "approach");
  assert.ok(
    send({
      type: "command",
      sequence: ++sequence,
      command: { type: "gear", down: true },
    }).ok,
  );
  if (!room.aircraft.autopilot.engaged)
    assert.ok(
      send({
        type: "command",
        sequence: ++sequence,
        command: { type: "mcp", action: "autopilot" },
      }).ok,
    );
  assert.ok(
    send({
      type: "command",
      sequence: ++sequence,
      command: { type: "mcp", action: "approach" },
    }).ok,
  );
  service.step(0.05);
  assert.equal(room.tutorialStage, "landing");
  assert.equal(room.aircraft.autopilot.approach, "captured");
  assert.ok(room.aircraft.elapsed > 0);
});
