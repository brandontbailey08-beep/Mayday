import { test } from "node:test";
import {
  createOilPuzzle,
  oilFlow,
  solveOil,
  rotatePipe,
} from "../shared/puzzles.js";
import { commandSchema } from "../shared/protocol.js";
import assert from "node:assert/strict";
import {
  applyCommand,
  createAircraft,
  createSchedule,
  stepAircraft,
  triggerFailure,
} from "../server/simulation.js";

test("failure director is seeded, varied, and schedules all three repair mechanics", () => {
  assert.deepEqual(createSchedule(42), createSchedule(42));
  assert.notDeepEqual(createSchedule(42), createSchedule(43));
  assert.equal(new Set(createSchedule(42).map((f) => f.kind)).size, 3);
});
test("fire suppression requires correct station, isolated fuel, and pilot coordination", () => {
  const a = createAircraft();
  triggerFailure(a, { at: 0, kind: "fire", engine: 1 });
  assert.match(
    applyCommand(a, "pilot", { type: "extinguish", engine: 1 })!,
    /another station/,
  );
  assert.match(
    applyCommand(a, "engineer", { type: "extinguish", engine: 1 })!,
    /fuel valve/,
  );
  applyCommand(a, "engineer", { type: "fuel", engine: 1, open: false });
  assert.match(
    applyCommand(a, "engineer", { type: "extinguish", engine: 1 })!,
    /40%/,
  );
  applyCommand(a, "pilot", { type: "throttle", value: 0.4 });
  assert.equal(
    applyCommand(a, "engineer", { type: "extinguish", engine: 1 }),
    null,
  );
  assert.equal(a.engines[1].fire, false);
  assert.equal(a.resolved, 1);
  assert.match(
    applyCommand(a, "engineer", { type: "fuel", engine: 1, open: true })!,
    /remainder/,
  );
});
test("oil circuits are varied, solvable and require actual connected pipes", () => {
  const layouts = new Set<string>();
  for (let seed = 0; seed < 100; seed++) {
    const a = createAircraft();
    a.hydraulicFault = true;
    a.oil = createOilPuzzle(seed);
    layouts.add(a.oil.tiles.join(","));
    assert.equal(oilFlow(a.oil).connected, false);
    assert.match(applyCommand(a, "engineer", { type: "hydraulics" })!, /leaks/);
    assert.match(
      applyCommand(a, "pilot", { type: "pipe", tile: 0 })!,
      /another station/,
    );
    assert.match(
      applyCommand(a, "pilot", { type: "gear", down: true })!,
      /Hydraulics/,
    );
    const solution = solveOil(a.oil);
    assert.ok(solution);
    for (const [tile, mask] of solution) {
      while (a.oil.tiles[tile] !== mask)
        assert.equal(applyCommand(a, "engineer", { type: "pipe", tile }), null);
    }
    assert.ok(oilFlow(a.oil).connected);
    assert.equal(applyCommand(a, "engineer", { type: "hydraulics" }), null);
    assert.equal(a.resolved, 1);
    assert.equal(applyCommand(a, "pilot", { type: "gear", down: true }), null);
  }
  assert.ok(layouts.size > 30);
  const broken = { tiles: Array(16).fill(10) }; // Never reaches RETURN on row 3.
  assert.equal(oilFlow(broken).connected, false);
  assert.equal(rotatePipe(9), 3);
});

test("rack replacement enforces isolation, unplugging, correct slot and wiring before restart", () => {
  const a = createAircraft();
  triggerFailure(a, { at: 19, kind: "electrical", engine: 1 });
  assert.match(
    applyCommand(a, "engineer", { type: "electrical" })!,
    /replace|replacement|Isolate/,
  );
  assert.match(
    applyCommand(a, "engineer", { type: "wire", cable: 0, port: -1 })!,
    /Isolate/,
  );
  a.throttle = 0.9;
  assert.match(applyCommand(a, "engineer", { type: "rackPower" })!, /55%/);
  a.throttle = 0.5;
  assert.equal(applyCommand(a, "engineer", { type: "rackPower" }), null);
  assert.match(
    applyCommand(a, "engineer", {
      type: "rackRemove",
      slot: a.rack.faultySlot,
    })!,
    /Disconnect/,
  );
  for (let cable = 0; cable < 3; cable++)
    applyCommand(a, "engineer", { type: "wire", cable, port: -1 });
  assert.match(
    applyCommand(a, "engineer", {
      type: "rackRemove",
      slot: (a.rack.faultySlot + 1) % 3,
    })!,
    /healthy/,
  );
  assert.equal(
    applyCommand(a, "engineer", {
      type: "rackRemove",
      slot: a.rack.faultySlot,
    }),
    null,
  );
  assert.equal(applyCommand(a, "engineer", { type: "rackInstall" }), null);
  assert.match(applyCommand(a, "engineer", { type: "electrical" })!, /Harness/);
  applyCommand(a, "engineer", {
    type: "wire",
    cable: 0,
    port: a.rack.labels.indexOf(1),
  });
  assert.match(
    applyCommand(a, "engineer", {
      type: "wire",
      cable: 1,
      port: a.rack.labels.indexOf(1),
    })!,
    /occupied/,
  );
  assert.match(applyCommand(a, "engineer", { type: "electrical" })!, /Harness/);
  applyCommand(a, "engineer", { type: "wire", cable: 0, port: -1 });
  for (let cable = 0; cable < 3; cable++)
    applyCommand(a, "engineer", {
      type: "wire",
      cable,
      port: a.rack.labels.indexOf(cable),
    });
  assert.equal(applyCommand(a, "engineer", { type: "electrical" }), null);
  assert.equal(a.electricalFault, false);
  assert.equal(a.rack.stage, "online");
  assert.equal(a.resolved, 1);
});

test("manual final keeps pilot in control; steering changes lateral position", () => {
  const a = createAircraft();
  Object.assign(a, {
    altitude: 1200,
    distance: 3.3,
    crossTrack: 0.3,
    gear: true,
  });
  assert.equal(applyCommand(a, "pilot", { type: "land" }), null);
  assert.equal(
    applyCommand(a, "pilot", { type: "throttle", value: 0.7 }),
    null,
  );
  assert.equal(applyCommand(a, "pilot", { type: "bank", value: -15 }), null);
  assert.equal(
    applyCommand(a, "pilot", { type: "descent", value: -800 }),
    null,
  );
  for (let i = 0; i < 140; i++) assert.equal(stepAircraft(a, 0.1), null);
  assert.ok(a.crossTrack < 0.3);
  assert.ok(a.heading < 270);
  assert.ok(a.altitude > 0);
  assert.equal(
    applyCommand(a, "pilot", { type: "altitude", value: 1200 }),
    null,
  );
  assert.equal(
    a.autopilot.engaged,
    false,
    "Changing a selected altitude must not take manual control away",
  );
  assert.equal(applyCommand(a, "pilot", { type: "goAround" }), null);
  assert.equal(a.distance, 3.4);
  assert.equal(a.goArounds, 1);
  applyCommand(a, "pilot", { type: "goAround" });
  assert.match(applyCommand(a, "pilot", { type: "goAround" })!, /Two/);
});

test("touchdown validates runway position, alignment, speed, descent and gear", () => {
  const touchdown = () =>
    Object.assign(createAircraft(), {
      altitude: 0.1,
      distance: 0,
      crossTrack: 0,
      heading: 270,
      bank: 0,
      commandedBank: 0,
      speed: 195,
      gear: true,
      verticalSpeed: -240,
      commandedDescent: -240,
      landing: 0.99,
    });
  assert.equal(stepAircraft(touchdown(), 0.1)?.success, true);
  for (const change of [
    { crossTrack: 0.2 },
    { heading: 290 },
    { speed: 250 },
    { verticalSpeed: -1100, commandedDescent: -1100 },
    { gear: false },
    { bank: 20, commandedBank: 20 },
  ]) {
    assert.equal(
      stepAircraft(Object.assign(touchdown(), change), 0.1)?.success,
      false,
      JSON.stringify(change),
    );
  }
  const high = touchdown();
  high.altitude = 700;
  high.distance = -1;
  assert.equal(stepAircraft(high, 0.1)?.success, false);
});

test("new controls reject malformed, out of range and forged repair commands", () => {
  for (const command of [
    { type: "pipe", tile: 16 },
    { type: "pipe", tile: 1.5 },
    { type: "wire", cable: 9, port: 0 },
    { type: "wire", cable: 0, port: 3 },
    { type: "bank", value: Infinity },
    { type: "descent", value: -9000 },
    { type: "rackRemove", slot: 3 },
    { type: "electrical", solved: true },
  ])
    assert.equal(commandSchema.safeParse(command).success, false);
});

test("unattended engine fire causes a loss and missed approach causes a loss", () => {
  const a = createAircraft();
  a.engines[0].fire = true;
  let result = null;
  for (let i = 0; i < 3000 && !result; i++) result = stepAircraft(a, 0.1);
  assert.equal(result?.success, false);
  const b = createAircraft();
  b.distance = 0.001;
  assert.match(stepAircraft(b, 1)!.reason, /Runway missed/);
});
