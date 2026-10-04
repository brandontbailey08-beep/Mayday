import { clamp } from "../../shared/approach";
import type { Snapshot } from "../../shared/protocol";
import { el, type Send } from "./flight-ui";

/** Keyboard and touch pedals share the same authoritative manual commands. */
export function bindFlightControls(
  send: Send,
  current: () => Snapshot | undefined,
  signal: AbortSignal,
) {
  const held = new Set<string>();
  let pedal = 0;
  const ready = () =>
    !current()?.paused && !document.body.classList.contains("offline");
  const paint = () => {
    for (const key of ["q", "w", "e", "a", "s", "d"])
      el(`key-${key}`)?.classList.toggle("held", held.has(key));
    el("rudder-left").classList.toggle("held", pedal < 0 || held.has("q"));
    el("rudder-right").classList.toggle("held", pedal > 0 || held.has("e"));
  };
  const yaw = () => pedal || Number(held.has("e")) - Number(held.has("q"));
  const fly = () => {
    const p = current()?.flight.pilot;
    if (!ready() || !p) return;
    const bank = Number(held.has("d")) - Number(held.has("a"));
    const pitch = Number(held.has("s")) - Number(held.has("w"));
    if (bank)
      send({ type: "bank", value: clamp(p.commandedBank + bank * 3, -25, 25) });
    if (pitch)
      send({
        type: "descent",
        value: clamp(
          (p.autopilot.engaged
            ? current()!.flight.verticalSpeed
            : p.commandedDescent) +
            pitch * 100,
          -1800,
          600,
        ),
      });
    if (yaw()) send({ type: "rudder", value: yaw() });
    paint();
  };
  const release = () => {
    if (ready()) {
      if (held.has("a") || held.has("d")) send({ type: "bank", value: 0 });
      if (yaw()) send({ type: "rudder", value: 0 });
    }
    held.clear();
    pedal = 0;
    paint();
  };
  window.addEventListener(
    "keydown",
    (e) => {
      if (
        !ready() ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        document.querySelector("dialog[open]") ||
        (e.target as HTMLElement).closest(
          "input,textarea,[contenteditable=true]",
        )
      )
        return;
      const key = e.key.toLowerCase();
      if (!["q", "w", "e", "a", "s", "d"].includes(key)) return;
      e.preventDefault();
      if (held.has(key)) return;
      held.add(key);
      fly();
    },
    { signal },
  );
  window.addEventListener(
    "keyup",
    (e) => {
      const key = e.key.toLowerCase();
      if (!held.delete(key)) return;
      e.preventDefault();
      if (ready() && (key === "q" || key === "e"))
        send({ type: "rudder", value: yaw() });
      if (
        ready() &&
        (key === "a" || key === "d") &&
        !held.has("a") &&
        !held.has("d")
      )
        send({ type: "bank", value: 0 });
      paint();
    },
    { signal },
  );
  window.addEventListener("blur", release, { signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) release();
    },
    { signal },
  );
  document.addEventListener(
    "focusin",
    (e) => {
      if ((e.target as HTMLElement).closest("input,textarea,dialog")) release();
    },
    { signal },
  );
  for (const [id, value] of [
    ["rudder-left", -1],
    ["rudder-right", 1],
  ] as const) {
    const button = el(id);
    button.addEventListener(
      "pointerdown",
      (e) => {
        if (!ready()) return;
        pedal = value;
        button.setPointerCapture(e.pointerId);
        fly();
      },
      { signal },
    );
    const center = () => {
      pedal = 0;
      if (ready()) send({ type: "rudder", value: yaw() });
      paint();
    };
    button.addEventListener("pointerup", center, { signal });
    button.addEventListener("pointercancel", center, { signal });
  }
  // 3 axes at 6.7 Hz stay within the server's input budget.
  const timer = window.setInterval(fly, 150);
  return () => {
    clearInterval(timer);
    held.clear();
    pedal = 0;
  };
}
