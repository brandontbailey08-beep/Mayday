import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCommand,
  createAircraft,
  stepAircraft,
  triggerFailure,
} from "../server/simulation.js";
import { commandSchema } from "../shared/protocol.js";
import { flightDirector } from "../shared/approach.js";

test("rudder changes heading, releases AP and expires if key-up is lost", () => {
  const a = createAircraft();
  assert.equal(
    commandSchema.safeParse({ type: "rudder", value: 2 }).success,
    false,
  );
  assert.match(
    applyCommand(a, "engineer", { type: "rudder", value: 1 })!,
    /another station/,
  );
  applyCommand(a, "pilot", { type: "rudder", value: 1 });
  assert.equal(a.autopilot.engaged, false);
  for (let i = 0; i < 4; i++) stepAircraft(a, 0.05);
  assert.ok(a.heading > 270.3);
  for (let i = 0; i < 5; i++) stepAircraft(a, 0.05);
  assert.equal(a.rudder, 0);
  const heading = a.heading;
  stepAircraft(a, 0.1);
  assert.equal(a.heading, heading);
  applyCommand(a, "pilot", { type: "rudder", value: -1 });
  stepAircraft(a, 0.05);
  assert.ok(a.heading < heading);
  applyCommand(a, "pilot", { type: "rudder", value: 0 });
  assert.equal(a.rudder, 0);
});

test("an uncaptured approach can go around after missing the entry window", () => {
  const a = createAircraft();
  a.distance = 0.5;
  assert.equal(a.landing, null);
  assert.equal(applyCommand(a, "pilot", { type: "goAround" }), null);
  assert.equal(a.distance, 3.4);
  assert.equal(a.goArounds, 1);
  assert.equal(a.autopilot.engaged, false);
});

test("MCP commands are bounded and restricted to the pilot", () => {
  for (const command of [
    { type: "selectedSpeed", value: 500 },
    { type: "selectedVs", value: -3000 },
    { type: "mcp", action: "autoland" },
  ])
    assert.equal(commandSchema.safeParse(command).success, false);
  const a = createAircraft();
  assert.match(
    applyCommand(a, "engineer", { type: "mcp", action: "disconnect" })!,
    /another station/,
  );
  assert.equal(a.autopilot.engaged, true);
});

test("heading, altitude hold, FLCH and V/S drive distinct flight behavior", () => {
  const a = createAircraft();
  applyCommand(a, "pilot", { type: "mcp", action: "altitudeHold" });
  applyCommand(a, "pilot", { type: "altitude", value: 3000 });
  applyCommand(a, "pilot", { type: "heading", value: 285 });
  for (let i = 0; i < 100; i++) stepAircraft(a, 0.05);
  assert.ok(a.heading > 275);
  assert.ok(
    Math.abs(a.altitude - 3600) < 1,
    "ALT HOLD must ignore a new selected altitude until a climb/descent mode is chosen",
  );
  applyCommand(a, "pilot", { type: "mcp", action: "levelChange" });
  for (let i = 0; i < 100; i++) stepAircraft(a, 0.05);
  assert.ok(a.altitude < 3500);
  applyCommand(a, "pilot", { type: "selectedVs", value: -500 });
  applyCommand(a, "pilot", { type: "mcp", action: "verticalSpeed" });
  for (let i = 0; i < 100; i++) stepAircraft(a, 0.05);
  assert.ok(Math.abs(a.verticalSpeed + 500) < 1);
  a.altitude = 3010;
  stepAircraft(a, 0.05);
  assert.equal(a.autopilot.vertical, "altitude");
  assert.equal(a.autopilot.holdAltitude, 3000);
});

test("autothrottle holds speed and manual input releases the corresponding automation", () => {
  const a = createAircraft();
  applyCommand(a, "pilot", { type: "selectedSpeed", value: 190 });
  applyCommand(a, "pilot", { type: "mcp", action: "autoThrottle" });
  for (let i = 0; i < 800; i++) stepAircraft(a, 0.05);
  assert.ok(Math.abs(a.speed - 190) < 1);
  applyCommand(a, "pilot", { type: "throttle", value: 0.4 });
  assert.equal(a.autopilot.autoThrottle, false);
  assert.equal(a.throttle, 0.4);
  applyCommand(a, "pilot", { type: "bank", value: 10 });
  assert.equal(a.autopilot.engaged, false);
  applyCommand(a, "pilot", { type: "mcp", action: "flightDirector" });
  for (let i = 0; i < 50; i++) stepAircraft(a, 0.05);
  assert.ok(a.bank > 9, "FD is guidance only, never an autopilot");
});

test("system faults trip AP and prevent re-engagement until repaired", () => {
  const a = createAircraft();
  triggerFailure(a, { at: 0, kind: "electrical", engine: 0 });
  assert.equal(a.autopilot.engaged, false);
  assert.equal(a.autopilot.disconnectReason, "systems");
  assert.match(
    applyCommand(a, "pilot", { type: "mcp", action: "autopilot" })!,
    /Engineer/,
  );
  assert.match(
    applyCommand(a, "pilot", { type: "mcp", action: "autoThrottle" })!,
    /unavailable/,
  );
});

test("APP captures eligible approaches, hands control back at minimums, and permits a manual touchdown", () => {
  for (const crossTrack of [-0.3, 0, 0.3]) {
    const a = Object.assign(createAircraft(), {
      altitude: 1200,
      targetAltitude: 1200,
      distance: 3.3,
      crossTrack,
      speed: 205,
      throttle: 0.5,
      gear: true,
    });
    applyCommand(a, "pilot", { type: "selectedSpeed", value: 200 });
    applyCommand(a, "pilot", { type: "mcp", action: "autoThrottle" });
    applyCommand(a, "pilot", { type: "mcp", action: "approach" });
    stepAircraft(a, 0.05);
    assert.equal(a.autopilot.approach, "captured");
    assert.equal(a.autopilot.localizerCaptured, true);
    let result = null,
      manual = false;
    for (let i = 0; i < 3000 && !result; i++) {
      if (!a.autopilot.engaged) {
        if (!manual) {
          assert.ok(a.altitude < 151);
          assert.equal(a.autopilot.disconnectReason, "minimums");
          assert.equal(a.autopilot.autoThrottle, false);
          assert.match(
            applyCommand(a, "pilot", { type: "mcp", action: "autopilot" })!,
            /Below 200/,
          );
          manual = true;
        }
        const cue = flightDirector(a);
        applyCommand(a, "pilot", { type: "bank", value: cue.bank });
        applyCommand(a, "pilot", { type: "descent", value: cue.descent });
      }
      result = stepAircraft(a, 0.05);
    }
    assert.ok(manual);
    assert.equal(result?.success, true, `${crossTrack}: ${result?.reason}`);
  }
});

test("APP remains armed until gear, faults and approach position permit capture", () => {
  const a = Object.assign(createAircraft(), {
    altitude: 1200,
    distance: 3.3,
    crossTrack: 0,
    speed: 205,
  });
  applyCommand(a, "pilot", { type: "mcp", action: "approach" });
  stepAircraft(a, 0.05);
  assert.equal(a.autopilot.approach, "armed");
  assert.equal(a.landing, null);
  applyCommand(a, "pilot", { type: "gear", down: true });
  stepAircraft(a, 0.05);
  assert.equal(a.autopilot.approach, "captured");
});
