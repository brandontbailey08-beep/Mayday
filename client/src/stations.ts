import type { Command, Snapshot } from "../../shared/protocol";
import {
  clamp,
  flightDirector,
  glideAltitude,
  interceptHeading,
} from "../../shared/approach";
import { oilFlow, pipePorts } from "../../shared/puzzles";

const symbols = ["▲ PWR", "● DATA", "■ SENSE"];
const set = (id: string, value: string) => {
  const el = document.getElementById(id);
  if (el && el.textContent !== value) el.textContent = value;
};
const disable = (id: string, value: boolean) => {
  const el = document.getElementById(id) as HTMLButtonElement | null;
  if (el) el.disabled = value;
};

export const approachPanel =
  () => `<section class="approach-instruments" aria-label="Runway approach instruments">
  <div class="panel-label">RUNWAY 27 <span id="flight-mode">INTERCEPT</span></div>
  <svg class="approach-map" viewBox="0 0 320 160" role="img" aria-label="Approach map: aircraft position relative to runway centerline">
    <defs><pattern id="map-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#314943" stroke-width=".5"/></pattern></defs>
    <rect width="320" height="160" fill="url(#map-grid)"/>
    <path d="M160 40L105 150H215Z" fill="#b5d9920c" stroke="#b5d99244" stroke-dasharray="3 4"/>
    <path d="M160 38V155" stroke="#acc49088" stroke-dasharray="4 5"/>
    <rect x="151" y="6" width="18" height="35" fill="#8e9d96"/><path d="M160 9V36" stroke="#eff6df" stroke-dasharray="4 4"/>
    <text x="180" y="28" fill="#d7e8b9" font-size="10">27</text>
    <g id="map-plane"><path d="M0 -9L4 -1L12 5L12 8L3 5L3 11L0 9L-3 11L-3 5L-12 8L-12 5L-4 -1Z" fill="#d4e5a6"/></g>
  </svg>
  <div class="director-metrics"><div><span>CENTERLINE</span><b id="cross-track"></b></div><div><span>GLIDE PATH</span><b id="glide-error"></b></div><div><span>VERTICAL SPEED</span><b id="vertical-speed"></b></div></div>
  <div class="flight-director" id="director-cue" role="status"></div><p id="director-detail" class="fine"></p>
</section>`;

export const repairsPanel = () => `<section class="repair-bay" id="oil-puzzle">
  <div class="panel-label">OIL ROUTING <span id="hyd-status"></span></div>
  <p class="fine">Tap a pipe to rotate it clockwise. Route amber oil from PUMP at row 2 to RETURN at row 3. Fill the route, then pressure-test it.</p>
  <div class="pipe-labels"><span>↓ PUMP · left / row 2</span><span>RETURN · right / row 3 ↑</span></div>
  <div class="pipe-grid">${Array.from({ length: 16 }, (_, i) => `<button class="pipe-tile" id="pipe-${i}" data-pipe="${i}" aria-label="Rotate oil pipe row ${Math.floor(i / 4) + 1}, column ${(i % 4) + 1}"><svg viewBox="0 0 64 64" aria-hidden="true"><path class="pipe-metal"/><path class="pipe-fluid"/><circle cx="32" cy="32" r="6"/></svg><small>${Math.floor(i / 4) + 1}.${(i % 4) + 1}</small></button>`).join("")}</div>
  <p id="oil-flow" class="repair-feedback" role="status"></p><button id="hydraulics" class="wide">Pressure-test oil circuit</button>
</section><section class="repair-bay" id="rack-puzzle">
  <div class="panel-label">AVIONICS SERVICE BAY <span id="elec-status"></span></div>
  <ol class="repair-steps"><li id="rack-step-0">1 · Isolate</li><li id="rack-step-1">2 · Unplug</li><li id="rack-step-2">3 · Replace</li><li id="rack-step-3">4 · Rewire</li><li id="rack-step-4">5 · Restart</li></ol>
  <p id="rack-instruction" class="fine"></p>
  <button id="rack-power" class="wide">Isolate rack power · thrust ≤55%</button>
  <div class="rack-chassis">${[0, 1, 2].map((i) => `<button id="rack-${i}" data-rack="${i}" class="rack-module"><span class="rack-led"></span><span>RACK 0${i + 1}</span><b id="rack-label-${i}"></b><i aria-hidden="true">▥ ▥ ▥</i></button>`).join("")}</div>
  <button id="rack-install" class="wide">Insert replacement rack</button>
  <div class="harness"><div><span class="tiny">AIRCRAFT CABLES</span>${symbols.map((name, i) => `<button id="cable-${i}" data-cable="${i}"><b>${name}</b><small id="cable-state-${i}"></small></button>`).join("")}</div><div><span class="tiny">REPLACEMENT PORTS</span>${symbols.map((_, i) => `<button id="port-${i}" data-port="${i}"><b id="port-label-${i}"></b><small>PORT ${i + 1}</small></button>`).join("")}</div></div>
  <svg class="wire-diagram" viewBox="0 0 300 96" role="img" aria-label="Live wiring diagram: cable connections to replacement ports">
    ${symbols.map((name, i) => `<text x="4" y="${21 + i * 30}">${name}</text><path id="wire-path-${i}"/><circle cx="72" cy="${17 + i * 30}" r="4"/><circle cx="226" cy="${17 + i * 30}" r="4"/><text x="239" y="${21 + i * 30}">P${i + 1}</text>`).join("")}
  </svg>
  <p id="wire-instruction" class="repair-feedback" role="status">Select a cable, then its matching symbol on the replacement rack.</p>
  <button id="electrical" class="wide">Test harness & restart · thrust ≤55%</button>
</section>`;

export function bindRepairs(
  send: (c: Command) => void,
  current: () => Snapshot | undefined,
) {
  let selected = -1;
  document
    .querySelectorAll<HTMLButtonElement>("[data-pipe]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          send({ type: "pipe", tile: Number(b.dataset.pipe) })),
    );
  document
    .querySelectorAll<HTMLButtonElement>("[data-rack]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          send({ type: "rackRemove", slot: Number(b.dataset.rack) })),
    );
  document
    .getElementById("rack-power")
    ?.addEventListener("click", () => send({ type: "rackPower" }));
  document
    .getElementById("rack-install")
    ?.addEventListener("click", () => send({ type: "rackInstall" }));
  document.querySelectorAll<HTMLButtonElement>("[data-cable]").forEach(
    (b) =>
      (b.onclick = () => {
        const cable = Number(b.dataset.cable),
          rack = current()?.flight.engineer?.rack;
        if (!rack) return;
        if (rack.wiring[cable] >= 0) {
          send({ type: "wire", cable, port: -1 });
          selected = -1;
        } else selected = cable;
        document
          .querySelectorAll("[data-cable]")
          .forEach((node) =>
            node.classList.toggle(
              "selected",
              (node as HTMLElement).dataset.cable === String(selected),
            ),
          );
        set(
          "wire-instruction",
          selected < 0
            ? "Select a loose cable, then its matching port. Click a connected cable to unplug it."
            : `${symbols[selected]} selected. Choose its matching symbol on the right.`,
        );
      }),
  );
  document.querySelectorAll<HTMLButtonElement>("[data-port]").forEach(
    (b) =>
      (b.onclick = () => {
        if (selected < 0) {
          set("wire-instruction", "Choose a loose cable on the left first.");
          return;
        }
        send({ type: "wire", cable: selected, port: Number(b.dataset.port) });
        selected = -1;
        document
          .querySelectorAll("[data-cable]")
          .forEach((node) => node.classList.remove("selected"));
        set(
          "wire-instruction",
          "Cable connection requested. Match the remaining symbols, then test the harness.",
        );
      }),
  );
}

export function updateStations(s: Snapshot) {
  const f = s.flight;
  if (f.pilot) {
    const manual = f.landing !== null,
      director = flightDirector(f);
    const glideError = Math.round(f.altitude - glideAltitude(f.distance));
    set("flight-mode", manual ? "MANUAL FINAL" : "INTERCEPT");
    set(
      "cross-track",
      `${Math.abs(f.crossTrack).toFixed(2)} NM ${f.crossTrack >= 0 ? "RIGHT" : "LEFT"}`,
    );
    set(
      "glide-error",
      `${Math.abs(glideError)} FT ${glideError >= 0 ? "HIGH" : "LOW"}`,
    );
    set("vertical-speed", `${Math.round(f.verticalSpeed)} FT/MIN`);
    document
      .getElementById("map-plane")
      ?.setAttribute(
        "transform",
        `translate(${160 + clamp(f.crossTrack * 150, -140, 140)} ${40 + clamp(f.distance / 12, 0, 1) * 100}) rotate(${f.heading - 270})`,
      );
    set(
      "director-cue",
      !manual
        ? `INTERCEPT ${Math.round(interceptHeading(f.crossTrack, f.distance))}° · ALTITUDE 1,200 FT`
        : director.flare
          ? "FLARE · Ease descent to −240 FT/MIN"
          : `BANK ${Math.abs(Math.round(director.bank))}° ${director.bank < 0 ? "LEFT" : "RIGHT"} · DESCEND ${Math.round(director.descent / 50) * 50} FT/MIN`,
    );
    set(
      "manual-cue",
      `${Math.round(f.altitude)} FT · ${Math.round(f.speed)} KT | ${document.getElementById("director-cue")!.textContent}`,
    );
    set(
      "director-detail",
      manual
        ? "Follow the cues yourself. Center the aircraft, then level the wings. Touch down at 150–225 KT; vertical speed must be gentler than −480 FT/MIN."
        : "Match the intercept heading to close the centerline offset. Within 3.5 NM, take manual final and steer with bank + descent.",
    );
    document.getElementById("manual-controls")!.hidden = !manual;
    document.getElementById("intercept-controls")!.hidden = manual;
    for (const [id, value, unit] of [
      ["bank", f.pilot.commandedBank, "°"],
      ["descent", f.pilot.commandedDescent, " FT/MIN"],
    ] as const) {
      const input = document.getElementById(id) as HTMLInputElement;
      if (!input.matches(":active") && document.activeElement !== input)
        input.value = String(value);
      if (!input.matches(":active"))
        set(`${id}-value`, `${Math.round(value)}${unit}`);
      input.disabled = s.paused;
    }
    disable("go-around", s.paused || f.goArounds >= 2);
    set("go-around", `Go around · ${2 - f.goArounds} remaining`);
  }
  if (f.engineer) {
    const e = f.engineer,
      flow = oilFlow(e.oil),
      r = e.rack;
    const blocked = s.paused;
    e.oil.tiles.forEach((mask, i) => {
      const b = document.getElementById(`pipe-${i}`) as HTMLButtonElement;
      const endpoints = [
        [32, 0],
        [64, 32],
        [32, 64],
        [0, 32],
      ];
      const path = endpoints
        .filter((_, side) => mask & (1 << side))
        .map(([x, y]) => `M32 32L${x} ${y}`)
        .join("");
      b.querySelectorAll("path").forEach((p) => p.setAttribute("d", path));
      b.classList.toggle("wet", flow.wet.includes(i));
      b.disabled = blocked || !e.hydraulicFault;
      b.setAttribute(
        "aria-label",
        `Rotate oil pipe row ${Math.floor(i / 4) + 1}, column ${(i % 4) + 1}: ${pipePorts(mask).join(" and ")}${flow.wet.includes(i) ? ", oil flowing" : ""}`,
      );
    });
    set(
      "oil-flow",
      !e.hydraulicFault
        ? "✓ Oil pressure stable"
        : flow.connected
          ? "✓ Route complete. Run the pressure test."
          : `Oil reaches ${flow.wet.length} tiles. Find the next disconnected joint.`,
    );
    disable("hydraulics", blocked || !e.hydraulicFault);
    const stage = r.stage,
      fault = e.electricalFault;
    set(
      "rack-instruction",
      !fault
        ? "Avionics online. Watch for a FAULT indicator."
        : stage === "powered"
          ? "Ask the pilot for ≤55% thrust, then isolate power before touching cables."
          : stage === "isolated"
            ? "Unplug all three cables, then click the rack marked FAULT to remove it."
            : stage === "removed"
              ? "The faulty rack is out. Seat the spare in its empty slot."
              : "Match ▲ PWR, ● DATA and ■ SENSE to the port symbols. Click a connected cable to unplug mistakes, then restart at ≤55% thrust.",
    );
    disable("rack-power", blocked || !fault || stage !== "powered");
    disable("rack-install", blocked || !fault || stage !== "removed");
    disable("electrical", blocked || !fault || stage !== "installed");
    const step = !fault
      ? 5
      : stage === "powered"
        ? 0
        : stage === "isolated"
          ? r.wiring.every((p) => p < 0)
            ? 2
            : 1
          : stage === "removed"
            ? 2
            : r.wiring.every((p) => p >= 0)
              ? 4
              : 3;
    for (let i = 0; i < 5; i++)
      document
        .getElementById(`rack-step-${i}`)
        ?.classList.toggle("done", i < step);
    for (let i = 0; i < 3; i++) {
      const faulty = i === r.faultySlot && fault;
      const b = document.getElementById(`rack-${i}`)!;
      b.classList.toggle(
        "fault",
        faulty && (stage === "powered" || stage === "isolated"),
      );
      b.classList.toggle("empty", faulty && stage === "removed");
      set(
        `rack-label-${i}`,
        faulty
          ? stage === "removed"
            ? "EMPTY"
            : stage === "installed"
              ? "SPARE SEATED"
              : "FAULT · REMOVE"
          : "ONLINE",
      );
      disable(`rack-${i}`, blocked || !fault || stage !== "isolated");
      disable(
        `cable-${i}`,
        blocked || !fault || !["isolated", "installed"].includes(stage),
      );
      disable(`port-${i}`, blocked || !fault || stage !== "installed");
      set(`port-label-${i}`, symbols[r.labels[i]]);
      set(
        `cable-state-${i}`,
        r.wiring[i] < 0
          ? "LOOSE · SELECT"
          : `→ PORT ${r.wiring[i] + 1} · UNPLUG`,
      );
      const y = 17 + i * 30,
        endY = 17 + r.wiring[i] * 30;
      const path = document.getElementById(`wire-path-${i}`)!;
      path.setAttribute(
        "d",
        r.wiring[i] < 0
          ? `M72 ${y}H104`
          : `M72 ${y}C150 ${y} 145 ${endY} 226 ${endY}`,
      );
      path.setAttribute("stroke", ["#efb356", "#8dd0df", "#c6d998"][i]);
      path.setAttribute("stroke-dasharray", r.wiring[i] < 0 ? "3 3" : "none");
      document
        .getElementById(`port-${i}`)
        ?.classList.toggle("connected", r.wiring.includes(i));
    }
  }
}
