import type { Aircraft, Command } from "../shared/protocol.js";
import {
  angleDifference,
  clamp,
  flightDirector,
  glideAltitude,
  interceptHeading,
} from "../shared/approach.js";

export function disconnectAutopilot(
  a: Aircraft,
  reason: "pilot" | "systems" | "minimums",
) {
  if (a.autopilot.engaged) {
    a.commandedBank = clamp(a.bank, -25, 25);
    a.commandedDescent = clamp(a.verticalSpeed, -1800, 600);
  }
  a.autopilot.engaged = false;
  a.autopilot.approach = "off";
  a.autopilot.disconnectReason = reason;
}
export function mcpCommand(
  a: Aircraft,
  action: Extract<Command, { type: "mcp" }>["action"],
): string | null {
  const ap = a.autopilot;
  if (action === "flightDirector") {
    ap.flightDirector = !ap.flightDirector;
    return null;
  }
  if (action === "disconnect" || (action === "autopilot" && ap.engaged)) {
    disconnectAutopilot(a, "pilot");
    return null;
  }
  if (action === "autoThrottle") {
    if (!ap.autoThrottle && a.electricalFault)
      return "Autothrottle unavailable until the avionics rack is repaired.";
    ap.autoThrottle = !ap.autoThrottle;
    return null;
  }
  if (action === "autopilot") {
    if (a.electricalFault || a.hydraulicFault)
      return "Autopilot unavailable. Engineer must restore hydraulics and avionics.";
    if (a.landing !== null && a.altitude < 200)
      return "Below 200 FT: hand-fly the landing. Use the yoke and flare.";
    ap.engaged = true;
    ap.disconnectReason = null;
    // Re-engagement never silently resumes a previously captured glideslope.
    if (ap.vertical === "glideslope") ap.vertical = "verticalSpeed";
    return null;
  }
  if (action === "approach") {
    if (ap.approach !== "off") {
      ap.approach = "off";
      ap.lateral = "heading";
      ap.vertical = "levelChange";
      ap.localizerCaptured = false;
      return null;
    }
    if (!ap.engaged)
      return "Engage AP CMD before arming APP. The flight director can still guide manual flight.";
    if (a.altitude < 200)
      return "Too low to arm APP. Hand-fly the landing or go around.";
    ap.approach = "armed";
    ap.lateral = "localizer";
    ap.localizerCaptured = false;
    return null;
  }
  if (action === "heading") {
    ap.lateral = "heading";
    ap.localizerCaptured = false;
  }
  if (action === "localizer") {
    ap.lateral = "localizer";
    ap.localizerCaptured = false;
  }
  if (action === "altitudeHold") {
    ap.holdAltitude = a.altitude;
    ap.vertical = "altitude";
  }
  if (action === "verticalSpeed") ap.vertical = "verticalSpeed";
  if (action === "levelChange") ap.vertical = "levelChange";
  if (ap.approach !== "off") {
    ap.approach = "off";
    if (ap.vertical === "glideslope") ap.vertical = "verticalSpeed";
  }
  return null;
}

export function autopilotStep(
  a: Aircraft,
  dt: number,
  canCaptureApproach: boolean,
) {
  const ap = a.autopilot;
  if ((a.hydraulicFault || a.electricalFault) && ap.engaged)
    disconnectAutopilot(a, "systems");
  if (a.electricalFault) ap.autoThrottle = false;
  if (ap.engaged && a.landing !== null && a.altitude <= 150) {
    disconnectAutopilot(a, "minimums");
    ap.autoThrottle = false;
  }
  const power = a.engines.filter((e) => e.fuelOpen && a.fuel > 0).length / 2;
  if (ap.autoThrottle && power > 0) {
    const desired = clamp(
      (ap.selectedSpeed - 130 + (a.gear ? 15 : 0)) / (180 * power) +
        (ap.selectedSpeed - a.speed) * 0.003,
      0,
      1,
    );
    a.throttle += (desired - a.throttle) * Math.min(1, dt * 2);
  }
  let bank = a.commandedBank,
    climb = a.commandedDescent;
  if (!ap.engaged) return { bank, climb };
  if (
    ap.lateral === "localizer" &&
    !ap.localizerCaptured &&
    a.distance <= 8 &&
    Math.abs(a.crossTrack) <= 1.2 &&
    Math.abs(angleDifference(270, a.heading)) <= 35
  )
    ap.localizerCaptured = true;
  const heading =
    ap.lateral === "localizer" && ap.localizerCaptured
      ? interceptHeading(a.crossTrack, a.distance)
      : a.targetHeading;
  bank = clamp(angleDifference(heading, a.heading) * 1.8, -25, 25);
  if (
    ap.approach === "armed" &&
    ap.localizerCaptured &&
    canCaptureApproach &&
    Math.abs(a.altitude - glideAltitude(a.distance)) <= 350
  ) {
    ap.approach = "captured";
    ap.vertical = "glideslope";
    a.landing ??= 0;
  }
  if (ap.vertical === "glideslope") climb = flightDirector(a).descent;
  else if (ap.vertical === "verticalSpeed") {
    const error = a.targetAltitude - a.altitude;
    climb = ap.selectedVs;
    if (
      Math.abs(error) < 35 &&
      (Math.sign(error) === Math.sign(ap.selectedVs) || error === 0)
    ) {
      ap.vertical = "altitude";
      ap.holdAltitude = a.targetAltitude;
      climb = error * 3;
    }
  } else {
    const target =
      ap.vertical === "altitude" ? ap.holdAltitude : a.targetAltitude;
    climb = clamp((target - a.altitude) * 3, -1800, 1500);
    if (ap.vertical === "levelChange" && Math.abs(target - a.altitude) < 25) {
      ap.vertical = "altitude";
      ap.holdAltitude = target;
    }
  }
  // Preserve smooth manual control when the pilot disconnects or a fault trips AP.
  a.commandedBank = bank;
  a.commandedDescent = clamp(climb, -1800, 600);
  return { bank, climb };
}
