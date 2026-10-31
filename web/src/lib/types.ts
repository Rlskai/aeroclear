// Shared contract between the web view and the negotiation backend.
// Mirrors PRD-2 section 9 (message schema) and section 13 (log entries).

export type Role = "ATC" | "PILOT" | "GROUND";
export type Sender = Role | "CHECKER" | "SYSTEM" | "HUMAN";

export type MessageType =
  | "ARRIVAL_REQUEST"
  | "INFO_REQUEST"
  | "INFO_RESPONSE"
  | "PROPOSE"
  | "ACCEPT"
  | "REJECT"
  | "CHECK_RESULT"
  | "CONSENSUS"
  | "FALLBACK"
  | "HUMAN_APPROVE"
  | "HUMAN_REJECT"
  | "HUMAN_CALL_DECISION";

export type ViolationCode =
  | "FUEL_RESERVE"
  | "WAKE_SEP"
  | "GATE_OVERLAP"
  | "CREW_DUTY"
  | "RUNWAY_THROUGHPUT"
  | "NO_VALID_RESPONSE";

/** A value plus where it came from: flights.csv:…, constraints.xlsx:…, ASSUMPTION:…, SYNTHETIC:… */
export interface Sourced<T> {
  value: T;
  source: string;
}

export interface Proposal {
  proposal_id: string;
  runway: Sourced<string>;
  gate: Sourced<string>;
  eta: Sourced<string>;
  delay_min: Sourced<number>;
}

export interface CheckResult {
  passed: boolean;
  checks: { name: string; passed: boolean; detail?: string }[];
}

export interface LogEntry {
  seq: number;
  msg_id: string;
  phase: number;
  turn: number | null;
  sender: Sender;
  type: MessageType;
  proposal?: Proposal | null;
  check?: CheckResult | null;
  violated_constraint?: ViolationCode | null;
  rationale: string;
  sources?: string[];
  ts: string;
  prev_hash: string;
  hash: string;
}

export type PlanPath = "AGENT_CONSENSUS" | "FALLBACK";

export type FallbackReason =
  | "NO_CONSENSUS_AFTER_3_TURNS"
  | "WALL_CLOCK_CAP"
  | "TOKEN_BUDGET"
  | "NO_PROGRESS"
  | "STALEMATE"
  | "INFEASIBLE"
  | "API_FAILURE";

export interface Suggestion {
  index: 1 | 2;
  path: PlanPath;
  fallback_reason?: FallbackReason;
  proposal: Proposal;
  violations: number;
  note?: string;
}

export interface Approval {
  role: Role;
  decision: "APPROVE" | "REJECT";
  reason?: string;
}

export interface BaselineRow {
  metric: string;
  do_nothing: number | null;
  fallback: number | null;
  negotiated: number | null;
  /** lower is better for every metric we show */
}

export interface Scenario {
  row_id: number;
  airline: string;
  flight_number: string;
  origin: string;
  destination: string;
  scheduled_arrival: string;
  weather_delay: number;
  late_aircraft_delay: number;
  distance: number;
  wake_class: "Heavy" | "Large";
}

export interface Limits {
  max_turns: number;
  wall_clock_s: number;
  token_cap: number;
}

/** Events pushed over the run stream (SSE in the real backend). */
export type RunEvent =
  | { kind: "phase_start"; phase: number; limits: Limits }
  | { kind: "turn_start"; phase: number; turn: number; candidates: number; note?: string }
  | { kind: "entry"; entry: LogEntry }
  | { kind: "meter"; phase: number; wall_s: number; tokens: number }
  | { kind: "suggestion"; suggestion: Suggestion }
  | { kind: "approval"; suggestion_index: number; approval: Approval }
  | { kind: "baseline"; rows: BaselineRow[] }
  | { kind: "awaiting_human_call"; options: Suggestion[] }
  | { kind: "final"; proposal: Proposal; decided_by: "HUMAN_APPROVED" | "HUMAN_CALL" }
  | { kind: "error"; message: string };

export interface VerifyResult {
  ok: boolean;
  entries: number;
  first_bad_seq?: number;
}
