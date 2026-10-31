// In-browser stand-in for the negotiation backend, so the UI can be built and demoed
// before the FastAPI service exists. Every value here is MOCK: the rows are not read
// from flights.csv and the agent messages are scripted, not model output.
// It follows the PRD-2 flow: 3-turn phases, checker before ACCEPT, fallback,
// three human approvals, one renegotiation, then a human call.

import { GENESIS_HASH, hashEntry, verifyChain } from "../hash";
import type {
  Approval,
  BaselineRow,
  CheckResult,
  LogEntry,
  Proposal,
  RunEvent,
  Scenario,
  Suggestion,
} from "../types";
import type { NegotiationApi, ScenarioFilter } from "./types";

const LIMITS = { max_turns: 3, wall_clock_s: 90, token_cap: 12000 };
const STEP_MS = 550;

const SCENARIOS: (Scenario & { airport: string })[] = [
  { airport: "ORD", row_id: 104233, airline: "AA", flight_number: "1544", origin: "LGA", destination: "ORD", scheduled_arrival: "17:15", weather_delay: 48, late_aircraft_delay: 35, distance: 733, wake_class: "Large" },
  { airport: "ORD", row_id: 210877, airline: "UA", flight_number: "612", origin: "SFO", destination: "ORD", scheduled_arrival: "18:40", weather_delay: 62, late_aircraft_delay: 41, distance: 1846, wake_class: "Heavy" },
  { airport: "ORD", row_id: 98410, airline: "UA", flight_number: "1907", origin: "DEN", destination: "ORD", scheduled_arrival: "16:05", weather_delay: 0, late_aircraft_delay: 57, distance: 888, wake_class: "Large" },
  { airport: "DFW", row_id: 156902, airline: "AA", flight_number: "2301", origin: "ATL", destination: "DFW", scheduled_arrival: "19:20", weather_delay: 0, late_aircraft_delay: 74, distance: 731, wake_class: "Large" },
  { airport: "DFW", row_id: 301118, airline: "AA", flight_number: "1108", origin: "MIA", destination: "DFW", scheduled_arrival: "14:50", weather_delay: 39, late_aircraft_delay: 26, distance: 1121, wake_class: "Large" },
  { airport: "ATL", row_id: 77345, airline: "DL", flight_number: "1180", origin: "MCO", destination: "ATL", scheduled_arrival: "15:35", weather_delay: 55, late_aircraft_delay: 28, distance: 404, wake_class: "Large" },
  { airport: "ATL", row_id: 248019, airline: "DL", flight_number: "2044", origin: "BOS", destination: "ATL", scheduled_arrival: "20:10", weather_delay: 0, late_aircraft_delay: 46, distance: 946, wake_class: "Large" },
];

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
  private appendQueue: Promise<unknown> = Promise.resolve();
  private phaseStart = 0;
  private tokens = 0;
  private phase = 1;

  constructor(
    readonly sc: Scenario & { airport: string },
    readonly lowFuel: boolean,
  ) {}

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
    await sleep(STEP_MS);
    if (sender === "ATC" || sender === "PILOT" || sender === "GROUND") this.tokens += 320 + Math.floor(Math.random() * 160);
    await this.append({ phase: this.phase, turn, sender, type, rationale, ...extra });
    this.emit({
      kind: "meter",
      phase: this.phase,
      wall_s: Math.round((performance.now() - this.phaseStart) / 1000),
      tokens: this.tokens,
    });
  }

  private proposal(runway: number, gate: number, delay: number): Proposal {
    const a = this.sc.airport;
    return {
      proposal_id: shortId(),
      runway: { value: `RWY-${runway}`, source: `constraints.xlsx:airport_capacity:${a}:active_runways (id SYNTHETIC:generated_id)` },
      gate: { value: `G-${String(gate).padStart(3, "0")}`, source: `constraints.xlsx:airport_capacity:${a}:gates (id SYNTHETIC:generated_id)` },
      eta: { value: addMinutes(this.sc.scheduled_arrival, delay), source: `flights.csv:SCHEDULED_ARRIVAL:row${this.sc.row_id} + delay` },
      delay_min: { value: delay, source: `flights.csv:WEATHER_DELAY,LATE_AIRCRAFT_DELAY:row${this.sc.row_id}` },
    };
  }

  private describe(p: Proposal) {
    return `runway ${p.runway.value}, gate ${p.gate.value}, ETA ${p.eta.value}, delay ${p.delay_min.value} min`;
  }

  private async propose(turn: number, p: Proposal, rationale: string) {
    await this.say(turn, "ATC", "PROPOSE", `Proposal ${p.proposal_id}: ${this.describe(p)}. ${rationale}`, {
      proposal: p,
      sources: [p.runway.source, p.gate.source],
    });
  }

  private async check(turn: number | null, result: CheckResult) {
    const failed = result.checks.filter((c) => !c.passed);
    const text = failed.length
      ? `FAIL ${failed.map((c) => `${c.name}: ${c.detail}`).join("; ")}. Proposal auto-rejected; violation passed back to ATC.`
      : "Wake separation, throughput, fuel, gate, crew duty: all pass.";
    await this.say(turn, "CHECKER", "CHECK_RESULT", text, { check: result });
  }

  private baseDelay() {
    return this.sc.weather_delay + this.sc.late_aircraft_delay;
  }

  private burnKgPerMin() {
    return (this.sc.wake_class === "Heavy" ? 6500 : 2400) / 60;
  }

  async start() {
    const s = this.sc;
    this.emit({ kind: "phase_start", phase: 1, limits: LIMITS });
    this.phaseStart = performance.now();
    await this.say(null, "SYSTEM", "INFO_RESPONSE",
      `Disruption injected from flights.csv row ${s.row_id}: ${s.airline}${s.flight_number} ${s.origin}→${s.destination}. ` +
        `Weather ${s.weather_delay} min, late aircraft ${s.late_aircraft_delay} min.` +
        (this.lowFuel ? " Injected low fuel: usable hold cut to 8 min (MOCK)." : ""),
      { sources: [`flights.csv:WEATHER_DELAY:row${s.row_id}`, `flights.csv:LATE_AIRCRAFT_DELAY:row${s.row_id}`] });
    await this.say(null, "PILOT", "ARRIVAL_REQUEST",
      `Requesting arrival. Wake class ${s.wake_class} (ASSUMPTION:aircraft_class). Usable hold ${this.lowFuel ? 8 : 15} min before final reserve. 14 connecting pax (SYNTHETIC).`);
    await this.say(null, "ATC", "INFO_REQUEST", "Requesting gate availability and ground crew status for the arrival window.");
    await this.say(null, "GROUND", "INFO_RESPONSE",
      `Planned gate occupied by late inbound for ${s.late_aircraft_delay} min. Spare gates available (constraints.xlsx:airport_capacity:${s.airport}:spare_gates_at_any_time). Ground shift ends 21:00.`);

    if (this.lowFuel) await this.lowFuelPhase();
    else if (s.weather_delay === 0) await this.groundDrivenPhase();
    else await this.happyPhase();
  }

  // Scenario 1: one Ground reject, consensus in turn 2.
  private async happyPhase() {
    const d = Math.round(this.baseDelay() * 0.55);
    this.emit({ kind: "turn_start", phase: 1, turn: 1, candidates: 42 });
    const p1 = this.proposal(2, 73, d);
    await this.propose(1, p1, "Slot inside the 50% weather rate (ASSUMPTION:weather_factor).");
    await this.check(1, ALL_PASS);
    await this.say(1, "PILOT", "ACCEPT", `Hold 11 min within usable 15 min. Pilot score 74 at or above floor 60.`);
    await this.say(1, "GROUND", "REJECT", `GATE_OVERLAP: ${p1.gate.value} occupied by late inbound until ${addMinutes(this.sc.scheduled_arrival, this.sc.late_aircraft_delay)}. Ground score 41 below floor 55.`,
      { violated_constraint: "GATE_OVERLAP", sources: [`flights.csv:LATE_AIRCRAFT_DELAY:row${this.sc.row_id}`] });

    this.emit({ kind: "turn_start", phase: 1, turn: 2, candidates: 31, note: `F shrunk: 42 → 31 (${p1.gate.value} removed)` });
    const p2 = this.proposal(2, 91, d);
    await this.propose(2, p2, "Resolves the Ground objection and scores at least as well for Ground.");
    await this.check(2, ALL_PASS);
    await this.say(2, "PILOT", "ACCEPT", "Same proposal hash. Fuel at landing above final reserve.");
    await this.say(2, "GROUND", "ACCEPT", "Gate free for the occupancy window, change notice at least 20 min.");
    await this.consensus(p2);
  }

  // Scenario 2: Ground's rejects steer the gate; consensus in turn 3.
  private async groundDrivenPhase() {
    const d = Math.round(this.baseDelay() * 0.6);
    this.emit({ kind: "turn_start", phase: 1, turn: 1, candidates: 18 });
    const p1 = this.proposal(1, 12, d);
    await this.propose(1, p1, "Earliest slot; keeps planned gate.");
    await this.check(1, ALL_PASS);
    await this.say(1, "PILOT", "ACCEPT", "Hold 6 min. Pilot score 81 at or above floor 60.");
    await this.say(1, "GROUND", "REJECT", `GATE_OVERLAP: ${p1.gate.value} held by late inbound (min turnaround from constraints.xlsx). Ground score 30 below floor 55.`, { violated_constraint: "GATE_OVERLAP" });

    this.emit({ kind: "turn_start", phase: 1, turn: 2, candidates: 11, note: `F shrunk: 18 → 11 (${p1.gate.value} removed)` });
    const p2 = this.proposal(1, 44, d);
    await this.propose(2, p2, "Moves to a spare gate.");
    await this.check(2, ALL_PASS);
    await this.say(2, "PILOT", "ACCEPT", "Same hash. No change to fuel state.");
    await this.say(2, "GROUND", "REJECT", `CREW_DUTY: ${p2.gate.value} needs a crew past 8 h shift; overtime cost 1.5x. Ground score 48 below floor 50 (floor relaxed by 5).`, { violated_constraint: "CREW_DUTY" });

    this.emit({ kind: "turn_start", phase: 1, turn: 3, candidates: 6, note: "F shrunk: 11 → 6 (overtime gates removed)" });
    const p3 = this.proposal(1, 38, d + 4);
    await this.propose(3, p3, "Gate served by on-shift crew; 4 min later slot.");
    await this.check(3, ALL_PASS);
    await this.say(3, "PILOT", "ACCEPT", "Hold 10 min within usable 15 min.");
    await this.say(3, "GROUND", "ACCEPT", "Gate free, crew within shift.");
    await this.consensus(p3);
  }

  // Scenario 3: checker blocks an unsafe plan, then stalemate → deterministic fallback.
  private async lowFuelPhase() {
    const d = Math.round(this.baseDelay() * 0.55);
    this.emit({ kind: "turn_start", phase: 1, turn: 1, candidates: 42 });
    const p1 = this.proposal(2, 73, d);
    await this.propose(1, p1, "Slot inside the 50% weather rate.");
    await this.check(1, failCheck("Fuel", "hold 14 min exceeds usable 8 min before final reserve"));
    await this.say(1, "PILOT", "REJECT", "FUEL_RESERVE: projected hold 14 min > usable 8 min. Requesting priority slot.", { violated_constraint: "FUEL_RESERVE" });
    await this.say(1, "GROUND", "ACCEPT", "Gate free for this window.");

    this.emit({ kind: "turn_start", phase: 1, turn: 2, candidates: 9, note: "F shrunk: 42 → 9 (slots with hold > 8 min removed)" });
    const p2 = this.proposal(2, 73, d - 9);
    await this.propose(2, p2, "Fuel-priority slot, ahead of 2 scheduled arrivals.");
    await this.check(2, ALL_PASS);
    await this.say(2, "PILOT", "ACCEPT", "Hold 5 min. Above final reserve.");
    await this.say(2, "GROUND", "REJECT", `GATE_OVERLAP: earlier ETA lands before ${p2.gate.value} is free. Ground score 38 below floor 50.`, { violated_constraint: "GATE_OVERLAP" });

    this.emit({ kind: "turn_start", phase: 1, turn: 3, candidates: 4, note: "F shrunk: 9 → 4" });
    const p3 = this.proposal(3, 73, d - 9);
    await this.propose(3, p3, "Same slot on runway 3; gate unchanged.");
    await this.check(3, ALL_PASS);
    await this.say(3, "PILOT", "ACCEPT", "Hold 5 min.");
    await this.say(3, "GROUND", "REJECT", `GATE_OVERLAP: gate not changed, same objection as turn 2.`, { violated_constraint: "GATE_OVERLAP" });

    const fb = this.proposal(3, 102, d - 9);
    await this.say(null, "SYSTEM", "FALLBACK",
      `NO_CONSENSUS_AFTER_3_TURNS (Ground stalemate on GATE_OVERLAP). Deterministic fallback: fuel-critical first, earliest safe slot, lowest-numbered free gate → ${this.describe(fb)}.`,
      { proposal: fb });
    await this.check(null, ALL_PASS);
    this.suggest({ index: 1, path: "FALLBACK", fallback_reason: "NO_CONSENSUS_AFTER_3_TURNS", proposal: fb, violations: 0 });
  }

  private async consensus(p: Proposal) {
    await this.say(null, "SYSTEM", "CONSENSUS",
      `All three accepted proposal ${p.proposal_id} and the checker passed. Suggestion ${this.phase} sent to the three humans.`, { proposal: p });
    this.suggest({ index: this.phase as 1 | 2, path: "AGENT_CONSENSUS", proposal: p, violations: 0 });
  }

  private suggest(s: Suggestion) {
    this.suggestions.push(s);
    this.emit({ kind: "suggestion", suggestion: s });
    if (s.index === 1) this.emit({ kind: "baseline", rows: this.baseline(s) });
  }

  private baseline(s: Suggestion): BaselineRow[] {
    const base = this.baseDelay();
    const fbDelay = s.path === "FALLBACK" ? s.proposal.delay_min.value : Math.round(base * 0.7);
    const negDelay = s.path === "FALLBACK" ? null : s.proposal.delay_min.value;
    const holdNothing = Math.min(45, this.sc.weather_delay || 20);
    const holdFb = s.path === "FALLBACK" ? 5 : 14;
    const holdNeg = s.path === "FALLBACK" ? null : 10;
    const kg = (m: number | null) => (m === null ? null : Math.round(m * this.burnKgPerMin()));
    return [
      { metric: "Total delay (min)", do_nothing: base, fallback: fbDelay, negotiated: negDelay },
      { metric: "Holding (min)", do_nothing: holdNothing, fallback: holdFb, negotiated: holdNeg },
      { metric: "Est. holding fuel (kg)", do_nothing: kg(holdNothing), fallback: kg(holdFb), negotiated: kg(holdNeg) },
      { metric: "Violations", do_nothing: holdNothing > (this.lowFuel ? 8 : 15) ? 1 : 0, fallback: 0, negotiated: negDelay === null ? null : 0 },
    ];
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
      this.emit({ kind: "final", proposal: s.proposal, decided_by: "HUMAN_APPROVED" });
    } else if (index === 1) {
      await this.phaseTwo(rejects);
    } else {
      this.emit({ kind: "awaiting_human_call", options: this.suggestions });
    }
  }

  private async phaseTwo(rejects: Approval[]) {
    this.phase = 2;
    this.tokens = 0;
    this.emit({ kind: "phase_start", phase: 2, limits: LIMITS });
    this.phaseStart = performance.now();
    const prev = this.suggestions[0].proposal;
    await this.say(null, "SYSTEM", "INFO_RESPONSE",
      `Human rejection added as standing constraints: ${rejects.map((r) => `${r.role}: "${r.reason}"`).join("; ")}. Suggestion 1 (${prev.proposal_id}) added to the rejected list.`);
    this.emit({ kind: "turn_start", phase: 2, turn: 1, candidates: 7, note: "F after human constraints: 7" });
    const p = this.proposal(1, 56, prev.delay_min.value + 6);
    await this.propose(1, p, "Addresses the human objections; 6 min later slot.");
    await this.check(1, ALL_PASS);
    await this.say(1, "PILOT", "ACCEPT", "Hold within usable limit.");
    await this.say(1, "GROUND", "ACCEPT", "Gate free, crew on shift.");
    await this.consensus(p);
  }

  async humanCall(chosen: number, note: string) {
    const s = this.suggestions[chosen - 1];
    await this.append({
      phase: this.phase, turn: null, sender: "HUMAN", type: "HUMAN_CALL_DECISION",
      rationale: `Human call decided Suggestion ${chosen} (${s.proposal.proposal_id}). ${note}`, proposal: s.proposal,
    });
    this.emit({ kind: "final", proposal: s.proposal, decided_by: "HUMAN_CALL" });
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
    async tamper(runId) {
      const e = get(runId).entries.find((x) => x.type === "PROPOSE");
      if (e?.proposal) e.proposal = { ...e.proposal, delay_min: { ...e.proposal.delay_min, value: e.proposal.delay_min.value - 10 } };
    },
  };
}
