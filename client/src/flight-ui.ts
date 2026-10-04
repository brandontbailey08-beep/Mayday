import type { Command, Snapshot } from "../../shared/protocol";
import { guidance } from "../../shared/tutorial";
export type Send = (command: Command) => void;
export type Station = { update(s: Snapshot): void; dispose(): void };
export const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
export function put(id: string, value: string) {
  const node = el(id);
  if (node && node.textContent !== value) node.textContent = value;
}
export function disabled(id: string, value: boolean) {
  const node = el<HTMLButtonElement>(id);
  if (node) node.disabled = value;
}
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const flightBar = (station: string) =>
  `<header class="deck-top"><a class="deck-brand" href="/" aria-label="Mayday home">✳ <b>MAYDAY</b><span>404 / ${station}</span></a><span class="deck-connection"><i></i><span class="online-copy">TOWER CONNECTED</span><span class="offline-copy">CONNECTION LOST</span></span><nav><button id="mcp-toggle" class="mobile-mcp" aria-expanded="false" aria-controls="mcp-panel">MCP</button><button id="crew-open">Crew <span id="crew-code"></span></button><button id="help-open">Guide</button><button id="expand-view" aria-label="Toggle fullscreen">⛶</button><button id="leave">Exit</button></nav></header><div id="station-pause" class="station-pause" role="status" hidden>Flight paused — waiting for your crew to reconnect.</div>`;
export const flightDialogs = () =>
  `<dialog id="help-dialog" class="deck-dialog"><button class="dialog-close" data-close="help-dialog" aria-label="Close guide">×</button><span id="help-step" class="overline"></span><h2 id="help-title"></h2><p id="help-body"></p><p id="pilot-guide-note" class="dialog-note">Pilot: hold A / D to bank left / right; release to level the wings. W pushes the nose down; S pulls up. Q / E hold left / right rudder; release to center. Touch: drag the yoke and hold the rudder pedals. Manual input disconnects AP. Pitch stays where you leave it; use Wings level and Flare as needed. The MCP's selected values stay editable. On approach, AP hands back control at 150 FT; ease the descent with Flare below 50 FT.</p><p id="help-training"></p></dialog><dialog id="crew-dialog" class="deck-dialog"><button class="dialog-close" data-close="crew-dialog" aria-label="Close crew panel">×</button><span class="overline">CREW FREQUENCY · 121.500</span><h2>Your flight crew</h2><div id="crew-members"></div><button id="copy" class="deck-primary">Copy invite</button><div class="deck-callouts">${["Check your station", "Reduce thrust", "Systems stable", "Ready for approach"].map((message) => `<button data-callout="${message}">${message}</button>`).join("")}</div><div id="crew-log"></div></dialog>`;
export function bindFlightUi(send: Send, current: () => Snapshot | undefined) {
  el("help-open").onclick = () =>
    el<HTMLDialogElement>("help-dialog").showModal();
  el("crew-open").onclick = () =>
    el<HTMLDialogElement>("crew-dialog").showModal();
  document
    .querySelectorAll<HTMLButtonElement>("[data-close]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          el<HTMLDialogElement>(button.dataset.close!).close()),
    );
  document.querySelectorAll<HTMLButtonElement>("[data-callout]").forEach(
    (button) =>
      (button.onclick = () =>
        send({
          type: "callout",
          message: button.dataset.callout as "Reduce thrust",
        })),
  );
  el("expand-view").onclick = () => {
    const change = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen?.();
    change?.catch(() => {
      put(
        "station-message",
        "Browser fullscreen unavailable. The cockpit still fills this window.",
      );
    });
  };
  el("mcp-toggle").onclick = () => {
    const panel = el("mcp-panel");
    if (!panel) return;
    const open = panel.classList.toggle("mcp-open");
    el("mcp-toggle").setAttribute("aria-expanded", String(open));
  };
  return (s: Snapshot) => {
    const me = s.players.find((p) => p.id === s.you)!;
    put("crew-code", s.code);
    el("pilot-guide-note").hidden = me.role !== "pilot";
    el("station-pause").hidden = !s.paused;
    const hint = guidance(s, me.role);
    put(
      "help-step",
      s.training ? `TUTORIAL / ${hint.step} OF 6` : "STATION GUIDE",
    );
    put("help-title", hint.title);
    put("help-body", hint.body);
    put(
      "help-training",
      s.training
        ? "Training holds the aircraft steady during repairs. Once the approach starts, flight is live. Unsuccessful training landings reset for another try."
        : "Standard flight: the aircraft keeps flying during repairs. Coordinate with your crew.",
    );
    const roster = s.players
      .map(
        (p) =>
          `<div class="crew-person"><b>${escapeHtml(p.name)}</b><span>${p.role}${p.bot ? " · BOT" : ""} · ${p.connected ? "connected" : "offline"}</span></div>`,
      )
      .join("");
    if (el("crew-members").innerHTML !== roster)
      el("crew-members").innerHTML = roster;
    const logs = s.log
      .slice(-4)
      .reverse()
      .map((l) => `<p class="${l.severity}">${escapeHtml(l.text)}</p>`)
      .join("");
    if (el("crew-log").innerHTML !== logs) el("crew-log").innerHTML = logs;
    el("expand-view").setAttribute(
      "aria-label",
      document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen",
    );
    void current;
  };
}
