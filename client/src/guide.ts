import type { Snapshot } from "../../shared/protocol";
import { guidance } from "../../shared/tutorial";

let collapsed = false;
export function updateGuide(s: Snapshot) {
  const host = document.getElementById("flight-guide");
  if (!host) return;
  const role = s.players.find((p) => p.id === s.you)!.role;
  const hint = guidance(s, role);
  if (!host.firstElementChild) {
    host.className = "flight-guide";
    host.innerHTML = `<div class="guide-heading"><span id="guide-label" class="eyebrow"></span><button id="guide-toggle" class="text-button" aria-controls="guide-details"></button></div><div id="guide-details"><h3 id="guide-title"></h3><p id="guide-body"></p><div class="guide-footer"><span id="guide-mode"></span><button id="guide-locate">Show control ↓</button></div></div><p id="bot-advice" role="status" aria-live="polite" hidden></p>`;
    document.getElementById("guide-toggle")!.onclick = () => {
      collapsed = !collapsed;
      updateGuide(s);
    };
  }
  const set = (id: string, value: string) => {
    const e = document.getElementById(id)!;
    if (e.textContent !== value) e.textContent = value;
  };
  set(
    "guide-label",
    s.training ? `GUIDED TUTORIAL / STEP ${hint.step} OF 6` : "STATION GUIDE",
  );
  set("guide-title", hint.title);
  set("guide-body", hint.body);
  set(
    "guide-mode",
    s.paused
      ? "Waiting for crew to reconnect"
      : s.training && s.tutorialStage !== "landing"
        ? "AIRCRAFT HELD STEADY · Take your time"
        : s.training
          ? "LANDING IN PROGRESS"
          : "LIVE FLIGHT · Keep an eye on your instruments",
  );
  set("guide-toggle", collapsed ? "Show guide +" : "Hide guide −");
  document
    .getElementById("guide-toggle")!
    .setAttribute("aria-expanded", String(!collapsed));
  // Bind to the latest snapshot; toggling must never restore an old tutorial step.
  document.getElementById("guide-toggle")!.onclick = () => {
    collapsed = !collapsed;
    updateGuide(s);
  };
  document.getElementById("guide-details")!.hidden = collapsed;
  const locate = document.getElementById("guide-locate") as HTMLButtonElement;
  locate.hidden = !hint.target;
  locate.onclick = () => {
    const target = hint.target ? document.getElementById(hint.target) : null;
    target?.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    target?.focus({ preventScroll: true });
  };
  for (const node of document.querySelectorAll(".tutorial-target"))
    node.classList.remove("tutorial-target");
  if (!collapsed && hint.target)
    document.getElementById(hint.target)?.classList.add("tutorial-target");
  set("bot-advice", s.botAdvice ?? "");
  document.getElementById("bot-advice")!.hidden = !s.botAdvice;
}
