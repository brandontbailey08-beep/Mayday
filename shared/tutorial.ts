import type { Role, Snapshot, TutorialStage } from "./protocol.js";
export const TUTORIAL_STAGES: TutorialStage[] = [
  "setup",
  "fire",
  "hydraulics",
  "electrical",
  "approach",
  "landing",
];
export interface Guidance {
  title: string;
  body: string;
  target: string | null;
  step: number;
}
export function guidance(s: Snapshot, role: Role): Guidance {
  const f = s.flight;
  const stage =
    s.tutorialStage ??
    (f.landing !== null
      ? "landing"
      : f.warnings.includes("ENGINE WARNING")
        ? "fire"
        : f.warnings.includes("HYDRAULIC PRESSURE")
          ? "hydraulics"
          : f.warnings.includes("ALTITUDE HOLD OFFLINE")
            ? "electrical"
            : f.distance <= 4
              ? "approach"
              : "setup");
  const step = TUTORIAL_STAGES.indexOf(stage) + 1;
  const hint = (
    title: string,
    body: string,
    target: string | null = null,
  ): Guidance => ({ title, body, target, step });
  if (role === "observer")
    return hint(
      "Watch your crew work",
      "Pilot and engineer have different controls. Bots fill empty stations for testing. Watch the crew frequency to follow each decision.",
    );
  switch (stage) {
    case "setup":
      return role === "pilot"
        ? hint(
            "Set up the diversion",
            "Set the MCP ALTITUDE window to 1,200 FT and select FLCH. AP CMD follows your selected heading and altitude; LOC intercepts the runway centerline. A/T holds the selected airspeed. Use Guide anytime to review your next step.",
            f.pilot?.targetAltitude !== 1200 ? "altitude" : "heading",
          )
        : hint(
            "Meet your station",
            `You control fuel valves, fire bottles, an oil-routing puzzle and a replaceable avionics rack. The pilot handles flight controls.${s.training ? " Once the pilot selects 1,200 FT, we’ll practice an engine fire." : " Monitor your warnings and coordinate thrust changes before repairs."}`,
            "engine-status-1",
          );
    case "fire": {
      if (role === "pilot")
        return hint(
          "Help contain the fire",
          "Reduce THRUST to 40% or less. Your engineer must close the affected fuel valve and discharge its bottle. After repair, restore thrust to 100% to fly on one engine.",
          "throttle",
        );
      const index = f.engineer?.engines.findIndex((e) => e.fire) ?? 1;
      const engine = index < 0 ? 1 : index;
      const open = f.engineer?.engines[engine].fuelOpen;
      return hint(
        open ? `Isolate engine ${engine + 1}` : "Discharge the fire bottle",
        open
          ? `ENGINE ${engine + 1} has a fire. Close that engine’s fuel valve first. The pilot bot will reduce thrust for you; a human pilot needs your callout.`
          : "Fuel is isolated. With pilot thrust at 40% or less, discharge the affected engine’s bottle. If thrust is too high, use the Reduce thrust callout. The isolated engine stays off for this flight.",
        open ? `fuel-${engine}` : `fire-${engine}`,
      );
    }
    case "hydraulics":
      return role === "engineer"
        ? hint(
            "Restore hydraulic pressure",
            "Tap pipes to rotate them clockwise. Connect PUMP on the left of row 2 to RETURN on the right of row 3. Amber shows connected oil; follow it to find leaks. When the route is complete, press Pressure-test oil circuit. This restores gear and flight control pressure.",
            "oil-puzzle",
          )
        : hint(
            "Wait for hydraulic pressure",
            "Your engineer is restoring the oil circuit. AP disconnects and gear changes are blocked until pressure returns. Restore THRUST to 100% after the fire. In live flight, use the yoke to stay level, then re-engage AP CMD after repair.",
            "throttle",
          );
    case "electrical":
      return role === "engineer"
        ? hint(
            "Recover the electrical bus",
            "Ask for ≤55% thrust, isolate rack power, unplug all three cables, then click the rack marked FAULT. Insert its replacement. Select each loose cable and click the matching symbol on the right; click a connected cable to unplug mistakes. Test the harness and restart. A pilot bot handles thrust.",
            "rack-puzzle",
          )
        : hint(
            "Unload the electrical bus",
            "Reduce THRUST to 55% or less while the engineer replaces and rewires the faulty rack. Once the warning clears, restore thrust to 100%.",
            "throttle",
          );
    case "approach":
      return role === "pilot"
        ? hint(
            "Bring Flight 404 home",
            `${f.warnings.length === 0 && s.training ? "Restore THRUST to 100%. " : "Maintain 170–240 KT. "}Lower landing gear. Engage AP CMD, then APP to capture the approach. AP follows the runway and glide path, then hands control back at 150 FT. You can also choose Hand-fly final.${s.training ? " The tutorial has positioned you near the runway." : ""}`,
            !f.gear ? "gear" : "mcp-approach",
          )
        : hint(
            "Confirm the aircraft is ready",
            "All three repairs are complete. Send Systems stable. The pilot will lower the gear, fly the centerline, descend and flare. A pilot bot flies these controls for you.",
            null,
          );
    case "landing":
      return role === "pilot"
        ? hint(
            f.altitude < 50 ? "Flare for touchdown" : "Fly the final approach",
            "With APP captured, AP guides the aircraft until 150 FT. When the display says YOUR CONTROL, follow the bank and descent cues in the windshield. Bank turns continuously: level the wings after each correction. Stay close to the glide path. Below 50 FT and within 0.32 NM, press Flare to ease descent to −240 FT/MIN. Touch down aligned, wings level, at 150–225 KT. Use Go around if unstable. Training automatically retries an unsuccessful landing.",
            f.altitude < 50 ? "flare" : "bank",
          )
        : hint(
            "Monitor the approach",
            "The pilot is steering down the approach and flaring for touchdown. Monitor the aircraft and keep systems healthy. Training retries an unsuccessful landing.",
          );
  }
}
