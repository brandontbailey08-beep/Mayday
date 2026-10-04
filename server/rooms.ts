import { randomInt, randomUUID } from "node:crypto";
import {
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  RECONNECT_MS,
  requestSchema,
  type Aircraft,
  type FlightReport,
  type LogEntry,
  type Phase,
  type Player,
  type Reply,
  type Snapshot,
  type TutorialStage,
} from "../shared/protocol.js";
import {
  applyCommand,
  createAircraft,
  createSchedule,
  landingRequirements,
  stepAircraft,
  triggerFailure,
  type ScheduledFailure,
} from "./simulation.js";
import { botCommand, botMessage, engineerAdvice } from "./bots.js";
import { autopilotStep, disconnectAutopilot } from "./autopilot.js";

interface Member extends Player {
  token: string;
  socketId: string | null;
  disconnectedAt: number;
  sequence: number;
}
export interface Room {
  code: string;
  hostId: string;
  members: Member[];
  phase: Phase;
  aircraft: Aircraft;
  tick: number;
  log: LogEntry[];
  logId: number;
  schedule: ScheduledFailure[];
  report: FlightReport | null;
  lastActive: number;
  training: boolean;
  tutorialStage: TutorialStage | null;
  botClock: number;
  nextBotAt: number;
}
export class RoomService {
  readonly rooms = new Map<string, Room>();
  private memberships = new Map<string, string>();
  constructor(private now = () => Date.now()) {}
  roomFor(socketId: string) {
    return this.rooms.get(this.memberships.get(socketId) ?? "");
  }
  request(socketId: string, input: unknown): Reply {
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success)
      return {
        ok: false,
        error: "Invalid request. Check your room code and control values.",
      };
    const request = parsed.data;
    const fail = (error: string): Reply => ({ ok: false, error });
    let room = this.roomFor(socketId);
    if (
      request.type === "create" ||
      request.type === "join" ||
      request.type === "resume"
    ) {
      if (room) return fail("Leave the current flight before joining another.");
      if (request.type === "resume") {
        room = this.rooms.get(request.code);
        const member = room?.members.find((m) => m.token === request.token);
        if (
          !room ||
          !member ||
          member.connected ||
          this.now() - member.disconnectedAt > RECONNECT_MS
        )
          return fail(
            "That session expired or is already connected. Rejoin the flight.",
          );
        member.connected = true;
        member.socketId = socketId;
        member.sequence = -1;
        this.memberships.set(socketId, room.code);
        this.log(room, `${member.name} reconnected.`, "success");
        return {
          ok: true,
          session: {
            code: room.code,
            token: member.token,
            playerId: member.id,
          },
        };
      }
      if (request.type === "create") {
        if (this.rooms.size >= 100)
          return fail("The tower is at capacity. Try again later.");
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let code: string;
        do {
          code = Array.from(
            { length: 5 },
            () => alphabet[randomInt(alphabet.length)],
          ).join("");
        } while (this.rooms.has(code));
        room = {
          code,
          hostId: "",
          members: [],
          phase: "lobby",
          aircraft: createAircraft(),
          tick: 0,
          log: [],
          logId: 0,
          schedule: [],
          report: null,
          lastActive: this.now(),
          training: false,
          tutorialStage: null,
          botClock: 0,
          nextBotAt: 0,
        };
        this.rooms.set(code, room);
      } else room = this.rooms.get(request.code);
      if (!room)
        return fail("Flight not found. Check the five-character code.");
      const reliefBot =
        room.phase === "lobby" ? room.members.find((m) => m.bot) : undefined;
      if (room.members.length >= MAX_PLAYERS && !reliefBot)
        return fail("This flight already has eight crew members.");
      let role: Player["role"] =
        room.phase !== "lobby"
          ? "observer"
          : !room.members.some((m) => m.role === "pilot")
            ? "pilot"
            : !room.members.some((m) => m.role === "engineer")
              ? "engineer"
              : "observer";
      if (role === "observer" && reliefBot) {
        role = reliefBot.role;
        room.members = room.members.filter((m) => m !== reliefBot);
      }
      const member: Member = {
        id: randomUUID(),
        token: randomUUID(),
        name: request.name,
        role,
        ready: false,
        connected: true,
        bot: false,
        socketId,
        disconnectedAt: 0,
        sequence: -1,
      };
      room.members.push(member);
      room.lastActive = this.now();
      if (!room.hostId) room.hostId = member.id;
      this.electHost(room);
      this.memberships.set(socketId, room.code);
      this.log(room, `${member.name} joined the crew.`, "info");
      return {
        ok: true,
        session: { code: room.code, token: member.token, playerId: member.id },
      };
    }
    const member = room?.members.find((m) => m.socketId === socketId);
    if (!room || !member) return fail("Join a flight first.");
    room.lastActive = this.now();
    switch (request.type) {
      case "training":
        if (member.id !== room.hostId || room.phase !== "lobby")
          return fail("Only the host can change the mission in the lobby.");
        room.training = request.enabled;
        room.members.forEach((m) => {
          if (!m.bot) m.ready = false;
        });
        break;
      case "bot": {
        if (member.id !== room.hostId)
          return fail("Only the host can manage testing bots.");
        if (room.phase !== "lobby")
          return fail("Manage bots in the lobby before departure.");
        const occupant = room.members.find((m) => m.role === request.role);
        if (!request.enabled) {
          if (occupant && !occupant.bot)
            return fail("A human controls that station.");
          if (occupant)
            room.members = room.members.filter((m) => m !== occupant);
        } else {
          if (occupant) return fail("That station is already occupied.");
          if (room.members.length >= MAX_PLAYERS)
            return fail("This flight already has eight crew members.");
          room.members.push({
            id: randomUUID(),
            token: "",
            name:
              request.role === "pilot"
                ? "ATLAS · Pilot bot"
                : "PATCH · Engineer bot",
            role: request.role,
            ready: true,
            connected: true,
            bot: true,
            socketId: null,
            disconnectedAt: 0,
            sequence: -1,
          });
        }
        break;
      }
      case "leave":
        this.remove(room, member);
        return { ok: true };
      case "role":
        if (
          room.phase !== "lobby" &&
          !(
            room.phase === "flying" &&
            this.paused(room) &&
            member.role === "observer" &&
            request.role !== "observer"
          )
        )
          return fail(
            "Stations can only change in the lobby or when filling an empty flight station.",
          );
        const botSeat =
          room.phase === "lobby"
            ? room.members.find((m) => m.role === request.role && m.bot)
            : undefined;
        if (
          request.role !== "observer" &&
          room.members.some(
            (m) =>
              m.id !== member.id && m.role === request.role && m !== botSeat,
          )
        )
          return fail("That station is occupied.");
        if (botSeat) room.members = room.members.filter((m) => m !== botSeat);
        member.role = request.role;
        member.ready = false;
        break;
      case "ready":
        if (room.phase !== "lobby") return fail("Flight already underway.");
        member.ready = request.ready;
        break;
      case "start":
        if (member.id !== room.hostId)
          return fail("Only the flight host can dispatch.");
        if (room.phase !== "lobby") return fail("Flight already underway.");
        if (
          !["pilot", "engineer"].every((role) =>
            room!.members.some(
              (m) => m.role === role && m.ready && m.connected,
            ),
          )
        )
          return fail("A connected pilot and engineer must both be ready.");
        room.phase = "flying";
        room.schedule = room.training
          ? []
          : createSchedule(randomInt(0x100000000));
        room.tutorialStage = room.training ? "setup" : null;
        room.botClock = 0;
        room.nextBotAt = 0;
        this.log(
          room,
          "Divert to Runway 27. Pilot: descend to 1,200 FT, heading 270°. Engineer: monitor systems.",
          "info",
        );
        break;
      case "restart":
        if (member.id !== room.hostId)
          return fail("Only the host can return the crew to briefing.");
        if (room.phase !== "landed" && room.phase !== "crashed")
          return fail("Finish the current flight first.");
        room.phase = "lobby";
        room.aircraft = createAircraft();
        room.report = null;
        room.schedule = [];
        room.tutorialStage = null;
        room.log = [];
        room.members.forEach((m) => {
          m.ready = m.bot;
        });
        break;
      case "command": {
        if (room.phase !== "flying" || this.paused(room))
          return fail(
            "Flight controls are unavailable while waiting for crew.",
          );
        if (request.sequence <= member.sequence)
          return fail("Stale command ignored.");
        member.sequence = request.sequence;
        const before = room.aircraft.resolved;
        const error = applyCommand(room.aircraft, member.role, request.command);
        if (error) return fail(error);
        if (request.command.type === "callout")
          this.log(room, `${member.name}: ${request.command.message}`, "info");
        if (room.aircraft.resolved > before)
          this.log(room, "Engineer reports: system recovered.", "success");
        if (request.command.type === "land")
          this.log(
            room,
            "Manual final engaged. Pilot: steer, follow the glide path, then flare below 50 FT.",
            "success",
          );
        break;
      }
    }
    return { ok: true };
  }
  disconnect(socketId: string) {
    const room = this.roomFor(socketId);
    const member = room?.members.find((m) => m.socketId === socketId);
    if (!room || !member) return;
    this.memberships.delete(socketId);
    member.connected = false;
    member.socketId = null;
    member.disconnectedAt = this.now();
    this.log(
      room,
      `${member.name} lost connection. Station reserved for 60 seconds.`,
      "warning",
    );
    this.electHost(room);
  }
  private remove(room: Room, member: Member) {
    if (member.socketId) this.memberships.delete(member.socketId);
    room.members = room.members.filter((m) => m !== member);
    this.electHost(room);
    if (!room.members.some((m) => !m.bot)) this.rooms.delete(room.code);
  }
  private electHost(room: Room) {
    if (
      !room.members.some((m) => m.id === room.hostId && m.connected && !m.bot)
    )
      room.hostId =
        room.members.find((m) => m.connected && !m.bot)?.id ??
        room.members.find((m) => !m.bot)?.id ??
        "";
  }
  paused(room: Room) {
    return (
      room.phase === "flying" &&
      (!room.members.some((m) => m.connected && !m.bot) ||
        !["pilot", "engineer"].every((role) =>
          room.members.some((m) => m.role === role && m.connected),
        ))
    );
  }
  log(room: Room, text: string, severity: LogEntry["severity"]) {
    room.log.push({
      id: ++room.logId,
      time: room.aircraft.elapsed,
      text,
      severity,
    });
    room.log = room.log.slice(-12);
  }
  step(dt: number) {
    for (const room of this.rooms.values()) {
      for (const member of [...room.members])
        if (
          !member.connected &&
          this.now() - member.disconnectedAt > RECONNECT_MS
        )
          this.remove(room, member);
      room.tick++;
      if (room.phase !== "flying" || this.paused(room)) continue;
      room.botClock += dt;
      if (room.botClock >= room.nextBotAt) {
        room.nextBotAt = room.botClock + 0.8;
        for (const bot of room.members.filter((m) => m.bot)) {
          const command = botCommand(room.aircraft, bot.role);
          if (
            command &&
            !applyCommand(room.aircraft, bot.role, command) &&
            !["bank", "descent", "heading", "pipe", "wire"].includes(
              command.type,
            )
          )
            this.log(room, botMessage(command), "success");
        }
      }
      if (room.training) {
        this.advanceTutorial(room);
        // Hold position, fuel and damage while the crew reads and practices.
        if (room.tutorialStage !== "landing") continue;
      }
      if (room.aircraft.landing === null) {
        while (room.schedule[0] && room.aircraft.elapsed >= room.schedule[0].at)
          this.log(
            room,
            triggerFailure(room.aircraft, room.schedule.shift()!),
            "warning",
          );
      }
      const report = stepAircraft(room.aircraft, dt);
      if (report) {
        if (room.training && !report.success) {
          disconnectAutopilot(room.aircraft, "pilot");
          room.aircraft.autopilot.autoThrottle = false;
          // Training retries the manual segment; standard flights retain real losses.
          Object.assign(room.aircraft, {
            distance: 3.2,
            altitude: 1200,
            crossTrack: 0.18,
            heading: 270,
            bank: 0,
            verticalSpeed: 0,
            commandedBank: 0,
            commandedDescent: -1000,
            rudder: 0,
            rudderTime: 0,
            speed: 205,
            integrity: 100,
            elapsed: 0,
            landing: 0,
          });
          this.log(room, "Training retry: " + report.reason, "warning");
          continue;
        }
        room.report = report;
        room.phase = report.success ? "landed" : "crashed";
        this.log(room, report.reason, report.success ? "success" : "warning");
      }
    }
  }
  private advanceTutorial(room: Room) {
    const a = room.aircraft;
    switch (room.tutorialStage) {
      case "setup":
        if (a.targetAltitude !== 1200) return;
        room.tutorialStage = "fire";
        this.log(
          room,
          triggerFailure(a, { at: 0, kind: "fire", engine: 1 }),
          "warning",
        );
        break;
      case "fire":
        if (a.engines[1].fire || a.engines[1].bottle) return;
        room.tutorialStage = "hydraulics";
        this.log(
          room,
          triggerFailure(a, { at: 0, kind: "hydraulics", engine: 0 }),
          "warning",
        );
        break;
      case "hydraulics":
        if (a.hydraulicFault) return;
        room.tutorialStage = "electrical";
        this.log(
          room,
          triggerFailure(a, { at: 0, kind: "electrical", engine: 0 }),
          "warning",
        );
        break;
      case "electrical":
        if (a.electricalFault) return;
        room.tutorialStage = "approach";
        a.altitude = 1200;
        a.targetAltitude = 1200;
        a.speed = 215;
        a.distance = 3;
        a.crossTrack = 0.18;
        a.heading = 270;
        a.targetHeading = 270;
        a.gear = false;
        this.log(
          room,
          "Tutorial: positioned on final. Lower gear, engage AP CMD + APP or hand-fly. AP hands control back at 150 FT; flare below 50 FT.",
          "info",
        );
        break;
      case "approach":
        // Training freezes motion until final begins, but APP must still be
        // able to capture the prepared approach without advancing the clock.
        autopilotStep(a, 0, landingRequirements(a).length === 0);
        if (a.landing !== null) room.tutorialStage = "landing";
        break;
    }
  }
  snapshot(room: Room, socketId: string): Snapshot {
    const a = room.aircraft;
    const member = room.members.find((m) => m.socketId === socketId)!;
    const warnings = [
      a.engines.some((e) => e.fire) ? "ENGINE WARNING" : "",
      a.hydraulicFault ? "HYDRAULIC PRESSURE" : "",
      a.electricalFault ? "ALTITUDE HOLD OFFLINE" : "",
      a.speed < 150 ? "STALL · INCREASE THRUST" : "",
    ].filter(Boolean);
    return {
      version: PROTOCOL_VERSION,
      tick: room.tick,
      code: room.code,
      hostId: room.hostId,
      you: member.id,
      phase: room.phase,
      paused: this.paused(room),
      training: room.training,
      tutorialStage: room.tutorialStage,
      botAdvice: room.members.some((m) => m.bot && m.role === "engineer")
        ? engineerAdvice(a)
        : null,
      players: room.members.map(
        ({ id, name, role, ready, connected, bot }) => ({
          id,
          name,
          role,
          ready,
          connected,
          bot,
        }),
      ),
      flight: {
        crossTrack: a.crossTrack,
        goArounds: a.goArounds,
        altitude: a.altitude,
        speed: a.speed,
        heading: a.heading,
        integrity: a.integrity,
        distance: a.distance,
        verticalSpeed: a.verticalSpeed,
        bank: a.bank,
        elapsed: a.elapsed,
        landing: a.landing,
        gear: a.gear,
        warnings,
        ...(member.role === "pilot"
          ? {
              pilot: {
                throttle: a.throttle,
                targetAltitude: a.targetAltitude,
                targetHeading: a.targetHeading,
                commandedBank: a.commandedBank,
                commandedDescent: a.commandedDescent,
                rudder: a.rudder,
                autopilot: { ...a.autopilot },
              },
            }
          : {}),
        ...(member.role === "engineer"
          ? {
              engineer: {
                engines: a.engines.map((e) => ({
                  ...e,
                })) as Aircraft["engines"],
                hydraulicFault: a.hydraulicFault,
                electricalFault: a.electricalFault,
                fuel: a.fuel,
                throttle: a.throttle,
                oil: { tiles: [...a.oil.tiles] },
                rack: {
                  ...a.rack,
                  wiring: [...a.rack.wiring],
                  labels: [...a.rack.labels],
                },
              },
            }
          : {}),
      },
      log: room.log.map((entry) => ({ ...entry })),
      report: room.report,
    };
  }
}
