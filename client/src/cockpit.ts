import { bindFlightControls } from "./flight-controls";
import { guidance } from "../../shared/tutorial";
import type { AutopilotState, Command, Snapshot } from "../../shared/protocol";
import {
  angleDifference,
  clamp,
  flightDirector,
  glideAltitude,
  interceptHeading,
} from "../../shared/approach";
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

const controls = [
  {
    id: "selectedSpeed",
    label: "IAS",
    unit: "KT",
    min: 150,
    max: 280,
    step: 5,
    initial: 205,
  },
  {
    id: "heading",
    label: "HEADING",
    unit: "°",
    min: 0,
    max: 359,
    step: 1,
    initial: 270,
  },
  {
    id: "altitude",
    label: "ALTITUDE",
    unit: "FT",
    min: 500,
    max: 6000,
    step: 100,
    initial: 3600,
  },
  {
    id: "selectedVs",
    label: "VERT SPEED",
    unit: "FT/MIN",
    min: -1800,
    max: 1500,
    step: 100,
    initial: -1000,
  },
] as const;
const mcpButton = (action: string, label: string, title: string) =>
  `<button class="mcp-key" data-mcp="${action}" id="mcp-${action}" title="${title}" aria-label="${title}" aria-pressed="false"><i></i>${label}</button>`;
function mcp() {
  return `<section class="mcp-panel" id="mcp-panel" aria-label="Autopilot mode control panel"><div class="mcp-switches"><span class="mcp-caption">FLIGHT CONTROL</span>${mcpButton("flightDirector", "FD", "Flight director guidance")}${mcpButton("autoThrottle", "A/T", "Autothrottle speed control")}</div><div class="mcp-dials">${controls.map((c) => `<div class="mcp-dial"><label for="${c.id}">${c.label} <span>${c.unit}</span></label><input id="${c.id}" type="number" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.initial}" aria-label="Selected ${c.label.toLowerCase()}"/><div class="knob-adjust"><button data-adjust="${c.id}" data-delta="-${c.step}" aria-label="Decrease ${c.label.toLowerCase()}">−</button><span class="knob" aria-hidden="true"></span><button data-adjust="${c.id}" data-delta="${c.step}" aria-label="Increase ${c.label.toLowerCase()}">+</button></div></div>`).join("")}</div><div class="mcp-modes">${mcpButton("heading", "HDG SEL", "Track selected heading")}${mcpButton("altitudeHold", "ALT HOLD", "Hold current altitude")}${mcpButton("verticalSpeed", "V/S", "Track selected vertical speed")}${mcpButton("levelChange", "FLCH", "Climb or descend to selected altitude")}${mcpButton("localizer", "LOC", "Capture runway centerline")}${mcpButton("approach", "APP", "Arm runway approach")}</div><div class="mcp-master">${mcpButton("autopilot", "AP CMD", "Engage or disengage autopilot")}<button id="mcp-disconnect" class="ap-disconnect">DISENGAGE</button></div></section>`;
}
function pfd() {
  return `<section class="instrument pfd" aria-label="Primary flight display"><div class="instrument-title">PRIMARY FLIGHT DISPLAY <span id="pfd-fd"></span></div><div class="pfd-window"><div class="pfd-speed"><small>AIRSPEED</small><b id="pfd-speed">225</b><span>KT</span><small id="speed-bug"></small></div><svg viewBox="0 0 240 185" class="attitude" role="img" aria-label="Artificial horizon with bank, pitch and flight director"><defs><clipPath id="horizon-clip"><rect x="18" y="6" width="204" height="157" rx="4"/></clipPath></defs><g clip-path="url(#horizon-clip)"><g id="horizon-roll"><g id="horizon-pitch"><rect x="-100" y="-210" width="440" height="300" fill="#2d6780"/><rect x="-100" y="90" width="440" height="300" fill="#7b5a37"/><path d="M-100 90H340" stroke="#e8ebef" stroke-width="2"/>${[-60, -40, -20, 20, 40, 60].map((y) => `<path d="M${Math.abs(y) === 40 ? 90 : 104} ${90 + y}H${Math.abs(y) === 40 ? 150 : 136}" stroke="#e1e5ea" stroke-width="1.5"/>`).join("")}</g></g><g id="fd-bars" stroke="#e396ee" stroke-width="3"><path id="fd-bank" d="M120 48V133"/><path id="fd-pitch" d="M77 90H163"/></g></g><path d="M60 90H100V97H113M127 97H140V90H180" fill="none" stroke="#f4d07c" stroke-width="3"/><circle cx="120" cy="90" r="3" fill="#f4d07c"/><path d="M77 21Q120 -3 163 21" fill="none" stroke="#cfd6de"/><path d="M120 12L115 3H125Z" fill="#f4d07c"/><text id="pfd-heading" x="120" y="181" text-anchor="middle" fill="#dee7f1" font-size="15">270°</text></svg><div class="pfd-alt"><small>ALTITUDE</small><b id="pfd-altitude">3600</b><span>FT</span><small id="alt-bug"></small></div></div><div class="pfd-footer"><span id="pfd-bank"></span><span id="pfd-vs"></span></div><div class="ils-strip"><span>LOC</span><div><i id="loc-needle"></i></div><span>G/S</span><div><i id="gs-needle"></i></div></div></section>`;
}
function navigation() {
  return `<section class="instrument navigation" aria-label="Runway navigation display"><div class="instrument-title">ILS / RUNWAY 27 <span>270°</span></div><svg viewBox="0 0 240 172" role="img" aria-label="Aircraft position and runway centerline"><path d="M25 145A110 110 0 0 1 215 145M59 145A70 70 0 0 1 181 145" fill="none" stroke="#485665" stroke-dasharray="3 5"/><path d="M120 30V148" stroke="#db9be9" stroke-dasharray="7 5"/><path d="M78 140L120 32L162 140" fill="#87aed708" stroke="#6b809744"/><rect x="113" y="10" width="14" height="27" fill="#c3cdd7"/><text x="136" y="28" fill="#c3cdd7" font-size="11">27</text><g id="nav-plane"><path d="M0 -10L4 -2L12 5L3 4V12L0 9L-3 12V4L-12 5L-4 -2Z" fill="#efdfac"/></g></svg><div class="nav-footer"><b id="nav-distance"></b><span id="nav-offset"></span></div></section>`;
}
export function mountCockpit(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  send: Send,
  current: () => Snapshot | undefined,
): Station {
  document.body.dataset.station = "pilot";
  host.innerHTML = `<section class="pilot-deck">${flightBar("FLIGHT DECK")}${mcp()}<div class="flight-annunciator"><span id="fma-speed"></span><span id="fma-lateral"></span><span id="fma-vertical"></span><b id="fma-ap"></b></div><section class="cockpit-view" id="cockpit-view" aria-label="Forward cockpit view"><div class="windshield-frame" aria-hidden="true"><i></i><i></i></div><div class="windshield-head"><span>MF–404 / RUNWAY 27</span><span id="cockpit-warnings"></span></div><a class="scenery-credit" href="/scenery/ATTRIBUTION.md" target="_blank" rel="noopener" title="Aerial imagery sources and scenery credits">IMAGERY · USDA / USGS</a><div class="windshield-reticle" aria-hidden="true">— ◇ —</div><div class="approach-coach"><span id="coach-label"></span><strong id="coach-title"></strong><span id="coach-detail"></span></div><div class="cockpit-radio" id="pilot-radio" role="status"></div></section><section class="instrument-deck">${pfd()}${navigation()}<section class="instrument manual-panel" aria-label="Manual flight controls"><div class="instrument-title">MANUAL FLIGHT <span class="key-legend"><b id="key-a">A</b><b id="key-d">D</b> BANK <b id="key-w">W</b><b id="key-s">S</b> PITCH</span></div><div class="manual-row"><div class="virtual-yoke" id="yoke" tabindex="0" role="group" aria-label="Virtual yoke: drag left and right to bank, up and down to change descent"><svg id="yoke-art" viewBox="0 0 170 100" aria-hidden="true"><path d="M20 22V62Q20 75 38 75H65L74 92H96L105 75H132Q150 75 150 62V22H133V55H104L93 43H77L66 55H37V22Z" fill="#3d4956" stroke="#8798aa" stroke-width="2"/><rect x="68" y="43" width="34" height="24" rx="5" fill="#252d35"/><path d="M78 54H92" stroke="#a5c3e3" stroke-width="3"/></svg><span>DRAG TO FLY · RELEASE TO LEVEL</span></div><label class="thrust-lever" for="throttle"><span>THRUST <b id="throttle-value"></b></span><input id="throttle" type="range" min="0" max="100" step="1" aria-label="Manual thrust"/><small>Manual input releases A/T</small></label></div><div class="manual-trims"><label for="bank">BANK <output id="bank-value"></output><input id="bank" type="range" min="-25" max="25" step="1"/></label><label for="descent">SINK / CLIMB <output id="descent-value"></output><input id="descent" type="range" min="-1800" max="600" step="10"/></label></div><div class="rudder-strip"><button id="rudder-left" aria-label="Hold left rudder (Q)"><b id="key-q">Q</b> ◀</button><span>RUDDER <i><em id="rudder-position"></em></i><small>HOLD · RELEASE TO CENTER</small></span><button id="rudder-right" aria-label="Hold right rudder (E)">▶ <b id="key-e">E</b></button></div><div class="manual-buttons"><button id="wings-level">Wings level</button><button id="flare">Flare</button><button id="go-around">Go around</button></div></section></section><div class="cockpit-bottom"><button id="gear">GEAR UP</button><span id="station-message" role="status"></span><button id="land" class="deck-primary">Hand-fly final</button></div>${flightDialogs()}</section>`;
  el("cockpit-view").prepend(canvas);
  const updateCommon = bindFlightUi(send, current);
  const events = new AbortController();
  const signal = events.signal;
  let dragging = false,
    nextSend = 0;
  const pushValue = (id: (typeof controls)[number]["id"], value: number) => {
    const def = controls.find((c) => c.id === id)!;
    const clean =
      id === "heading"
        ? (Math.round(value) + 360) % 360
        : clamp(value, def.min, def.max);
    if (Number.isFinite(clean)) send({ type: id, value: clean } as Command);
  };
  const drafts = new Map<string, string>();
  const editTimers = new Map<string, number>();
  controls.forEach((c) => {
    const input = el<HTMLInputElement>(c.id);
    const commit = () => {
      clearTimeout(editTimers.get(c.id));
      const draft = drafts.get(c.id);
      if (draft === undefined) return;
      drafts.delete(c.id);
      if (draft.trim() && Number.isFinite(Number(draft)))
        pushValue(c.id, Number(draft));
    };
    input.oninput = () => {
      drafts.set(c.id, input.value);
      clearTimeout(editTimers.get(c.id));
      // Keep snapshots from erasing partially typed selections. Enter or blur
      // commits immediately; a short typing pause also commits a valid value.
      if (input.validity.valid)
        editTimers.set(c.id, window.setTimeout(commit, 450));
    };
    input.onchange = commit;
    input.onblur = commit;
    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        commit();
        input.blur();
      }
    };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-adjust]").forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.adjust as (typeof controls)[number]["id"];
        pushValue(
          id,
          Number(el<HTMLInputElement>(id).value) + Number(b.dataset.delta),
        );
      }),
  );
  document
    .querySelectorAll<HTMLButtonElement>("[data-mcp]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          send({ type: "mcp", action: b.dataset.mcp as "autopilot" })),
    );
  el("mcp-disconnect").onclick = () =>
    send({ type: "mcp", action: "disconnect" });
  for (const id of ["bank", "descent", "throttle"] as const) {
    const input = el<HTMLInputElement>(id);
    input.oninput = () =>
      put(
        `${id}-value`,
        `${input.value}${id === "throttle" ? "%" : id === "bank" ? "°" : " FT/MIN"}`,
      );
    input.onchange = () =>
      send({
        type: id,
        value: Number(input.value) / (id === "throttle" ? 100 : 1),
      });
  }
  const ready = () =>
    !current()?.paused && !document.body.classList.contains("offline");
  const yoke = el("yoke");
  const moveYoke = (event: PointerEvent, force = false) => {
    if (!dragging || !ready() || (!force && performance.now() < nextSend))
      return;
    nextSend = performance.now() + 100;
    const bounds = yoke.getBoundingClientRect();
    const x = clamp(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -1,
      1,
    );
    const y = clamp(
      ((event.clientY - bounds.top) / bounds.height) * 2 - 1,
      -1,
      1,
    );
    send({ type: "bank", value: Math.round(x * 25) });
    send({ type: "descent", value: Math.round((-600 + y * 1200) / 10) * 10 });
  };
  const releaseYoke = () => {
    if (dragging && ready()) send({ type: "bank", value: 0 });
    dragging = false;
    yoke.classList.remove("held");
  };
  yoke.addEventListener(
    "pointerdown",
    (e) => {
      if (!ready()) return;
      dragging = true;
      yoke.classList.add("held");
      yoke.setPointerCapture(e.pointerId);
      moveYoke(e, true);
    },
    { signal },
  );
  yoke.addEventListener("pointermove", (e) => moveYoke(e), { signal });
  yoke.addEventListener("pointerup", releaseYoke, { signal });
  yoke.addEventListener("pointercancel", releaseYoke, { signal });
  window.addEventListener("blur", releaseYoke, { signal });
  const disposeKeys = bindFlightControls(send, current, signal);
  el("wings-level").onclick = () => send({ type: "bank", value: 0 });
  el("flare").onclick = () => send({ type: "descent", value: -240 });
  el("go-around").onclick = () => send({ type: "goAround" });
  el("gear").onclick = () =>
    send({ type: "gear", down: !current()!.flight.gear });
  el("land").onclick = () =>
    current()!.flight.landing !== null
      ? send({ type: "mcp", action: "disconnect" })
      : send({ type: "land" });
  return {
    dispose() {
      disposeKeys();
      events.abort();
      editTimers.forEach((timer) => clearTimeout(timer));
    },
    update(s) {
      updateCommon(s);
      const f = s.flight,
        p = f.pilot!,
        ap = p.autopilot,
        director = flightDirector(f);
      const guidanceBank =
        f.landing !== null || ap.lateral === "localizer"
          ? director.bank
          : clamp(angleDifference(p.targetHeading, f.heading) * 1.8, -25, 25);
      const guidanceVs =
        f.landing !== null
          ? director.descent
          : ap.vertical === "verticalSpeed"
            ? ap.selectedVs
            : clamp(
                ((ap.vertical === "altitude"
                  ? ap.holdAltitude
                  : p.targetAltitude) -
                  f.altitude) *
                  3,
                -1800,
                1500,
              );
      const final = f.landing !== null;
      el("rudder-position").style.left = `${50 + p.rudder * 40}%`;
      disabled("rudder-left", s.paused);
      disabled("rudder-right", s.paused);
      const modes: Record<string, boolean> = {
        flightDirector: ap.flightDirector,
        autoThrottle: ap.autoThrottle,
        autopilot: ap.engaged,
        heading: ap.lateral === "heading",
        altitudeHold: ap.vertical === "altitude",
        verticalSpeed: ap.vertical === "verticalSpeed",
        levelChange: ap.vertical === "levelChange",
        localizer: ap.lateral === "localizer",
        approach: ap.approach !== "off",
      };
      for (const [action, on] of Object.entries(modes)) {
        el(`mcp-${action}`).classList.toggle("active", on);
        el(`mcp-${action}`).setAttribute("aria-pressed", String(on));
        disabled(`mcp-${action}`, s.paused);
      }
      el("mcp-approach").classList.toggle("armed", ap.approach === "armed");
      const selected = {
        selectedSpeed: ap.selectedSpeed,
        heading: p.targetHeading,
        altitude: p.targetAltitude,
        selectedVs: ap.selectedVs,
      };
      for (const c of controls) {
        const input = el<HTMLInputElement>(c.id);
        if (document.activeElement !== input && !drafts.has(c.id))
          input.value = String(Math.round(selected[c.id]));
        input.disabled = s.paused;
      }
      document
        .querySelectorAll<HTMLButtonElement>("[data-adjust]")
        .forEach((b) => (b.disabled = s.paused));
      for (const [id, value, unit] of [
        ["bank", p.commandedBank, "°"],
        ["descent", p.commandedDescent, " FT/MIN"],
        ["throttle", p.throttle * 100, "%"],
      ] as const) {
        const input = el<HTMLInputElement>(id);
        if (!input.matches(":active") && document.activeElement !== input)
          input.value = String(Math.round(value));
        if (!input.matches(":active"))
          put(`${id}-value`, `${Math.round(value)}${unit}`);
        input.disabled = s.paused;
      }
      put(
        "fma-speed",
        ap.autoThrottle ? `A/T · SPEED ${ap.selectedSpeed}` : "MANUAL THRUST",
      );
      put(
        "fma-lateral",
        !ap.engaged
          ? "HAND FLY"
          : ap.lateral === "heading"
            ? "HDG SEL"
            : ap.localizerCaptured
              ? "LOC CAPTURED"
              : "LOC ARMED",
      );
      const vertical: Record<AutopilotState["vertical"], string> = {
        altitude: "ALT HOLD",
        verticalSpeed: "V/S",
        levelChange: "FLCH",
        glideslope: "G/S CAPTURED",
      };
      put(
        "fma-vertical",
        !ap.engaged
          ? "MANUAL PITCH"
          : ap.approach === "armed"
            ? `${vertical[ap.vertical]} · G/S ARMED`
            : vertical[ap.vertical],
      );
      put(
        "fma-ap",
        ap.engaged
          ? "CMD"
          : ap.disconnectReason === "minimums"
            ? "MINIMUMS · YOUR CONTROL"
            : "AP OFF",
      );
      el("fma-ap").classList.toggle("manual", !ap.engaged);
      put("pfd-speed", `${Math.round(f.speed)}`);
      put("pfd-altitude", `${Math.round(f.altitude)}`);
      put(
        "pfd-heading",
        `${Math.round(f.heading).toString().padStart(3, "0")}°`,
      );
      put("speed-bug", `SEL ${ap.selectedSpeed}`);
      put("alt-bug", `SEL ${Math.round(p.targetAltitude)}`);
      put("pfd-bank", `BANK ${Math.round(f.bank)}°`);
      put("pfd-vs", `${Math.round(f.verticalSpeed)} FT/MIN`);
      put("pfd-fd", ap.flightDirector ? "FD ON" : "FD OFF");
      el("horizon-roll").setAttribute("transform", `rotate(${-f.bank} 120 90)`);
      el("horizon-pitch").setAttribute(
        "transform",
        `translate(0 ${f.verticalSpeed / 60})`,
      );
      el("fd-bars").style.display = ap.flightDirector ? "" : "none";
      el("fd-bank").setAttribute(
        "transform",
        `translate(${clamp((guidanceBank - f.bank) * 1.5, -35, 35)} 0)`,
      );
      el("fd-pitch").setAttribute(
        "transform",
        `translate(0 ${clamp((f.verticalSpeed - guidanceVs) / 50, -30, 30)})`,
      );
      el("loc-needle").style.left =
        `${50 + clamp(f.crossTrack * 120, -45, 45)}%`;
      el("gs-needle").style.left =
        `${50 + clamp((f.altitude - glideAltitude(f.distance)) / 10, -45, 45)}%`;
      el("nav-plane").setAttribute(
        "transform",
        `translate(${120 + clamp(f.crossTrack * 100, -93, 93)} ${44 + clamp(f.distance / 12, 0, 1) * 103}) rotate(${angleDifference(f.heading, 270)})`,
      );
      put("nav-distance", `${Math.max(0, f.distance).toFixed(1)} NM`);
      put(
        "nav-offset",
        `${Math.abs(f.crossTrack).toFixed(2)} ${f.crossTrack < 0 ? "LEFT" : "RIGHT"}`,
      );
      el("yoke-art").style.transform = `rotate(${f.bank}deg)`;
      put("cockpit-warnings", f.warnings.join(" · "));
      let label = "DIVERSION",
        title = `Intercept ${Math.round(interceptHeading(f.crossTrack, f.distance))}°`,
        detail =
          "Select 1,200 FT and FLCH. Follow the intercept heading or use LOC to join the runway centerline.";
      if (s.training && s.tutorialStage === "setup") {
        title = "Set altitude to 1,200 FT";
        detail =
          "Use the MCP altitude window. Then press FLCH. AP CMD follows your selected heading and altitude.";
      } else if (s.botAdvice && !final) {
        label = "ENGINEER REQUEST";
        title = s.botAdvice.includes("40%")
          ? "Reduce thrust to 40%"
          : s.botAdvice.includes("55%")
            ? "Reduce thrust to 55%"
            : "Restore thrust to 100%";
        detail =
          "Move the thrust lever. Manual thrust disengages A/T so your engineer can work.";
      } else if (s.paused) {
        label = "CREW DISCONNECTED";
        title = "Flight paused";
        detail = "Your crew's station is reserved while they reconnect.";
      } else if (f.warnings.length && !final) {
        const hint = guidance(s, "pilot");
        label = "CREW COORDINATION";
        title = hint.title;
        detail = hint.body;
      } else if (final) {
        label = ap.engaged ? "COUPLED APPROACH" : "YOU HAVE CONTROL";
        title = director.flare
          ? "Flare now · ease the descent"
          : ap.engaged
            ? "Tracking runway 27"
            : Math.abs(director.bank) > 3
              ? `Bank ${director.bank < 0 ? "left" : "right"} to line up with the runway`
              : "Keep the wings level with the runway";
        detail = ap.engaged
          ? "AP follows LOC and G/S. It disconnects at 150 FT. You fly the final landing and flare below 50 FT."
          : director.flare
            ? "Press Flare or gently pull back on the yoke. Keep aligned and hold 150–225 KT."
            : `Bank ${Math.abs(Math.round(director.bank))}° ${director.bank < 0 ? "left" : "right"} · vertical speed ${Math.round(director.descent / 50) * 50} FT/MIN. Flare below 50 FT.`;
      } else if (f.distance < 4 || s.tutorialStage === "approach") {
        label = "APPROACH / RUNWAY 27";
        if (f.distance < 0.6) {
          title = "Approach window missed · go around";
          detail =
            "Use Go around for another setup, then lower gear and arm APP early.";
        } else if (!f.gear) {
          title = "1 · Lower landing gear";
          detail =
            "Use GEAR below. The engineer must restore hydraulic pressure before the gear can move.";
        } else if (f.speed < 170 || f.speed > 240) {
          title = "Set approach speed · 200 KT";
          detail =
            "Select IAS 200 and A/T, or adjust thrust manually. APP needs 170–240 KT to capture.";
        } else if (
          Math.abs(f.crossTrack) > 0.6 ||
          Math.abs(angleDifference(270, f.heading)) > 25
        ) {
          title = "Join the runway centerline";
          detail =
            "Use AP CMD + LOC to intercept, or turn toward the flight director with A/D. Q/E adds a fine rudder correction.";
        } else if (
          f.altitude < 800 ||
          f.altitude > 1800 ||
          Math.abs(f.altitude - glideAltitude(f.distance)) > 350
        ) {
          const target =
            Math.round(clamp(glideAltitude(f.distance), 800, 1800) / 100) * 100;
          title = `${f.altitude > target ? "Descend" : "Climb"} to ${target.toLocaleString()} FT`;
          detail =
            "Select this altitude on the MCP and press FLCH. Then arm APP near the glide path, or choose Hand-fly final.";
        } else {
          title = !ap.engaged
            ? "2 · Engage AP CMD, then APP"
            : ap.approach === "armed"
              ? "APP armed · approaching capture"
              : "3 · Press APP to capture final";
          detail =
            "AP follows the runway and glide path within 3.5 NM. At 150 FT you take control; below 50 FT, flare. Hand-fly final is also available.";
        }
      }
      put("coach-label", label);
      put("coach-title", title);
      put("coach-detail", detail);
      put("pilot-radio", s.log.at(-1)?.text ?? "");
      put("gear", f.gear ? "● GEAR DOWN" : "○ LOWER GEAR");
      el("gear").classList.toggle("active", f.gear);
      const eligible =
        f.distance <= 3.5 &&
        f.distance >= 0.6 &&
        f.altitude >= 800 &&
        f.altitude <= 1800 &&
        f.speed >= 170 &&
        f.speed <= 240 &&
        Math.abs(angleDifference(270, f.heading)) <= 25 &&
        Math.abs(f.crossTrack) <= 0.6 &&
        f.gear &&
        f.warnings.length === 0;
      put(
        "land",
        final
          ? ap.engaged
            ? "Take manual control"
            : "Manual control active"
          : "Hand-fly final",
      );
      disabled("land", s.paused || (final ? !ap.engaged : !eligible));
      disabled(
        "go-around",
        s.paused || (!final && f.distance > 4) || f.goArounds >= 2,
      );
      disabled("flare", s.paused || !final);
      disabled("gear", s.paused || f.warnings.includes("HYDRAULIC PRESSURE"));
      disabled("wings-level", s.paused);
      disabled("mcp-disconnect", s.paused || !ap.engaged);
      put(
        "station-message",
        s.training && s.tutorialStage !== "landing"
          ? "TRAINING · Aircraft held steady while you learn"
          : final
            ? `${ap.engaged ? "APPROACH COUPLED" : "MANUAL LANDING"} · ${2 - f.goArounds} go-arounds available`
            : `RUNWAY 27 · ${Math.max(0, f.distance).toFixed(1)} NM · INTEGRITY ${Math.round(f.integrity)}%`,
      );
    },
  };
}
