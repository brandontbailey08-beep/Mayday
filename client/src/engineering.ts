import type { Snapshot } from "../../shared/protocol";
import { oilFlow } from "../../shared/puzzles";
import { bindRepairs, repairsPanel, updateStations } from "./stations";
import {
  bindFlightUi,
  disabled,
  el,
  flightBar,
  flightDialogs,
  put,
  type Send,
  type Station,
} from "./flight-ui";
type Task = "overview" | "engines" | "oil" | "avionics";
const tasks: { id: Task; icon: string; name: string; subtitle: string }[] = [
  { id: "overview", icon: "◈", name: "Overview", subtitle: "Aircraft health" },
  {
    id: "engines",
    icon: "✺",
    name: "Engines",
    subtitle: "Fuel & fire protection",
  },
  { id: "oil", icon: "⌁", name: "Oil circuit", subtitle: "Hydraulic pressure" },
  { id: "avionics", icon: "▥", name: "Avionics", subtitle: "Rack & wiring" },
];
export function mountEngineering(
  host: HTMLElement,
  send: Send,
  current: () => Snapshot | undefined,
): Station {
  document.body.dataset.station = "engineer";
  let selected: Task = "overview",
    previousFaults = "";
  host.innerHTML = `<section class="engineering-shell">${flightBar("ENGINEERING")}<div class="systems-body"><header class="systems-heading"><div><span class="overline">FLIGHT ENGINEER / MF–404</span><h1>Systems bay<span>.</span></h1><p>A clear head. A steady hand. Keep your crew flying.</p></div><div class="systems-summary"><span id="system-health" class="health-pill"></span><div class="engineer-telemetry"><span>AIRSPEED <b id="eng-speed"></b></span><span>ALTITUDE <b id="eng-alt"></b></span><span>FUEL <b id="eng-fuel"></b></span><span>AIRFRAME <b id="eng-integrity"></b></span></div></div></header><div class="systems-layout"><nav class="systems-nav" aria-label="Engineering systems">${tasks.map((t, i) => `<button data-task="${t.id}" id="task-${t.id}" aria-pressed="false"><span class="system-icon">${t.icon}</span><span><strong>${t.name}</strong><small>${t.subtitle}</small></span><i id="task-dot-${t.id}"></i><em>0${i + 1}</em></button>`).join("")}<div class="partner-card"><span class="overline">PILOT COORDINATION</span><strong id="pilot-thrust"></strong><p id="partner-note"></p><button id="request-thrust">Request lower thrust ↗</button></div></nav><main class="systems-workspace"><header class="task-heading"><div><span id="task-eyebrow" class="overline"></span><h2 id="task-title"></h2></div><span id="task-progress" class="task-progress"></span></header><div id="next-action" class="next-action" role="status"><span class="action-number" id="action-number"></span><div><strong id="action-title"></strong><p id="action-detail"></p></div></div><section id="overview-panel" class="overview-panel"><div class="aircraft-blueprint"><svg viewBox="0 0 500 270" role="img" aria-label="Aircraft systems diagram"><defs><pattern id="blueprint-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#71859b20"/></pattern></defs><rect width="500" height="270" fill="url(#blueprint-grid)"/><path d="M250 24C240 25 238 50 238 95L92 176V190L238 152V217L192 245V252L250 238L308 252V245L262 217V152L408 190V176L262 95C262 50 260 25 250 24Z" fill="#76899d20" stroke="#b0bcc8" stroke-width="1.5"/><path d="M250 30V227" stroke="#c2d1e144" stroke-dasharray="3 6"/><rect x="177" y="130" width="17" height="38" rx="7" fill="#232e39" stroke="#8fa3b9"/><rect x="306" y="130" width="17" height="38" rx="7" fill="#232e39" stroke="#8fa3b9"/><circle id="diagram-engines" cx="186" cy="149" r="5"/><circle id="diagram-oil" cx="250" cy="161" r="5"/><circle id="diagram-avionics" cx="250" cy="63" r="5"/><path d="M186 149H88M255 161H366M255 63H360" stroke="#a9b8c9" stroke-dasharray="3 3"/><text x="32" y="141">ENGINES</text><text x="373" y="165">OIL</text><text x="365" y="67">AVIONICS</text></svg></div><div class="overview-cards">${tasks
    .slice(1)
    .map(
      (t) =>
        `<button data-open-task="${t.id}"><span>${t.icon}</span><strong>${t.name}</strong><small id="overview-${t.id}"></small><b>Inspect →</b></button>`,
    )
    .join(
      "",
    )}</div><p class="systems-note">Your pilot flies the aircraft. You diagnose faults and repair systems. New faults open here automatically; use the tabs to inspect anything.</p></section><section id="engines-panel" class="engines-workbench">${[0, 1].map((i) => `<article class="engine-module" id="engine-card-${i}"><div class="engine-module-top"><span>ENGINE 0${i + 1}</span><b id="engine-status-${i}"></b></div><div class="turbine" aria-hidden="true"><div>✺</div></div><div class="engine-readings"><div><small>EXHAUST</small><strong id="temp-${i}"></strong></div><div><small>FUEL VALVE</small><strong id="valve-${i}"></strong></div></div><div class="temperature-track"><i id="heat-${i}"></i></div><p id="engine-help-${i}"></p><div class="engine-action"><button id="fuel-${i}">1 · Close fuel valve</button><button id="fire-${i}" class="deck-primary">2 · Discharge fire bottle</button></div></article>`).join("")}</section><div class="focused-repairs">${repairsPanel()}</div><div id="task-success" class="task-success" hidden><span>✓</span><div><strong>System restored</strong><p>Your pilot has the controls back. Look for the next warning or check aircraft health.</p></div><button id="next-system">Back to overview →</button></div></main></div><div class="engineer-footer"><span id="station-message"></span><span class="crew-latest" id="engineer-radio"></span><button id="stable-callout">Report systems stable ↗</button></div></div>${flightDialogs()}</section>`;
  const updateCommon = bindFlightUi(send, current);
  bindRepairs(send, current);
  const choose = (task: Task) => {
    selected = task;
    const s = current();
    if (s) update(s);
  };
  document
    .querySelectorAll<HTMLButtonElement>("[data-task]")
    .forEach((b) => (b.onclick = () => choose(b.dataset.task as Task)));
  document
    .querySelectorAll<HTMLButtonElement>("[data-open-task]")
    .forEach((b) => (b.onclick = () => choose(b.dataset.openTask as Task)));
  el("next-system").onclick = () => choose("overview");
  el("request-thrust").onclick = () =>
    send({ type: "callout", message: "Reduce thrust" });
  el("stable-callout").onclick = () =>
    send({ type: "callout", message: "Systems stable" });
  el("hydraulics").onclick = () => send({ type: "hydraulics" });
  el("electrical").onclick = () => send({ type: "electrical" });
  for (const i of [0, 1] as const) {
    el(`fuel-${i}`).onclick = () =>
      send({
        type: "fuel",
        engine: i,
        open: !current()!.flight.engineer!.engines[i].fuelOpen,
      });
    el(`fire-${i}`).onclick = () => send({ type: "extinguish", engine: i });
  }
  function update(s: Snapshot) {
    updateCommon(s);
    updateStations(s);
    const f = s.flight,
      e = f.engineer!,
      r = e.rack;
    const faults: Record<Task, boolean> = {
      overview: false,
      engines: e.engines.some((engine) => engine.fire),
      oil: e.hydraulicFault,
      avionics: e.electricalFault,
    };
    const faultList = tasks.filter((t) => faults[t.id]).map((t) => t.id),
      signature = faultList.join(",");
    if (signature !== previousFaults && faultList.length && !faults[selected])
      selected = faultList[0];
    previousFaults = signature;
    for (const task of tasks) {
      el(`task-${task.id}`).classList.toggle("selected", selected === task.id);
      el(`task-${task.id}`).setAttribute(
        "aria-pressed",
        String(selected === task.id),
      );
      el(`task-dot-${task.id}`).classList.toggle("fault", faults[task.id]);
      if (task.id !== "overview") {
        put(
          `overview-${task.id}`,
          faults[task.id] ? "REPAIR REQUIRED" : "OPERATING NORMALLY",
        );
        el(`diagram-${task.id}`).setAttribute(
          "fill",
          faults[task.id] ? "#f2a76b" : "#a1bfe0",
        );
      }
    }
    el("overview-panel").hidden = selected !== "overview";
    el("engines-panel").hidden = selected !== "engines";
    el("oil-puzzle").hidden = selected !== "oil";
    el("rack-puzzle").hidden = selected !== "avionics";
    el("rack-puzzle").dataset.stage = !e.electricalFault ? "online" : r.stage;
    put(
      "system-health",
      faultList.length
        ? `${faultList.length} SYSTEM${faultList.length > 1 ? "S" : ""} NEED${faultList.length > 1 ? "" : "S"} ATTENTION`
        : "ALL SYSTEMS STABLE",
    );
    el("system-health").classList.toggle("has-fault", faultList.length > 0);
    put("eng-speed", `${Math.round(f.speed)} KT`);
    put("eng-alt", `${Math.round(f.altitude).toLocaleString()} FT`);
    put("eng-fuel", `${Math.round(e.fuel)}%`);
    put("eng-integrity", `${Math.round(f.integrity)}%`);
    put("pilot-thrust", `Pilot thrust · ${Math.round(e.throttle * 100)}%`);
    put(
      "partner-note",
      faults.engines
        ? "Fire bottle needs 40% or less."
        : faults.avionics
          ? "Rack power and restart need 55% or less."
          : "Repairs complete? Remind your pilot to restore thrust.",
    );
    disabled("request-thrust", s.paused);
    disabled("stable-callout", s.paused || faultList.length > 0);
    const names: Record<Task, string> = {
      overview: "Your aircraft, at a glance",
      engines: "Engine protection",
      oil: "Restore the oil circuit",
      avionics: "Avionics service bench",
    };
    put("task-title", names[selected]);
    put(
      "task-eyebrow",
      selected === "overview"
        ? "SYSTEMS OVERVIEW"
        : `ACTIVE WORKSPACE / ${selected.toUpperCase()}`,
    );
    let number = "✓",
      title = "Everything is running smoothly",
      detail =
        "Keep an eye on the system indicators. You'll be taken to the next fault when it appears.",
      progress = "MONITORING";
    if (selected === "engines" && faults.engines) {
      const i = e.engines.findIndex((engine) => engine.fire),
        engine = e.engines[i];
      number = engine.fuelOpen ? "1" : "2";
      progress = `STEP ${number} / 2`;
      title = engine.fuelOpen
        ? `Isolate engine ${i + 1}`
        : e.throttle > 0.4
          ? "Waiting for lower thrust"
          : `Discharge engine ${i + 1}'s bottle`;
      detail = engine.fuelOpen
        ? "Close the burning engine's fuel valve. The other engine keeps running."
        : e.throttle > 0.4
          ? `Pilot thrust is ${Math.round(e.throttle * 100)}%. Use Request lower thrust; the bottle unlocks at 40%.`
          : "Fuel is isolated and thrust is safe. Discharge the fire bottle below.";
    }
    if (selected === "oil" && faults.oil) {
      const flow = oilFlow(e.oil);
      number = flow.connected ? "2" : "1";
      progress = `STEP ${number} / 2`;
      title = flow.connected
        ? "The route is complete. Test pressure."
        : "Connect the pump to the return";
      detail = flow.connected
        ? "The amber oil reaches the green outlet. Pressure-test to restore the landing gear and flight controls."
        : "Tap any pipe to rotate it. Follow the amber oil from the left inlet, and join it to the green outlet on the right.";
      disabled("hydraulics", s.paused || !flow.connected);
    }
    if (selected === "avionics" && faults.avionics) {
      const connected = r.wiring.filter((p) => p >= 0).length;
      const correctlyWired = r.wiring.every(
        (p, c) => p >= 0 && r.labels[p] === c,
      );
      const phase =
        r.stage === "powered"
          ? 0
          : r.stage === "isolated"
            ? connected
              ? 1
              : 2
            : r.stage === "removed"
              ? 2
              : correctlyWired
                ? 4
                : 3;
      number = String(phase + 1);
      progress = `STEP ${number} / 5`;
      title = [
        "Isolate power to the damaged rack",
        `Unplug the harness · ${3 - connected} of 3 free`,
        r.stage === "removed"
          ? "Slide in the replacement"
          : "Remove the module marked FAULT",
        "Match the three cable symbols",
        "Restart the repaired avionics",
      ][phase];
      detail = [
        e.throttle > 0.55
          ? `Pilot thrust is ${Math.round(e.throttle * 100)}%. Request 55% or less to unlock power isolation.`
          : "Thrust is safe. Isolate rack power before touching the harness.",
        "Click each cable on the left to unplug it. The rack can only be removed when all three are loose.",
        r.stage === "removed"
          ? "The faulty module is out. Insert the spare to expose its new connectors."
          : "The orange module is faulty. Click it to release it from the chassis.",
        "Choose a loose cable, then click its matching symbol on the right. Shapes and names match. Click a connected cable to unplug a mistake.",
        e.throttle > 0.55
          ? "Harness matches. Ask for 55% thrust or less, then test and restart."
          : "All three cables match. Run the final test to restore the electrical bus.",
      ][phase];
      disabled(
        "rack-power",
        s.paused || r.stage !== "powered" || e.throttle > 0.55,
      );
      disabled(
        "electrical",
        s.paused ||
          r.stage !== "installed" ||
          !correctlyWired ||
          e.throttle > 0.55,
      );
      for (let i = 0; i < 3; i++)
        disabled(
          `rack-${i}`,
          s.paused ||
            r.stage !== "isolated" ||
            connected > 0 ||
            i !== r.faultySlot,
        );
    }
    el("next-action").classList.toggle("attention", faults[selected]);
    put("action-number", number);
    put("action-title", title);
    put("action-detail", detail);
    put("task-progress", progress);
    const done = selected !== "overview" && !faults[selected];
    el("task-success").hidden = !done;
    if (done) {
      put(
        "action-title",
        selected === "engines"
          ? "Engines secured"
          : "No active fault in this system",
      );
      put(
        "action-detail",
        "You can inspect the hardware below or switch to another system.",
      );
    }
    for (const i of [0, 1] as const) {
      const engine = e.engines[i];
      el(`engine-card-${i}`).classList.toggle("fault", engine.fire);
      put(
        `engine-status-${i}`,
        engine.fire ? "FIRE" : engine.fuelOpen ? "RUNNING" : "ISOLATED",
      );
      put(`temp-${i}`, `${Math.round(engine.temperature)}°C`);
      put(`valve-${i}`, engine.fuelOpen ? "OPEN" : "CLOSED");
      el(`heat-${i}`).style.width =
        `${Math.min(100, engine.temperature / 11)}%`;
      put(
        `engine-help-${i}`,
        engine.fire
          ? engine.fuelOpen
            ? "Fuel is feeding the fire. Isolate this engine first."
            : "Fuel isolated. Discharge at 40% thrust or below."
          : !engine.bottle
            ? "Fire contained. This engine stays off for the flight."
            : "Temperature normal. Fire bottle armed.",
      );
      el(`fuel-${i}`).hidden = !engine.fire || !engine.fuelOpen;
      el(`fire-${i}`).hidden = !engine.fire || engine.fuelOpen;
      disabled(`fuel-${i}`, s.paused || !engine.bottle);
      disabled(
        `fire-${i}`,
        s.paused || engine.fuelOpen || !engine.fire || e.throttle > 0.4,
      );
    }
    put(
      "station-message",
      s.training && s.tutorialStage !== "landing"
        ? "GUIDED TRAINING · Take your time. The aircraft is held steady."
        : "LIVE FLIGHT · Keep your pilot informed.",
    );
    put("engineer-radio", s.log.at(-1)?.text ?? "");
  }
  return { update, dispose() {} };
}
