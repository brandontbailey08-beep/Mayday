import type {
  Aircraft,
  Command,
  FlightReport,
  Role,
} from "../shared/protocol.js";
import { angleDifference, clamp } from "../shared/approach.js";
import {
  createOilPuzzle,
  createRackPuzzle,
  oilFlow,
  rotatePipe,
} from "../shared/puzzles.js";
export { angleDifference } from "../shared/approach.js";
import { autopilotStep, disconnectAutopilot, mcpCommand } from "./autopilot.js";

export type Failure = "fire" | "hydraulics" | "electrical";
export interface ScheduledFailure {
  at: number;
  kind: Failure;
  engine: 0 | 1;
}
export function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
export function createSchedule(seed: number): ScheduledFailure[] {
  const random = randomSource(seed);
  const kinds: Failure[] = ["fire", "hydraulics", "electrical"];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  return kinds.map((kind, i) => ({
    kind,
    at: 16 + i * 37 + Math.floor(random() * 8),
    engine: random() < 0.5 ? 0 : 1,
  }));
}
export function createAircraft(): Aircraft {
  const engine = () => ({
    fire: false,
    fuelOpen: true,
    bottle: true,
    temperature: 480,
  });
  return {
    autopilot: {
      engaged: true,
      flightDirector: true,
      autoThrottle: false,
      selectedSpeed: 205,
      selectedVs: -1000,
      holdAltitude: 3600,
      lateral: "heading",
      vertical: "levelChange",
      localizerCaptured: false,
      approach: "off",
      disconnectReason: null,
    },
    crossTrack: 0.8,
    commandedBank: 0,
    commandedDescent: -1000,
    rudder: 0,
    rudderTime: 0,
    goArounds: 0,
    oil: createOilPuzzle(42),
    rack: createRackPuzzle(42),
    altitude: 3600,
    speed: 225,
    heading: 270,
    targetAltitude: 3600,
    targetHeading: 270,
    throttle: 0.55,
    gear: false,
    integrity: 100,
    fuel: 100,
    distance: 12,
    verticalSpeed: 0,
    bank: 0,
    elapsed: 0,
    landing: null,
    engines: [engine(), engine()],
    hydraulicFault: false,
    electricalFault: false,
    resolved: 0,
  };
}
export function landingRequirements(a: Aircraft): string[] {
  const unmet: string[] = [];
  if (a.distance > 3.5 || a.distance < 0.6)
    unmet.push("Between 0.6 and 3.5 NM");
  if (a.altitude < 800 || a.altitude > 1800)
    unmet.push("Altitude 800–1,800 FT");
  if (a.speed < 170 || a.speed > 240) unmet.push("Airspeed 170–240 KT");
  if (Math.abs(angleDifference(270, a.heading)) > 25)
    unmet.push("Heading within 25° of Runway 27");
  if (Math.abs(a.crossTrack) > 0.6)
    unmet.push("Intercept centerline: within 0.6 NM");
  if (!a.gear) unmet.push("Landing gear down");
  if (a.engines.some((e) => e.fire) || a.hydraulicFault || a.electricalFault)
    unmet.push("Engineer: clear all failures");
  return unmet;
}
export function applyCommand(
  a: Aircraft,
  role: Role,
  command: Command,
): string | null {
  if (command.type === "callout")
    return role === "observer"
      ? "Observers cannot transmit crew callouts."
      : null;
  const pilot = [
    "rudder",
    "throttle",
    "altitude",
    "heading",
    "gear",
    "land",
    "bank",
    "descent",
    "goAround",
    "mcp",
    "selectedSpeed",
    "selectedVs",
  ].includes(command.type);
  if (role !== (pilot ? "pilot" : "engineer"))
    return "That control belongs to another station.";
  switch (command.type) {
    case "rudder":
      if (command.value !== 0) disconnectAutopilot(a, "pilot");
      a.rudder = command.value;
      a.rudderTime = 0.35;
      break;
    case "mcp":
      return mcpCommand(a, command.action);
    case "selectedSpeed":
      a.autopilot.selectedSpeed = command.value;
      break;
    case "selectedVs":
      a.autopilot.selectedVs = command.value;
      break;
    case "throttle":
      a.autopilot.autoThrottle = false;
      a.throttle = command.value;
      break;
    case "altitude":
      a.targetAltitude = command.value;
      break;
    case "heading":
      a.targetHeading = command.value;
      break;
    case "gear":
      if (a.hydraulicFault)
        return "Hydraulics unavailable. Ask the engineer to repair the oil circuit.";
      a.gear = command.down;
      break;
    case "land": {
      if (a.landing !== null) return "You already have manual control.";
      const unmet = landingRequirements(a);
      if (unmet.length) return unmet.join(" · ");
      a.landing = 0;
      disconnectAutopilot(a, "pilot");
      a.commandedBank = 0;
      a.commandedDescent = -1000;
      break;
    }
    case "bank":
      disconnectAutopilot(a, "pilot");
      a.commandedBank = command.value;
      break;
    case "descent":
      disconnectAutopilot(a, "pilot");
      a.commandedDescent = command.value;
      break;
    case "goAround":
      if ((a.landing === null && a.distance > 4) || a.goArounds >= 2)
        return "Two go-arounds available on final or within 4 NM of the runway.";
      // Arcade reposition: explicit reset, never a hidden automatic landing.
      a.goArounds++;
      a.rudder = 0;
      a.rudderTime = 0;
      disconnectAutopilot(a, "pilot");
      a.distance = 3.4;
      a.altitude = 1200;
      a.heading = 270;
      a.crossTrack = 0.18;
      a.bank = 0;
      a.verticalSpeed = 0;
      a.commandedBank = 0;
      a.commandedDescent = -1000;
      a.landing = 0;
      break;
    case "fuel":
      if (command.open && !a.engines[command.engine].bottle)
        return "This engine is shut down for the remainder of the flight.";
      a.engines[command.engine].fuelOpen = command.open;
      break;
    case "extinguish": {
      const e = a.engines[command.engine];
      if (!e.fire) return "No fire detected in that engine.";
      if (e.fuelOpen) return "Close this engine’s fuel valve first.";
      if (a.throttle > 0.4)
        return "Ask the pilot to reduce thrust to 40% or less.";
      if (!e.bottle) return "Fire bottle already discharged.";
      e.fire = false;
      e.bottle = false;
      a.resolved++;
      break;
    }
    case "hydraulics":
      if (!a.hydraulicFault) return "Hydraulic pressure is normal.";
      if (!oilFlow(a.oil).connected)
        return "Oil circuit leaks. Connect PUMP to RETURN before pressure testing.";
      a.hydraulicFault = false;
      a.resolved++;
      break;
    case "electrical":
      if (!a.electricalFault) return "Electrical buses are online.";
      if (a.rack.stage !== "installed")
        return "Isolate power, unplug the cables, remove the faulty rack and install its replacement first.";
      if (a.throttle > 0.55)
        return "Ask the pilot to reduce thrust to 55% or less before resetting.";
      if (
        a.rack.wiring.some(
          (port, cable) => port < 0 || a.rack.labels[port] !== cable,
        )
      )
        return "Harness check failed. Match each cable symbol to its labeled port.";
      a.electricalFault = false;
      a.rack.stage = "online";
      a.resolved++;
      break;
    case "pipe":
      if (!a.hydraulicFault) return "Oil circuit is already pressurized.";
      a.oil.tiles[command.tile] = rotatePipe(a.oil.tiles[command.tile]);
      break;
    case "rackPower":
      if (!a.electricalFault || a.rack.stage !== "powered")
        return "Rack power is already isolated.";
      if (a.throttle > 0.55)
        return "Ask the pilot for 55% thrust or less before isolating power.";
      a.rack.stage = "isolated";
      break;
    case "wire":
      if (
        !a.electricalFault ||
        !["isolated", "installed"].includes(a.rack.stage)
      )
        return "Isolate power before touching the harness.";
      if (command.port >= 0 && a.rack.stage !== "installed")
        return "Install the replacement rack before rewiring.";
      if (
        command.port >= 0 &&
        a.rack.wiring.some(
          (port, cable) => cable !== command.cable && port === command.port,
        )
      )
        return "That port is occupied. Unplug its cable first.";
      a.rack.wiring[command.cable] = command.port;
      break;
    case "rackRemove":
      if (!a.electricalFault || a.rack.stage !== "isolated")
        return "Isolate rack power first.";
      if (command.slot !== a.rack.faultySlot)
        return "That rack is healthy. Find the module with the FAULT indicator.";
      if (a.rack.wiring.some((port) => port >= 0))
        return "Disconnect all three cables before removing the rack.";
      a.rack.stage = "removed";
      break;
    case "rackInstall":
      if (!a.electricalFault || a.rack.stage !== "removed")
        return "Remove the faulty rack before installing the spare.";
      a.rack.stage = "installed";
      break;
  }
  return null;
}
export function triggerFailure(a: Aircraft, failure: ScheduledFailure): string {
  switch (failure.kind) {
    case "fire":
      a.engines[failure.engine].fire = true;
      return "Engine warning. Engineer: diagnose the affected engine.";
    case "hydraulics":
      a.hydraulicFault = true;
      disconnectAutopilot(a, "systems");
      a.oil = createOilPuzzle(
        Math.round(failure.at * 100) + failure.engine + a.resolved * 17,
      );
      return "Hydraulic pressure lost. Gear and flight controls affected.";
    case "electrical":
      a.electricalFault = true;
      disconnectAutopilot(a, "systems");
      a.autopilot.autoThrottle = false;
      a.rack = createRackPuzzle(
        Math.round(failure.at) + failure.engine + a.resolved,
      );
      return "Avionics rack fault. Altitude hold offline; engineer must replace and rewire the module.";
  }
}
export function stepAircraft(a: Aircraft, dt: number): FlightReport | null {
  a.elapsed += dt;
  // Spring-loaded rudder expires if a release packet or browser focus is lost.
  a.rudderTime = Math.max(0, a.rudderTime - dt);
  if (a.rudderTime === 0 || a.autopilot.engaged) a.rudder = 0;
  const controls = autopilotStep(a, dt, !landingRequirements(a).length);
  const power = a.engines.filter((e) => e.fuelOpen && a.fuel > 0).length / 2;
  const desiredSpeed = 130 + a.throttle * 180 * power - (a.gear ? 15 : 0);
  a.speed += (desiredSpeed - a.speed) * Math.min(1, dt * 0.16);
  const climb = controls.climb;
  const stall = Math.max(0, 150 - a.speed);
  a.verticalSpeed +=
    (climb * (a.hydraulicFault ? 0.35 : 1) - stall * 75 - a.verticalSpeed) *
    Math.min(1, dt * 2);
  a.altitude += (a.verticalSpeed / 60) * dt;
  a.bank += (controls.bank - a.bank) * Math.min(1, dt * 2);
  a.heading =
    (a.heading +
      (a.bank * 0.16 + a.rudder * 2.2) * dt * (a.hydraulicFault ? 0.4 : 1) +
      360) %
    360;
  const track = Math.max(
    0,
    Math.cos((angleDifference(270, a.heading) * Math.PI) / 180),
  );
  a.distance -= (a.speed / 3600) * dt * track;
  a.crossTrack +=
    ((a.speed / 3600) *
      Math.sin((angleDifference(a.heading, 270) * Math.PI) / 180) +
      0.0012 * Math.sin(a.elapsed / 12)) *
    dt;
  if (a.landing !== null) a.landing = clamp(1 - a.distance / 3.5, 0, 1);
  a.fuel = Math.max(0, a.fuel - dt * (0.04 + a.throttle * 0.08));
  for (const e of a.engines) {
    e.temperature +=
      ((e.fire ? 1100 : e.fuelOpen ? 350 + a.throttle * 330 : 80) -
        e.temperature) *
      Math.min(1, dt * 0.2);
    if (e.fire) a.integrity -= dt * (e.fuelOpen ? 0.7 : 0.35);
  }
  if (a.hydraulicFault) a.integrity -= dt * 0.12;
  if (stall > 0) a.integrity -= dt * stall * 0.08;
  a.integrity = clamp(a.integrity, 0, 100);
  if (a.integrity <= 0)
    return report(
      a,
      false,
      "Critical damage. The aircraft could not be recovered.",
    );
  if (
    a.altitude <= 0 &&
    a.landing !== null &&
    a.distance <= 0.15 &&
    a.distance >= -0.9
  ) {
    const safe =
      Math.abs(a.crossTrack) <= 0.05 &&
      Math.abs(angleDifference(270, a.heading)) <= 8 &&
      Math.abs(a.bank) <= 8 &&
      a.verticalSpeed >= -480 &&
      a.speed >= 150 &&
      a.speed <= 225 &&
      a.gear &&
      !a.hydraulicFault &&
      !a.electricalFault &&
      !a.engines.some((e) => e.fire);
    a.altitude = 0;
    return report(
      a,
      safe,
      safe
        ? "Runway 27 secured. Manual landing complete. Everyone made it home."
        : "Unsafe touchdown. Align with the centerline, level the wings, and flare to −240 FT/MIN below 50 FT.",
    );
  }
  if (a.altitude <= 0)
    return report(
      a,
      false,
      "Terrain impact. Keep airspeed above 150 KT and monitor altitude.",
    );
  if (a.distance <= (a.landing !== null ? -0.9 : 0))
    return report(
      a,
      false,
      "Runway missed. Intercept the approach, descend on the glide path, and flare before touchdown. Use Go around if unstable.",
    );
  if (a.elapsed >= 480)
    return report(
      a,
      false,
      "Diversion window expired. Maintain heading 270° toward the airfield.",
    );
  return null;
}
function report(a: Aircraft, success: boolean, reason: string): FlightReport {
  return {
    success,
    reason,
    score: success
      ? Math.round(
          a.integrity * 100 +
            a.resolved * 1500 +
            Math.max(0, 480 - a.elapsed) * 10,
        )
      : 0,
    integrity: Math.round(a.integrity),
    duration: Math.round(a.elapsed),
    resolved: a.resolved,
  };
}
