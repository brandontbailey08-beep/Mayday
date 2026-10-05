import "./style.css";
import "./deck.css";
import { mountCockpit } from "./cockpit";
import { mountEngineering } from "./engineering";
import type { Station } from "./flight-ui";
import { io, type Socket } from "socket.io-client";
import { updateGuide } from "./guide";

import { PROTOCOL_VERSION } from "../../shared/protocol";
import type {
  ClientEvents,
  Command,
  Reply,
  Request,
  Role,
  ServerEvents,
  Snapshot,
} from "../../shared/protocol";
const app = document.querySelector<HTMLElement>("#app")!;
const worldCanvas = document.querySelector<HTMLCanvasElement>("#world")!;
let stationController: Station | undefined;
function parkWorld() {
  stationController?.dispose();
  stationController = undefined;
  delete document.body.dataset.station;
  document.body.prepend(worldCanvas);
}
const socket: Socket<ServerEvents, ClientEvents> = io({ autoConnect: false });
let snapshot: Snapshot | undefined;
let screen = "";
let sequence = 0;
let online = false;
let toastTimer = 0;
let world: { update: (f: Snapshot["flight"]) => void } | undefined;
let session: { code: string; token: string; playerId: string } | undefined;
try {
  session =
    JSON.parse(sessionStorage.getItem("mayday-session") ?? "null") ?? undefined;
} catch {
  /* storage unavailable */
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const time = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
const roleName = (role: Role) =>
  ({ pilot: "Pilot", engineer: "Flight engineer", observer: "Observer" })[role];
function text(id: string, value: string) {
  const el = document.getElementById(id);
  if (el && el.textContent !== value) el.textContent = value;
}
function toast(message: string) {
  text("toast", message);
  document.getElementById("toast")!.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => document.getElementById("toast")!.classList.remove("show"),
    6000,
  );
}
function saveSession(value: typeof session) {
  session = value;
  try {
    if (value) sessionStorage.setItem("mayday-session", JSON.stringify(value));
    else sessionStorage.removeItem("mayday-session");
  } catch {
    /* private browsers may block storage */
  }
}
async function request(value: Request): Promise<Reply> {
  if (!online) {
    toast("Tower connection lost. Controls will return after reconnection.");
    return { ok: false, error: "Offline" };
  }
  try {
    const reply = await socket.timeout(5000).emitWithAck("request", value);
    if (!reply.ok) toast(reply.error);
    else if (reply.session) saveSession(reply.session);
    return reply;
  } catch {
    toast("Tower did not respond. Check your connection and try again.");
    return { ok: false, error: "Timeout" };
  }
}
const command = (value: Command) => {
  void request({ type: "command", sequence: ++sequence, command: value });
};
function status() {
  text("connection", online ? "TOWER CONNECTED" : "RECONNECTING TO TOWER");
  document.getElementById("connection-dot")!.classList.toggle("online", online);
  document.body.classList.toggle("offline", !online);
}
function entry() {
  parkWorld();
  window.scrollTo(0, 0);
  screen = "entry";
  snapshot = undefined;
  document.body.dataset.screen = "entry";
  const code = new URL(location.href).searchParams.get("room") ?? "";
  app.innerHTML = `<section class="entry"><div class="eyebrow"><span class="line"></span> A COOPERATIVE AVIATION DISASTER GAME</div>
    <h1>One aircraft.<br>Every second.<br><em>All of you.</em></h1>
    <p class="intro">The aircraft is falling apart.<br>Your crew is the only thing holding it together.</p>
    <div class="dispatch-card"><div class="panel-label">01 / CREW CHECK-IN <span>2 ACTIVE STATIONS</span></div>
      <label class="field-label" for="name">YOUR CALLSIGN</label><input id="name" maxlength="20" placeholder="Enter a callsign" autocomplete="nickname" value="" />
      <button id="create" class="primary">Create a flight <span>↗</span></button>
      <div class="join-row"><input id="code" maxlength="5" placeholder="ROOM CODE" aria-label="Room code" value="${escape(code.toUpperCase().slice(0, 5))}" autocapitalize="characters" spellcheck="false"/><button id="join">Join flight →</button></div>
      <button id="learn" class="tutorial-launch">Learn to fly · Solo tutorial →</button>
      <p class="fine">Invite a friend, or add a bot in the lobby to test solo.</p>
    </div><div class="entry-meta"><span>02–08 CREW</span><span>4–6 MIN DIVERSION</span><span>PHONE + DESKTOP</span></div></section>
    <aside class="hero-caption"><span class="tiny">LIVE AIRCRAFT PREVIEW</span><strong>MF–404</strong><a class="inspect-aircraft" href="/aircraft.html">Inspect aircraft ↗</a><span>CHICAGO → DENVER</span><div class="route-line"><i></i><span>DIVERSION IN PROGRESS</span><i></i></div></aside>`;
  const enter = async (join: boolean) => {
    const name = (
      document.getElementById("name") as HTMLInputElement
    ).value.trim();
    const code = (document.getElementById("code") as HTMLInputElement).value
      .trim()
      .toUpperCase();
    if (!name) {
      toast("Choose a callsign so your crew knows who is on station.");
      document.getElementById("name")!.focus();
      return;
    }
    const buttons = app.querySelectorAll<HTMLButtonElement>("button");
    buttons.forEach((b) => (b.disabled = true));
    await request(
      join ? { type: "join", code, name } : { type: "create", name },
    );
    buttons.forEach((b) => (b.disabled = false));
  };
  document.getElementById("create")!.onclick = () => {
    void enter(false);
  };
  document.getElementById("join")!.onclick = () => {
    void enter(true);
  };
  document.getElementById("code")!.onkeydown = (e) => {
    if (e.key === "Enter") void enter(true);
  };
  bind("learn", () => {
    const name =
      (document.getElementById("name") as HTMLInputElement).value.trim() ||
      "CADET";
    const buttons = app.querySelectorAll<HTMLButtonElement>("button");
    buttons.forEach((b) => {
      b.disabled = true;
    });
    void (async () => {
      const steps: Request[] = [
        { type: "create", name },
        { type: "training", enabled: true },
        { type: "bot", role: "engineer", enabled: true },
        { type: "ready", ready: true },
        { type: "start" },
      ];
      for (const step of steps) if (!(await request(step)).ok) break;
      buttons.forEach((b) => {
        b.disabled = false;
      });
    })();
  });
}
function bind(id: string, fn: () => void) {
  document.getElementById(id)?.addEventListener("click", fn);
}
function commonActions() {
  bind("leave", () => {
    void request({ type: "leave" }).then((reply) => {
      if (reply.ok) {
        saveSession(undefined);
        entry();
      }
    });
  });
  bind("copy", () => {
    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("room", snapshot!.code);
    if (navigator.clipboard && window.isSecureContext)
      void navigator.clipboard.writeText(url.href).then(
        () => toast("Invite link copied. Open it on your friend’s device."),
        () => toast(`Share flight code ${snapshot!.code}`),
      );
    else toast(`Share this address and flight code ${snapshot!.code}`);
  });
}
function roomHeader() {
  return `<div class="room-heading"><div><span class="eyebrow">FLIGHT OPERATIONS / MF–404</span><h2 id="screen-title">Crew briefing</h2></div><div class="room-code"><span>ROOM CODE</span><strong id="room-code"></strong><button id="copy" class="text-button">Copy invite ↗</button></div></div>`;
}
function lobby() {
  parkWorld();
  document.body.dataset.screen = "lobby";
  app.innerHTML = `<section class="lobby">${roomHeader()}<div class="briefing-grid"><section class="panel"><div class="panel-label">01 / MANIFEST <span id="crew-count"></span></div><div id="roster"></div>
    <div class="field-label">CHOOSE YOUR STATION</div><div class="role-options"><button data-role="pilot">01 <strong>Pilot</strong><small>Fly the diversion</small></button><button data-role="engineer">02 <strong>Engineer</strong><small>Keep us in the air</small></button><button data-role="observer">03 <strong>Observer</strong><small>Watch the crew</small></button></div>
    <button id="ready" class="primary">Ready for departure</button><button id="start" class="dispatch">Dispatch flight →</button><p id="lobby-hint" class="fine"></p><button id="leave" class="text-button">← Leave flight</button></section>
    <section class="mission-brief"><div class="eyebrow">YOUR ASSIGNMENT</div><h3>A routine flight.<br>Until it isn’t.</h3><p>Divert to Runway 27 before the aircraft gives out. Your instruments are different. Your decisions are connected.</p>
    <ol class="steps"><li><b>Talk to each other.</b><span>Use a voice call or play in the same room. Quick callouts are also available.</span></li><li><b>Pilot: set up the approach.</b><span>Follow the intercept heading to the centerline. Descend to 1,200 FT and lower the gear.</span></li><li><b>Engineer: read the warnings.</b><span>Route oil through the pipe grid. Isolate, replace and rewire faulty avionics. Coordinate thrust with the pilot.</span></li><li><b>Bring everyone home.</b><span>Use AP CMD + APP to capture final, or hand-fly. AP releases at 150 FT. Keep aligned, then flare below 50 FT.</span></li></ol>
    <div class="brief-note">TWO-STATION VERTICAL SLICE <span>Pilot + engineer required. Bots can fill either station. Up to six observers can join.</span></div></section></div></section>`;
  app.querySelectorAll<HTMLButtonElement>("[data-role]").forEach(
    (b) =>
      (b.onclick = () => {
        void request({ type: "role", role: b.dataset.role as Role });
      }),
  );
  bind("ready", () => {
    const me = snapshot!.players.find((p) => p.id === snapshot!.you)!;
    void request({ type: "ready", ready: !me.ready });
  });
  bind("start", () => {
    void request({ type: "start" });
  });
  const testing = document.createElement("section");
  testing.className = "testing-options";
  testing.innerHTML = `<div class="field-label">TESTING CREW <span id="bot-host-note"></span></div><div class="button-pair"><button id="bot-pilot"></button><button id="bot-engineer"></button></div><button id="fill-bots" class="wide">Fill empty stations with bots</button><p class="fine">Bots are ready automatically. Choose a bot’s station to take over in the lobby, or choose Observer to watch two bots fly.</p><div class="field-label">MISSION</div><div class="button-pair"><button id="mode-standard">Standard flight</button><button id="mode-training">Guided tutorial</button></div><p id="mission-detail" class="fine"></p>`;
  document.getElementById("ready")!.before(testing);
  for (const role of ["pilot", "engineer"] as const)
    bind(`bot-${role}`, () => {
      const occupied = snapshot!.players.some((p) => p.role === role && p.bot);
      void request({ type: "bot", role, enabled: !occupied });
    });
  bind("fill-bots", () => {
    const empty = (["pilot", "engineer"] as const).filter(
      (role) => !snapshot!.players.some((p) => p.role === role),
    );
    void (async () => {
      for (const role of empty)
        if (!(await request({ type: "bot", role, enabled: true })).ok) break;
    })();
  });
  bind("mode-standard", () => {
    void request({ type: "training", enabled: false });
  });
  bind("mode-training", () => {
    void request({ type: "training", enabled: true });
  });
  commonActions();
}
function flight(role: Role) {
  parkWorld();
  document.body.dataset.screen = "flight";
  if (role === "pilot" || role === "engineer") {
    stationController =
      role === "pilot"
        ? mountCockpit(app, worldCanvas, command, () => snapshot)
        : mountEngineering(app, command, () => snapshot);
    commonActions();
    return;
  }
  app.innerHTML = `<section class="flight">${roomHeader()}<div id="pause-banner" class="pause-banner" role="status" hidden>Flight paused. Waiting for the crew to reconnect.</div><div id="flight-guide"></div><div class="flight-grid"><section class="flight-view"><div class="view-label"><span>OBSERVATION DECK / MF–404</span><span id="elapsed"></span></div><div id="warnings" class="warnings"></div><div class="hud"><div><span>AIRSPEED / KT</span><strong id="speed"></strong></div><div><span>ALTITUDE / FT</span><strong id="alt"></strong></div><div><span>HEADING / °</span><strong id="hdg"></strong></div><div><span>DISTANCE / NM</span><strong id="dist"></strong></div></div><div class="view-bottom"><span>INTEGRITY <b id="integrity"></b></span><div class="integrity-track"><i id="integrity-bar"></i></div><span id="approach-status"></span></div></section><section class="panel station"><div class="panel-label">OBSERVATION DECK</div><h3>One crew.<br>One shared fate.</h3><p>Watch your pilot and engineer work together.</p><div id="vacant-roles"></div><button id="leave" class="wide">Leave flight</button></section><section class="panel comms"><div class="panel-label">CREW FREQUENCY</div><div id="log"></div></section></div></section>`;
  document.querySelector(".flight-view")!.prepend(worldCanvas);
  commonActions();
}
function report() {
  parkWorld();
  const r = snapshot!.report!;
  document.body.dataset.screen = "report";
  app.innerHTML = `<section class="report"><div class="eyebrow">MF–404 / POST-FLIGHT REPORT</div><span class="report-symbol">${r.success ? "↘" : "!"}</span><h1>${r.success ? "Welcome<br><em>back to earth.</em>" : "We lost<br><em>Flight 404.</em>"}</h1><p class="intro">${escape(r.reason)}</p><div class="report-stats"><div><span>CREW SCORE</span><strong>${r.score.toLocaleString()}</strong></div><div><span>INTEGRITY</span><strong>${r.integrity}%</strong></div><div><span>FAILURES RESOLVED</span><strong>${r.resolved}</strong></div><div><span>FLIGHT TIME</span><strong>${time(r.duration)}</strong></div></div><button id="restart" class="primary">Return to crew briefing →</button><p id="report-hint" class="fine"></p><button id="leave" class="text-button">← Leave flight</button></section>`;
  if (snapshot!.training) {
    document.querySelector(".report > .eyebrow")!.textContent =
      "MF–404 / GUIDED TUTORIAL COMPLETE";
    document.querySelector(".report > .intro")!.textContent =
      "Training complete. You practiced engine fire, hydraulics, electrical recovery and landing. Try the other station or switch to Standard flight for a live diversion.";
  }
  bind("restart", () => {
    void request({ type: "restart" });
  });
  commonActions();
}
function update(s: Snapshot) {
  if (s.version !== PROTOCOL_VERSION) {
    toast("The game has updated. Refresh this page to reconnect.");
    return;
  }
  snapshot = s;
  world?.update(s.flight);
  const me = s.players.find((p) => p.id === s.you)!;
  const key =
    s.phase === "lobby"
      ? "lobby"
      : s.phase === "flying"
        ? `flight-${me.role}`
        : `report-${s.phase}`;
  if (screen !== key) {
    screen = key;
    if (s.phase === "lobby") lobby();
    else if (s.phase === "flying") flight(me.role);
    else report();
    window.scrollTo(0, 0);
  }
  text("room-code", s.code);
  text(
    "screen-title",
    s.phase === "lobby" ? "Crew briefing" : `${roleName(me.role)} station`,
  );
  if (s.phase === "lobby") {
    const host = s.hostId === s.you;
    text("bot-host-note", host ? "HOST CONTROLS" : "HOST MANAGES BOTS");
    for (const role of ["pilot", "engineer"] as const) {
      const occupant = s.players.find((p) => p.role === role);
      text(
        `bot-${role}`,
        occupant?.bot
          ? `Remove ${role} bot`
          : occupant
            ? `${roleName(role)} · Human`
            : `Add ${role} bot`,
      );
      (document.getElementById(`bot-${role}`) as HTMLButtonElement).disabled =
        !host ||
        (!!occupant && !occupant.bot) ||
        (!occupant && s.players.length >= 8);
    }
    (document.getElementById("fill-bots") as HTMLButtonElement).disabled =
      !host ||
      s.players.length >= 8 ||
      ["pilot", "engineer"].every((role) =>
        s.players.some((p) => p.role === role),
      );
    for (const [id, selected] of [
      ["mode-standard", !s.training],
      ["mode-training", s.training],
    ] as const) {
      const button = document.getElementById(id) as HTMLButtonElement;
      button.disabled = !host;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    text(
      "mission-detail",
      s.training
        ? "Practice six steps with the aircraft held steady while you learn. You can train at either station with a bot partner."
        : "Random failures and live flight physics. Bots can fly either station during testing.",
    );
    text("crew-count", `${s.players.length} / 8 ON MANIFEST`);
    const roster = s.players
      .map(
        (p) =>
          `<div class="crew-member"><span class="avatar">${p.bot ? "AI" : escape(p.name.slice(0, 2).toUpperCase())}</span><div><strong>${escape(p.name)} ${p.id === s.you ? "<small>YOU</small>" : ""}</strong><span>${roleName(p.role)}${p.id === s.hostId ? " · Flight host" : ""}</span></div><span class="crew-status ${p.ready ? "ready" : ""}">${p.bot ? "BOT · READY" : !p.connected ? "OFFLINE" : p.ready ? "READY" : "CHECKING IN"}</span></div>`,
      )
      .join("");
    const list = document.getElementById("roster")!;
    if (list.innerHTML !== roster) list.innerHTML = roster;
    app.querySelectorAll<HTMLButtonElement>("[data-role]").forEach((b) => {
      b.classList.toggle("selected", b.dataset.role === me.role);
      b.disabled =
        b.dataset.role !== "observer" &&
        s.players.some(
          (p) => p.id !== s.you && p.role === b.dataset.role && !p.bot,
        );
    });
    text(
      "ready",
      me.ready ? "✓ Ready — click to stand down" : "Ready for departure",
    );
    const canStart = ["pilot", "engineer"].every((r) =>
      s.players.some((p) => p.role === r && p.ready && p.connected),
    );
    (document.getElementById("start") as HTMLButtonElement).disabled =
      s.hostId !== s.you || !canStart;
    text(
      "lobby-hint",
      s.hostId !== s.you
        ? "The flight host will dispatch when both stations are ready."
        : canStart
          ? "All required stations ready. You are cleared for dispatch."
          : "Ready both stations to dispatch. Invite a friend or fill the empty station with a bot.",
    );
  } else if (s.phase === "flying") {
    if (stationController) {
      stationController.update(s);
      return;
    }
    updateGuide(s);
    const f = s.flight;
    text("my-role", roleName(me.role).toUpperCase());
    text("speed", Math.round(f.speed).toString());
    text("alt", Math.round(f.altitude).toLocaleString());
    text("hdg", Math.round(f.heading).toString().padStart(3, "0"));
    text("dist", Math.max(0, f.distance).toFixed(1));
    text("elapsed", time(f.elapsed));
    text("integrity", `${Math.round(f.integrity)}%`);
    document.getElementById("integrity-bar")!.style.width = `${f.integrity}%`;
    document.getElementById("pause-banner")!.hidden = !s.paused;
    const warnings = f.warnings
      .map((w) => `<span>⚠ ${escape(w)}</span>`)
      .join("");
    if (document.getElementById("warnings")!.innerHTML !== warnings)
      document.getElementById("warnings")!.innerHTML = warnings;
    text(
      "approach-status",
      f.landing !== null
        ? `MANUAL FINAL · YOU HAVE CONTROL`
        : "DIVERTING TO RUNWAY 27",
    );
    if (me.role === "observer") {
      const vacant = document.getElementById("vacant-roles")!;
      const html = (["pilot", "engineer"] as const)
        .filter((role) => !s.players.some((p) => p.role === role))
        .map(
          (role) =>
            `<button data-fill="${role}" class="wide">Take ${roleName(role)} station</button>`,
        )
        .join("");
      if (vacant.innerHTML !== html) {
        vacant.innerHTML = html;
        vacant.querySelectorAll<HTMLButtonElement>("button").forEach(
          (b) =>
            (b.onclick = () => {
              void request({ type: "role", role: b.dataset.fill as Role });
            }),
        );
      }
    }
    const log = document.getElementById("log")!;
    const logHtml = [...s.log]
      .reverse()
      .slice(0, 5)
      .map(
        (l) =>
          `<div class="log-line ${l.severity}"><time>${time(l.time)}</time><span>${escape(l.text)}</span></div>`,
      )
      .join("");
    if (log.innerHTML !== logHtml) log.innerHTML = logHtml;
  } else {
    (document.getElementById("restart") as HTMLButtonElement).disabled =
      s.hostId !== s.you;
    text(
      "report-hint",
      s.hostId === s.you
        ? "Return to briefing to change stations and fly a new failure sequence."
        : "Waiting for the host to return the crew to briefing.",
    );
  }
}
socket.on("connect", () => {
  online = true;
  sequence = 0;
  status();
  if (session)
    void request({
      type: "resume",
      code: session.code,
      token: session.token,
    }).then((reply) => {
      if (!reply.ok) {
        saveSession(undefined);
        entry();
      }
    });
});
socket.on("disconnect", () => {
  online = false;
  status();
});
socket.on("connect_error", () => {
  online = false;
  status();
});
socket.on("snapshot", update);
entry();
socket.connect();
void import("./scene")
  .then(({ createWorld }) => {
    world = createWorld(document.querySelector<HTMLCanvasElement>("#world")!);
    if (snapshot) world.update(snapshot.flight);
  })
  .catch((error) => {
    console.warn("3D preview unavailable:", error);
    document.body.classList.add("no-webgl");
    toast(
      "3D preview unavailable on this device. All flight controls remain playable.",
    );
  });
