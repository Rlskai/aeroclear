// In-browser stand-in for the negotiation backend, so the UI can be built and demoed
// before the FastAPI service exists. Every value here is MOCK: the rows are not read
// from flights.csv and the agent messages are scripted, not model output.
// Flows follow demoflow.md: S1 happy path, S2 ground-driven, S3 low fuel
// (severe = 3b fallback to MDW then MKE; moderate = 3a agents recover).

import { GENESIS_HASH, hashEntry, verifyChain } from "../hash";
import type {
  Approval,
  BaselineTable,
  CheckResult,
  LogEntry,
  LowFuel,
  Proposal,
  RunEvent,
  Scenario,
  Suggestion,
  ViolationCode,
} from "../types";
import type { NegotiationApi, ScenarioFilter } from "./types";

const LIMITS = { max_turns: 3, wall_clock_s: 90, token_cap: 12000 };
const STEP_MS = 550;
const THINK_MS = 900;

const SCENARIOS: (Scenario & { airport: string })[] = [
  { airport: "ORD", row_id: 104233, airline: "AA", flight_number: "1544", origin: "LGA", destination: "ORD", scheduled_arrival: "17:15", weather_delay: 48, late_aircraft_delay: 35, distance: 733, wake_class: "Large" },
  { airport: "ORD", row_id: 210877, airline: "UA", flight_number: "612", origin: "SFO", destination: "ORD", scheduled_arrival: "18:40", weather_delay: 62, late_aircraft_delay: 41, distance: 1846, wake_class: "Heavy" },
  { airport: "ORD", row_id: 98410, airline: "UA", flight_number: "1907", origin: "DEN", destination: "ORD", scheduled_arrival: "16:05", weather_delay: 0, late_aircraft_delay: 57, distance: 888, wake_class: "Large" },
  { airport: "DFW", row_id: 156902, airline: "AA", flight_number: "2301", origin: "ATL", destination: "DFW", scheduled_arrival: "19:20", weather_delay: 0, late_aircraft_delay: 74, distance: 731, wake_class: "Large" },
  { airport: "DFW", row_id: 301118, airline: "AA", flight_number: "1108", origin: "MIA", destination: "DFW", scheduled_arrival: "14:50", weather_delay: 39, late_aircraft_delay: 26, distance: 1121, wake_class: "Large" },
  { airport: "ATL", row_id: 77345, airline: "DL", flight_number: "1180", origin: "MCO", destination: "ATL", scheduled_arrival: "15:35", weather_delay: 55, late_aircraft_delay: 28, distance: 404, wake_class: "Large" },
  { airport: "ATL", row_id: 248019, airline: "DL", flight_number: "2044", origin: "BOS", destination: "ATL", scheduled_arrival: "20:10", weather_delay: 0, late_aircraft_delay: 46, distance: 946, wake_class: "Large" },
];

/** Usable hold before the 30 min final reserve, by injection level. Normal = 45 - 30. */
const USABLE_HOLD: Record<LowFuel, number> = { off: 15, moderate: 10, severe: 5 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function addMinutes(hhmm: string, min: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = (h * 60 + m + min + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function shortId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

const ALL_PASS: CheckResult = {
  passed: true,
  checks: ["Wake separation", "Runway throughput", "Fuel", "Gate", "Crew duty"].map((name) => ({ name, passed: true })),
};

function failCheck(name: string, detail: string): CheckResult {
  return { passed: false, checks: ALL_PASS.checks.map((c) => (c.name === name ? { name, passed: false, detail } : c)) };
}

class MockRun {
  events: RunEvent[] = [];
  entries: LogEntry[] = [];
  listeners = new Set<(e: RunEvent) => void>();
  suggestions: Suggestion[] = [];
  approvals = new Map<number, Approval[]>();
  tampered: { seq: number; original: LogEntry } | null = null;
  private appendQueue: Promise<unknown> = Promise.resolve();
  private phaseStart = 0;
  private tokens = 0;
  private phase = 1;
  private usable: number;

  constructor(
    readonly sc: Scenario & { airport: string },
    readonly lowFuel: LowFuel,
  ) {
    this.usable = USABLE_HOLD.off;
  }

  emit(e: RunEvent) {
    this.events.push(e);
    this.listeners.forEach((l) => l(e));
  }

  private append(partial: Omit<LogEntry, "seq" | "msg_id" | "ts" | "prev_hash" | "hash">) {
    const p = this.appendQueue.then(async () => {
      const body = {
        ...partial,
        seq: this.entries.length,
        msg_id: crypto.randomUUID(),
        ts: new Date().toISOString(),
        prev_hash: this.entries.at(-1)?.hash ?? GENESIS_HASH,
      };
      const entry: LogEntry = { ...body, hash: await hashEntry(body) };
      this.entries.push(entry);
      this.emit({ kind: "entry", entry });
      return entry;
    });
    this.appendQueue = p;
    return p;
  }

  private async say(
    turn: number | null,
    sender: LogEntry["sender"],
    type: LogEntry["type"],
    rationale: string,
    extra: Partial<LogEntry> = {},
  ) {
    const agent = sender === "ATC" || sender === "PILOT" || sender === "GROUND";
    if (agent) {
      this.emit({ kind: "thinking", role: sender });
      await sleep(THINK_MS);
      this.tokens += 320 + Math.floor(Math.random() * 160);
    } else {
      await sleep(STEP_MS);
    }
    await this.append({ phase: this.phase, turn, sender, type, rationale, ...extra });
    this.emit({
      kind: "meter",
      phase: this.phase,
      wall_s: Math.round((performance.now() - this.phaseStart) / 1000),
      tokens: this.tokens,
    });
  }

  private proposal(runway: number, gate: number, delay: number, alt?: { code: string; source: string }): Proposal {
    const a = alt?.code ?? this.sc.airport;
    const p: Proposal = {
      proposal_id: shortId(),
      runway: { value: `RWY-${runway}`, source: `constraints.xlsx:airport_capacity:${a}:active_runways (id SYNTHETIC:generated_id)` },
      gate: { value: `G-${String(gate).padStart(3, "0")}`, source: `constraints.xlsx:airport_capacity:${a}:gates (id SYNTHETIC:generated_id)` },
      eta: { value: addMinutes(this.sc.scheduled_arrival, delay), source: `flights.csv:SCHEDULED_ARRIVAL:row${this.sc.row_id} + delay` },
      delay_min: { value: delay, source: `flights.csv:WEATHER_DELAY,LATE_AIRCRAFT_DELAY:row${this.sc.row_id}` },
    };
    if (alt) p.airport = { value: alt.code, source: alt.source };
    return p;
  }

  private describe(p: Proposal) {
    return `${p.airport ? `divert to ${p.airport.value}, ` : ""}runway ${p.runway.value}, gate ${p.gate.value}, ETA ${p.eta.value}, delay ${p.delay_min.value} min`;
  }

  private async propose(turn: number, p: Proposal, rationale: string) {
    await this.say(turn, "ATC", "PROPOSE", `Proposal ${p.proposal_id}: ${this.describe(p)}. ${rationale}`, {
      proposal: p,
      score: { value: 70 + Math.floor(Math.random() * 15), floor: 50 },
      sources: [p.runway.source, p.gate.source, p.eta.source],
    });
  }

  private async check(turn: number | null, result: CheckResult, violated?: ViolationCode) {
    const failed = result.checks.filter((c) => !c.passed);
    const text = failed.length
      ? `FAIL ${failed.map((c) => `${c.name}: ${c.detail}`).join("; ")}. Proposal auto-rejected; violation passed back to ATC.`
      : "Wake separation, throughput, fuel, gate, crew duty: all pass.";
    await this.say(turn, "CHECKER", "CHECK_RESULT", text, { check: result, violated_constraint: violated ?? null });
  }

  private baseDelay() {
    return this.sc.weather_delay + this.sc.late_aircraft_delay;
  }

  private kg(holdMin: number | null) {
    return holdMin == null ? null : Math.round(holdMin * ((this.sc.wake_class === "Heavy" ? 6500 : 2400) / 60));
  }

  async start() {
    const s = this.sc;
    this.emit({ kind: "phase_start", phase: 1, limits: LIMITS });
    this.phaseStart = performance.now();
    await this.say(null, "SYSTEM", "INFO_RESPONSE",
      `Disruption injected from flights.csv row ${s.row_id}: ${s.airline}${s.flight_number} ${s.origin}→${s.destination}. ` +
        `Weather ${s.weather_delay} min, late aircraft ${s.late_aircraft_delay} min.` +
        (s.weather_delay ? ` ${s.airport} arrival rate cut 90 → 45 ops/h (ASSUMPTION:weather_factor).` : ""),
      { sources: [`flights.csv:WEATHER_DELAY:row${s.row_id}`, `flights.csv:LATE_AIRCRAFT_DELAY:row${s.row_id}`, `constraints.xlsx:airport_capacity:${s.airport}:max_runway_ops_per_hour`] });
    await this.say(null, "PILOT", "ARRIVAL_REQUEST",
      `Requesting arrival. Wake class ${s.wake_class} (ASSUMPTION:aircraft_class). Usable hold 15 min before final reserve. 14 connecting pax (SYNTHETIC).`,
      { sources: ["constraints.xlsx:fuel_and_crew:Assumed spare fuel on arrival", "constraints.xlsx:fuel_and_crew:Final fuel reserve"] });
    await this.say(null, "ATC", "INFO_REQUEST", "Requesting gate availability and ground crew status for the arrival window.");
    await this.say(null, "GROUND", "INFO_RESPONSE",
      `Planned gate occupied by late inbound for ${s.late_aircraft_delay} min. Spare gates available (constraints.xlsx:airport_capacity:${s.airport}:spare_gates). Ground shift ends 21:00.`,
      { sources: [`constraints.xlsx:airport_capacity:${s.airport}:spare_gates`, "constraints.xlsx:fuel_and_crew:Ground crew shift"] });

    if (this.lowFuel === "severe") await this.severeFuelPhase();
    else if (this.lowFuel === "moderate") await this.moderateFuelPhase();
    else if (s.weather_delay === 0) await this.groundDrivenPhase();
    else await this.happyPhase();
  }

  // S1: Pilot soft objection in turn 1, consensus in turn 2.
  private async happyPhase() {
    const d = Math.round(this.baseDelay() * 0.55);
    this.emit({ kind: "turn_start", phase: 1, turn: 1, candidates: 42 });
    const p1 = this.proposal(2, 73, d + 6);
    await this.propose(1, p1, "Slot inside the 50% weather rate (ASSUMPTION:weather_factor).");
    await this.check(1, ALL_PASS);
    await this.say(1, "PILOT", "REJECT", "Projected hold 14 min: inside usable 15 min but Pilot score 52 below floor 60 (3 connections at risk).",
      { score: { value: 52, floor: 60 }, sources: ["SYNTHETIC:connections"] });
    await this.say(1, "GROUND", "ACCEPT", `${p1.gate.value} free for the occupancy window. Ground score 71 at or above floor 55.`, { score: { value: 71, floor: 55 } });

    this.emit({ kind: "turn_start", phase: 1, turn: 2, candidates: 31, note: "F shrunk: 42 → 31 (Pilot floor 60 now a standing constraint)" });
    const p2 = this.proposal(2, 73, d);
    await this.propose(2, p2, "6 min earlier slot resolves the Pilot objection; gate unchanged so Ground score holds.");
    await this.check(2, ALL_PASS);
    await this.say(2, "PILOT", "ACCEPT", "Hold 8 min. Pilot score 68 at or above floor 60.", { score: { value: 68, floor: 60 } });
    await this.say(2, "GROUND", "ACCEPT", "Same gate, change notice at least 20 min. Ground score 71.", { score: { value: 71, floor: 55 }, sources: ["constraints.xlsx:fuel_and_crew:Gate change notice"] });
    await this.consensus(p2);
  }

  // S2: Ground's GATE_OVERLAP reject changes the gate; consensus in turn 2.
  private async groundDrivenPhase() {
    const d = Math.round(this.baseDelay() * 0.6);
    this.emit({ kind: "turn_start", phase: 1, turn: 1, candidates: 18 });
    const p1 = this.proposal(1, 12, d);
    await this.propose(1, p1, "Earliest slot; keeps planned gate.");
    await this.check(1, ALL_PASS);
    await this.say(1, "PILOT", "ACCEPT", "Hold 6 min. Pilot score 81 at or above floor 60.", { score: { value: 81, floor: 60 } });
    await this.say(1, "GROUND", "REJECT",
      `GATE_OVERLAP: ${p1.gate.value} held by late inbound until ${addMinutes(this.sc.scheduled_arrival, this.sc.late_aircraft_delay)}, inside min turnaround. All 3 spare gates committed. Counter: G-044 frees at ${addMinutes(this.sc.scheduled_arrival, d + 3)}. Ground score 30 below floor 55.`,
      { violated_constraint: "GATE_OVERLAP", score: { value: 30, floor: 55 }, sources: [`flights.csv:LATE_AIRCRAFT_DELAY:row${this.sc.row_id}`, `constraints.xlsx:airport_capacity:${this.sc.airport}:min_turnaround_min`, `constraints.xlsx:airport_capacity:${this.sc.airport}:spare_gates`] });

    this.emit({ kind: "turn_start", phase: 1, turn: 2, candidates: 11, note: `F shrunk: 18 → 11 (${p1.gate.value} removed)` });
    const p2 = this.proposal(1, 44, d + 4);
    await this.propose(2, p2, "Moves to G-044 per Ground's counter; 4 min later slot to match gate release.");
    await this.check(2, ALL_PASS);
    await this.say(2, "PILOT", "ACCEPT", "Hold 10 min within usable 15 min. Pilot score 72.", { score: { value: 72, floor: 60 } });
    await this.say(2, "GROUND", "ACCEPT", "Gate free, on-shift crew, change notice 25 min (≥ 20). Ground score 66.",
      { score: { value: 66, floor: 55 }, sources: ["constraints.xlsx:fuel_and_crew:Gate change notice"] });
    await this.consensus(p2);
  }

  private async fuelUpdate() {
    this.usable = USABLE_HOLD[this.lowFuel];
    await this.say(1, "SYSTEM", "INFO_RESPONSE",
      `Fuel-state update for ${this.sc.airline}${this.sc.flight_number}: usable hold now ${this.usable} min before final reserve (was 15). Applied after F was built.`,
      { sources: ["SYNTHETIC:injected_low_fuel", "constraints.xlsx:fuel_and_crew:Final fuel reserve"] });
  }

  // S3 / 3a: checker blocks, agents recover with a fuel-priority slot.
  private async moderateFuelPhase() {
    const d = Math.round(this.baseDelay() * 0.55);
    this.emit({ kind: "turn_start", phase: 1, turn: 1, candidates: 42 });
    await this.fuelUpdate();
    const p1 = this.proposal(2, 73, d);
    await this.propose(1, p1, "Slot inside the 50% weather rate.");
    await this.check(1, failCheck("Fuel", `hold 11 min exceeds usable ${this.usable} min before final reserve`), "FUEL_RESERVE");
    await this.say(1, "PILOT", "REJECT", `FUEL_RESERVE: projected hold 11 min > usable ${this.usable} min. Requesting priority slot.`, { violated_constraint: "FUEL_RESERVE", score: { value: 0, floor: 60 } });
    await this.say(1, "GROUND", "ACCEPT", "Gate free for this window.", { score: { value: 70, floor: 55 } });

    this.emit({ kind: "turn_start", phase: 1, turn: 2, candidates: 9, note: `F shrunk: 42 → 9 (slots with hold > ${this.usable} min removed)` });
    const p2 = this.proposal(2, 91, d - 5);
    await this.propose(2, p2, "Fuel-priority slot, ahead of 2 scheduled arrivals; spare gate G-091 ready earlier.");
    await this.check(2, ALL_PASS);
    await this.say(2, "PILOT", "ACCEPT", "Hold 6 min. Above final reserve.", { score: { value: 64, floor: 60 } });
    await this.say(2, "GROUND", "ACCEPT", "Spare gate free, crew on shift.", { score: { value: 62, floor: 55 } });
    await this.consensus(p2);
  }

  private mdw = { code: "MDW", source: "airports.csv:LATITUDE,LONGITUDE (nearest to ORD) · constraints.xlsx:airport_capacity:MDW" };
  private mke = { code: "MKE", source: "airports.csv:LATITUDE,LONGITUDE (next-nearest outside weather radius) · constraints.xlsx:airport_capacity:MKE" };

  // S3 / 3b: checker blocks, infeasibility → fallback divert to MDW.
  private async severeFuelPhase() {
    const d = Math.round(this.baseDelay() * 0.55);
    this.emit({ kind: "turn_start", phase: 1, turn: 1, candidates: 42 });
    await this.fuelUpdate();
    const p1 = this.proposal(2, 73, d);
    await this.propose(1, p1, "Slot inside the 50% weather rate.");
    await this.check(1, failCheck("Fuel", `hold 11 min exceeds usable ${this.usable} min before final reserve`), "FUEL_RESERVE");
    await this.say(1, "PILOT", "REJECT", `FUEL_RESERVE: projected hold 11 min > usable ${this.usable} min. Cannot accept any ORD hold above ${this.usable} min.`,
      { violated_constraint: "FUEL_RESERVE", score: { value: 0, floor: 60 } });
    await this.say(1, "GROUND", "ACCEPT", "Gate free for this window.", { score: { value: 70, floor: 55 } });

    const fb = this.proposal(1, 7, 22, this.mdw);
    await this.say(null, "SYSTEM", "FALLBACK",
      `INFEASIBLE_NO_SAFE_SLOT: earliest fuel-priority ORD slot still needs 9 min hold > usable ${this.usable} min. ` +
        `Deterministic fallback: divert en route to nearest alternate MDW (17 mi from ORD; track from ${this.sc.origin} no longer, fuel at landing above final reserve) → ${this.describe(fb)}.`,
      { proposal: fb, sources: [this.mdw.source, "constraints.xlsx:fuel_and_crew:Final fuel reserve"] });
    await this.check(null, ALL_PASS);
    this.suggest({ index: 1, path: "FALLBACK", fallback_reason: "INFEASIBLE_NO_SAFE_SLOT", proposal: fb, violations: 0 });
  }

  // S3 / 3b phase 2: MDW rejected → next-nearest alternate outside the weather radius.
  private async divertPhaseTwo() {
    this.emit({ kind: "turn_start", phase: 2, turn: 1, candidates: 0, note: "F at ORD: 0 safe slots · alternates outside 50 mi: MKE" });
    const fb = this.proposal(1, 18, 31, this.mke);
    await this.say(1, "SYSTEM", "FALLBACK",
      `INFEASIBLE_NO_SAFE_SLOT (ORD unchanged). MDW on the rejected list and inside the 50 mi weather radius (ASSUMPTION:shared_weather_radius). ` +
        `Next-nearest qualifying alternate: MKE, about 67 mi from ORD; extra track from ${this.sc.origin} about 5 mi, within usable ${this.usable} min → ${this.describe(fb)}.`,
      { proposal: fb, sources: [this.mke.source, "ASSUMPTION:shared_weather_radius"] });
    await this.check(1, ALL_PASS);
    this.suggest({ index: 2, path: "FALLBACK", fallback_reason: "INFEASIBLE_NO_SAFE_SLOT", proposal: fb, violations: 0 });
  }

  private async consensus(p: Proposal) {
    await this.say(null, "SYSTEM", "CONSENSUS",
      `All three accepted proposal ${p.proposal_id} and the checker passed. Suggestion ${this.phase} sent to the three humans.`, { proposal: p });
    this.suggest({ index: this.phase as 1 | 2, path: "AGENT_CONSENSUS", proposal: p, violations: 0 });
  }

  private suggest(s: Suggestion) {
    this.suggestions.push(s);
    this.emit({ kind: "suggestion", suggestion: s });
    this.emit({ kind: "baseline", table: this.baseline() });
  }

  private baseline(final?: Proposal): BaselineTable {
    const base = this.baseDelay();
    if (this.lowFuel === "severe") {
      // Diversions hold 0 min; do-nothing holds at ORD past the usable fuel.
      const hold = 26;
      const cols: BaselineTable["columns"] = [{ key: "nothing", label: "Do nothing (hold at ORD)" }];
      const delay: Record<string, number | null> = { nothing: base };
      const holding: Record<string, number | null> = { nothing: hold };
      const viol: Record<string, number | null> = { nothing: 1 };
      this.suggestions.forEach((s) => {
        const k = `s${s.index}`;
        cols.push({ key: k, label: `S${s.index} ${s.proposal.airport?.value ?? s.proposal.runway.value}` });
        delay[k] = s.proposal.delay_min.value;
        holding[k] = 0;
        viol[k] = 0;
      });
      if (final) {
        cols.push({ key: "final", label: `Final call (${final.airport?.value ?? "ORD"})`, highlight: true });
        delay.final = final.delay_min.value;
        holding.final = 0;
        viol.final = 0;
      }
      const fuel = Object.fromEntries(Object.entries(holding).map(([k, v]) => [k, this.kg(v)]));
      return {
        columns: cols,
        rows: [
          { metric: "Total delay (min)", values: delay },
          { metric: "Holding (min)", values: holding },
          { metric: "Est. holding fuel (kg)", values: fuel },
          { metric: "Violations", values: viol },
        ],
      };
    }
    const neg = final ?? this.suggestions.at(-1)?.proposal;
    const fbDelay = Math.round(base * 0.7);
    const holdNothing = Math.min(45, this.sc.weather_delay || 20);
    const v = (n: number | null, f: number | null, g: number | null) => ({ nothing: n, fallback: f, negotiated: g });
    return {
      columns: [
        { key: "nothing", label: "Do nothing" },
        { key: "fallback", label: "Fallback" },
        { key: "negotiated", label: final ? "Negotiated (final)" : "Negotiated", highlight: true },
      ],
      rows: [
        { metric: "Total delay (min)", values: v(base, fbDelay, neg?.delay_min.value ?? null) },
        { metric: "Holding (min)", values: v(holdNothing, 14, 8) },
        { metric: "Est. holding fuel (kg)", values: v(this.kg(holdNothing), this.kg(14), this.kg(8)) },
        { metric: "Violations", values: v(holdNothing > this.usable ? 1 : 0, 0, 0) },
      ],
    };
  }

  private finish(p: Proposal, decided_by: "HUMAN_APPROVED" | "HUMAN_CALL") {
    this.emit({ kind: "baseline", table: this.baseline(p) });
    this.emit({ kind: "final", proposal: p, decided_by });
  }

  async approve(index: number, a: Approval) {
    const list = this.approvals.get(index) ?? [];
    if (list.some((x) => x.role === a.role)) return;
    list.push(a);
    this.approvals.set(index, list);
    await this.append({
      phase: this.phase, turn: null, sender: "HUMAN",
      type: a.decision === "APPROVE" ? "HUMAN_APPROVE" : "HUMAN_REJECT",
      rationale: `${a.role} human ${a.decision === "APPROVE" ? "approved" : "rejected"} Suggestion ${index}${a.reason ? `: ${a.reason}` : "."}`,
    });
    this.emit({ kind: "approval", suggestion_index: index, approval: a });
    if (list.length < 3) return;

    const rejects = list.filter((x) => x.decision === "REJECT");
    const s = this.suggestions[index - 1];
    if (!rejects.length) {
      this.finish(s.proposal, "HUMAN_APPROVED");
    } else if (index === 1) {
      await this.phaseTwo(rejects);
    } else {
      this.emit({ kind: "awaiting_human_call", options: this.suggestions });
    }
  }

  private async phaseTwo(rejects: Approval[]) {
    this.phase = 2;
    this.tokens = 0;
    const prev = this.suggestions[0].proposal;
    const constraints = [
      ...rejects.map((r) => `${r.role}: "${r.reason}"`),
      `Suggestion 1 (${prev.airport ? `${prev.airport.value} ` : ""}${prev.proposal_id}) on the rejected list`,
    ];
    if (this.lowFuel === "severe") constraints.splice(-1, 0, "Alternate must be outside the 50 mi weather radius (ASSUMPTION:shared_weather_radius)");
    this.emit({ kind: "phase_start", phase: 2, limits: LIMITS, constraints_added: constraints });
    this.phaseStart = performance.now();
    await this.say(null, "SYSTEM", "INFO_RESPONSE", `Human rejection added as standing constraints: ${constraints.join("; ")}.`);
    if (this.lowFuel === "severe") return this.divertPhaseTwo();

    this.emit({ kind: "turn_start", phase: 2, turn: 1, candidates: 7, note: "F after human constraints: 7" });
    const p = this.proposal(1, 56, prev.delay_min.value + 6);
    await this.propose(1, p, "Addresses the human objections; 6 min later slot.");
    await this.check(1, ALL_PASS);
    await this.say(1, "PILOT", "ACCEPT", "Hold within usable limit.", { score: { value: 63, floor: 60 } });
    await this.say(1, "GROUND", "ACCEPT", "Gate free, crew on shift.", { score: { value: 60, floor: 55 } });
    await this.consensus(p);
  }

  async humanCall(chosen: number, note: string) {
    const s = this.suggestions[chosen - 1];
    await this.append({
      phase: this.phase, turn: null, sender: "HUMAN", type: "HUMAN_CALL_DECISION",
      rationale: `Human call decided Suggestion ${chosen} (${s.proposal.airport ? `${s.proposal.airport.value}, ` : ""}${s.proposal.proposal_id}). ${note}`, proposal: s.proposal,
    });
    this.finish(s.proposal, "HUMAN_CALL");
  }

  tamper() {
    if (this.tampered) return;
    const i = this.entries.findIndex((x) => x.type === "PROPOSE" && x.proposal);
    if (i < 0) return;
    const e = this.entries[i];
    this.tampered = { seq: i, original: e };
    // Replace (not mutate) so the UI's copy of the entry stays as it was shown.
    this.entries[i] = { ...e, proposal: { ...e.proposal!, delay_min: { ...e.proposal!.delay_min, value: e.proposal!.delay_min.value - 10 } } };
  }

  untamper() {
    if (!this.tampered) return;
    this.entries[this.tampered.seq] = this.tampered.original;
    this.tampered = null;
  }
}

export function createMockApi(): NegotiationApi {
  const runs = new Map<string, MockRun>();
  const get = (id: string) => {
    const r = runs.get(id);
    if (!r) throw new Error(`Unknown run ${id}`);
    return r;
  };

  return {
    mode: "mock",
    async listScenarios(f: ScenarioFilter) {
      return SCENARIOS.filter(
        (s) => s.airport === f.airport && (f.delayType === "late_only" ? s.weather_delay === 0 : s.weather_delay > 15),
      );
    },
    async startRun(rowId, lowFuel) {
      const sc = SCENARIOS.find((s) => s.row_id === rowId);
      if (!sc) throw new Error(`Unknown row ${rowId}`);
      const id = shortId();
      const run = new MockRun(sc, lowFuel);
      runs.set(id, run);
      void run.start();
      return id;
    },
    subscribe(runId, onEvent) {
      const r = get(runId);
      r.events.forEach(onEvent);
      r.listeners.add(onEvent);
      return () => r.listeners.delete(onEvent);
    },
    approve: async (runId, i, a) => get(runId).approve(i, a),
    humanCall: async (runId, i, note) => get(runId).humanCall(i, note),
    getLog: async (runId) => get(runId).entries,
    verify: async (runId) => verifyChain(get(runId).entries),
    tamper: async (runId) => get(runId).tamper(),
    untamper: async (runId) => get(runId).untamper(),
  };
}
