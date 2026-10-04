import { z } from "zod";

export const PROTOCOL_VERSION = 4;
export const MAX_PLAYERS = 8;
export const TICK_RATE = 20;
export const SNAPSHOT_RATE = 10;
export const RECONNECT_MS = 60_000;
export const roleSchema = z.enum(["pilot", "engineer", "observer"]);
export type Role = z.infer<typeof roleSchema>;
export type Phase = "lobby" | "flying" | "landed" | "crashed";
export const commandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("rudder"),
      value: z.number().finite().min(-1).max(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("mcp"),
      action: z.enum([
        "autopilot",
        "flightDirector",
        "autoThrottle",
        "heading",
        "altitudeHold",
        "verticalSpeed",
        "levelChange",
        "localizer",
        "approach",
        "disconnect",
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("selectedSpeed"),
      value: z.number().finite().min(150).max(280),
    })
    .strict(),
  z
    .object({
      type: z.literal("selectedVs"),
      value: z.number().finite().min(-1800).max(1500),
    })
    .strict(),
  z
    .object({
      type: z.literal("throttle"),
      value: z.number().finite().min(0).max(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("altitude"),
      value: z.number().finite().min(500).max(6000),
    })
    .strict(),
  z
    .object({
      type: z.literal("heading"),
      value: z.number().finite().min(0).max(359),
    })
    .strict(),
  z.object({ type: z.literal("gear"), down: z.boolean() }).strict(),
  z.object({ type: z.literal("land") }).strict(),
  z
    .object({
      type: z.literal("bank"),
      value: z.number().finite().min(-25).max(25),
    })
    .strict(),
  z
    .object({
      type: z.literal("descent"),
      value: z.number().finite().min(-1800).max(600),
    })
    .strict(),
  z.object({ type: z.literal("goAround") }).strict(),
  z
    .object({ type: z.literal("pipe"), tile: z.number().int().min(0).max(15) })
    .strict(),
  z.object({ type: z.literal("rackPower") }).strict(),
  z
    .object({
      type: z.literal("rackRemove"),
      slot: z.number().int().min(0).max(2),
    })
    .strict(),
  z.object({ type: z.literal("rackInstall") }).strict(),
  z
    .object({
      type: z.literal("wire"),
      cable: z.number().int().min(0).max(2),
      port: z.number().int().min(-1).max(2),
    })
    .strict(),
  z
    .object({
      type: z.literal("fuel"),
      engine: z.union([z.literal(0), z.literal(1)]),
      open: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("extinguish"),
      engine: z.union([z.literal(0), z.literal(1)]),
    })
    .strict(),
  z.object({ type: z.literal("hydraulics") }).strict(),
  z.object({ type: z.literal("electrical") }).strict(),
  z
    .object({
      type: z.literal("callout"),
      message: z.enum([
        "Check your station",
        "Reduce thrust",
        "Systems stable",
        "Ready for approach",
      ]),
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const requestSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("create"),
      name: z.string().trim().min(1).max(20),
    })
    .strict(),
  z
    .object({
      type: z.literal("join"),
      name: z.string().trim().min(1).max(20),
      code: z.string().regex(/^[A-Z2-9]{5}$/),
    })
    .strict(),
  z
    .object({
      type: z.literal("resume"),
      code: z.string().length(5),
      token: z.string().uuid(),
    })
    .strict(),
  z.object({ type: z.literal("role"), role: roleSchema }).strict(),
  z.object({ type: z.literal("ready"), ready: z.boolean() }).strict(),
  z
    .object({
      type: z.literal("bot"),
      role: z.enum(["pilot", "engineer"]),
      enabled: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal("training"), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal("start") }).strict(),
  z.object({ type: z.literal("restart") }).strict(),
  z.object({ type: z.literal("leave") }).strict(),
  z
    .object({
      type: z.literal("command"),
      sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      command: commandSchema,
    })
    .strict(),
]);
export type Request = z.infer<typeof requestSchema>;
export interface Player {
  id: string;
  name: string;
  role: Role;
  ready: boolean;
  connected: boolean;
  bot: boolean;
}
export type TutorialStage =
  | "setup"
  | "fire"
  | "hydraulics"
  | "electrical"
  | "approach"
  | "landing";
export interface EngineState {
  fire: boolean;
  fuelOpen: boolean;
  bottle: boolean;
  temperature: number;
}
export interface Aircraft {
  autopilot: AutopilotState;
  crossTrack: number;
  commandedBank: number;
  commandedDescent: number;
  rudder: number;
  rudderTime: number;
  goArounds: number;
  oil: OilPuzzle;
  rack: RackPuzzle;
  altitude: number;
  speed: number;
  heading: number;
  targetAltitude: number;
  targetHeading: number;
  throttle: number;
  gear: boolean;
  integrity: number;
  fuel: number;
  distance: number;
  verticalSpeed: number;
  bank: number;
  elapsed: number;
  landing: number | null;
  engines: [EngineState, EngineState];
  hydraulicFault: boolean;
  electricalFault: boolean;
  resolved: number;
}
export interface AutopilotState {
  engaged: boolean;
  flightDirector: boolean;
  autoThrottle: boolean;
  selectedSpeed: number;
  selectedVs: number;
  holdAltitude: number;
  lateral: "heading" | "localizer";
  vertical: "altitude" | "verticalSpeed" | "levelChange" | "glideslope";
  localizerCaptured: boolean;
  approach: "off" | "armed" | "captured";
  disconnectReason: "pilot" | "systems" | "minimums" | null;
}
export interface OilPuzzle {
  tiles: number[];
}
export interface RackPuzzle {
  faultySlot: number;
  stage: "powered" | "isolated" | "removed" | "installed" | "online";
  wiring: number[];
  /** Connector labels are the engineer's visible service diagram. */
  labels: number[];
}
export interface LogEntry {
  id: number;
  time: number;
  text: string;
  severity: "info" | "warning" | "success";
}
export interface FlightView {
  crossTrack: number;
  goArounds: number;
  altitude: number;
  speed: number;
  heading: number;
  integrity: number;
  distance: number;
  verticalSpeed: number;
  bank: number;
  elapsed: number;
  landing: number | null;
  gear: boolean;
  warnings: string[];
  pilot?: Pick<
    Aircraft,
    | "throttle"
    | "targetAltitude"
    | "targetHeading"
    | "commandedBank"
    | "commandedDescent"
    | "rudder"
    | "autopilot"
  >;
  engineer?: Pick<
    Aircraft,
    | "engines"
    | "hydraulicFault"
    | "electricalFault"
    | "fuel"
    | "oil"
    | "rack"
    | "throttle"
  >;
}
export interface FlightReport {
  success: boolean;
  reason: string;
  score: number;
  integrity: number;
  duration: number;
  resolved: number;
}
export interface Snapshot {
  version: typeof PROTOCOL_VERSION;
  tick: number;
  code: string;
  hostId: string;
  you: string;
  phase: Phase;
  paused: boolean;
  training: boolean;
  tutorialStage: TutorialStage | null;
  botAdvice: string | null;
  players: Player[];
  flight: FlightView;
  log: LogEntry[];
  report: FlightReport | null;
}
export type Reply =
  | { ok: true; session?: { code: string; token: string; playerId: string } }
  | { ok: false; error: string };
export interface ClientEvents {
  request: (request: Request, reply: (reply: Reply) => void) => void;
}
export interface ServerEvents {
  snapshot: (snapshot: Snapshot) => void;
}
