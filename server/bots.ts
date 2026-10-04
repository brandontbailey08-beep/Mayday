import type { Aircraft, Command, Role } from "../shared/protocol.js";
import { landingRequirements } from "./simulation.js";
import { flightDirector, interceptHeading } from "../shared/approach.js";
import { oilFlow, solveOil } from "../shared/puzzles.js";

/** Bots propose ordinary station commands; the simulation still validates them. */
export function botCommand(a: Aircraft, role: Role): Command | null {
  if (role === "pilot") {
    const thrust = a.engines.some((e) => e.fire)
      ? 0.35
      : a.electricalFault
        ? 0.5
        : a.engines.some((e) => !e.fuelOpen)
          ? 1
          : 0.55;
    if (Math.abs(a.throttle - thrust) > 0.01)
      return { type: "throttle", value: thrust };
    if (a.landing !== null) {
      const director = flightDirector(a);
      const bank = Math.round(director.bank);
      const descent = Math.round(director.descent / 50) * 50;
      if (Math.abs(a.commandedDescent - descent) >= 100)
        return { type: "descent", value: descent };
      if (Math.abs(a.commandedBank - bank) >= 1)
        return { type: "bank", value: bank };
      return null;
    }
    if (a.targetAltitude !== 1200) return { type: "altitude", value: 1200 };
    if (
      a.autopilot.vertical === "altitude" &&
      Math.abs(a.autopilot.holdAltitude - 1200) > 30
    )
      return { type: "mcp", action: "levelChange" };
    if (!a.autopilot.engaged && !a.hydraulicFault && !a.electricalFault)
      return { type: "mcp", action: "autopilot" };
    const heading = Math.round(interceptHeading(a.crossTrack, a.distance));
    if (a.targetHeading !== heading) return { type: "heading", value: heading };
    if (a.distance <= 4 && !a.gear && !a.hydraulicFault)
      return { type: "gear", down: true };
    if (!landingRequirements(a).length) return { type: "land" };
  }
  if (role === "engineer") {
    for (const engine of [0, 1] as const) {
      const e = a.engines[engine];
      if (e.fire && e.fuelOpen) return { type: "fuel", engine, open: false };
      if (e.fire && e.bottle && a.throttle <= 0.4)
        return { type: "extinguish", engine };
    }
    if (a.hydraulicFault) {
      if (oilFlow(a.oil).connected) return { type: "hydraulics" };
      const solution = solveOil(a.oil);
      if (solution)
        for (const [tile, mask] of solution)
          if (a.oil.tiles[tile] !== mask) return { type: "pipe", tile };
    }
    if (a.electricalFault) {
      const r = a.rack;
      if (r.stage === "powered" && a.throttle <= 0.55)
        return { type: "rackPower" };
      if (r.stage === "isolated") {
        const cable = r.wiring.findIndex((port) => port >= 0);
        return cable >= 0
          ? { type: "wire", cable, port: -1 }
          : { type: "rackRemove", slot: r.faultySlot };
      }
      if (r.stage === "removed") return { type: "rackInstall" };
      if (r.stage === "installed") {
        const wrong = r.wiring.findIndex(
          (port, cable) => port >= 0 && r.labels[port] !== cable,
        );
        if (wrong >= 0) return { type: "wire", cable: wrong, port: -1 };
        const cable = r.wiring.findIndex((port) => port < 0);
        if (cable >= 0)
          return { type: "wire", cable, port: r.labels.indexOf(cable) };
        if (a.throttle <= 0.55) return { type: "electrical" };
      }
    }
    for (const engine of [0, 1] as const) {
      const e = a.engines[engine];
      if (!e.fire && !e.fuelOpen && e.bottle)
        return { type: "fuel", engine, open: true };
    }
  }
  return null;
}
export function botMessage(command: Command): string {
  switch (command.type) {
    case "throttle":
      return `Pilot bot: thrust set to ${Math.round(command.value * 100)}%.`;
    case "altitude":
      return "Pilot bot: descending to 1,200 FT.";
    case "heading":
      return `Pilot bot: intercept heading ${command.value}°.`;
    case "gear":
      return "Pilot bot: landing gear down.";
    case "land":
      return "Pilot bot: manual final. Tracking centerline and glide path.";
    case "bank":
      return `Pilot bot: bank ${command.value}°.`;
    case "descent":
      return `Pilot bot: vertical speed ${command.value} FT/MIN.`;
    case "pipe":
      return "Engineer bot: rotating oil pipe.";
    case "rackPower":
      return "Engineer bot: rack power isolated.";
    case "rackRemove":
      return "Engineer bot: faulty rack removed.";
    case "rackInstall":
      return "Engineer bot: replacement rack seated.";
    case "wire":
      return command.port < 0
        ? "Engineer bot: cable disconnected."
        : "Engineer bot: wiring replacement harness.";
    case "fuel":
      return `Engineer bot: engine ${command.engine + 1} fuel ${command.open ? "restored" : "isolated"}.`;
    case "extinguish":
      return "Engineer bot: fire contained. Pilot, restore thrust to 100%.";
    case "hydraulics":
      return "Engineer bot: backup pump online.";
    case "electrical":
      return "Engineer bot: electrical bus restored.";
    default:
      return "Bot reports: station checked.";
  }
}
export function engineerAdvice(a: Aircraft): string | null {
  if (a.engines.some((e) => e.fire) && a.throttle > 0.4)
    return "Engineer bot needs you: reduce THRUST to 40% or less so I can discharge the fire bottle.";
  if (a.electricalFault && a.throttle > 0.55)
    return "Engineer bot needs you: reduce THRUST to 55% or less while I replace and rewire the avionics rack.";
  if (
    !a.engines.some((e) => e.fire) &&
    !a.electricalFault &&
    a.engines.some((e) => !e.bottle) &&
    a.throttle < 0.85
  )
    return "Engineer bot: the engine is safely isolated. Restore THRUST to 100% to maintain airspeed.";
  return null;
}
