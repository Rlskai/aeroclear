// Real runs from the Python backend, read from its log files (logs/<run_id>.jsonl,
// written by aeroclear/chainlog.py) through this app's /api/runs routes. Each line
// becomes the same RunEvents the mock streams, so every panel works unchanged.
// Read-only: the backend runs from the terminal and has no approval step yet.

import { verifyPyChain } from "./pyhash";
import type { CheckResult, FallbackReason, LogEntry, Proposal, RunEvent, Suggestion, VerifyResult } from "./types";

const POLL_MS = 1000;

/** A backend message as built by aeroclear/models.py make_message(). */
interface PyMessage {
  msg_id: string;
  phase: number;
  turn: number;
  sender: LogEntry["sender"];
  type: LogEntry["type"];
  proposal: Proposal | null;
  violated_constraint: LogEntry["violated_constraint"];
  suggestion: { reason_code?: string };
  rationale: string;
  prev_hash: string;
  hash: string;
}

export interface BackendRunInfo {
  runId: string;
  label: string;
  messages: number;
  lastAt: string;
}

/** "s2-1761900000" -> "Scenario 2 · 14:20:00" */
export function runLabel(runId: string) {
  const m = /^s(\d+)-(\d+)$/.exec(runId);
  if (!m) return runId;
  return `Scenario ${m[1]} · ${new Date(Number(m[2]) * 1000).toLocaleTimeString()}`;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `${url} failed: ${res.status}`);
  return body as T;
}

/** Calls poll now and every POLL_MS until stopped. Returns the stop function. */
function every(poll: () => Promise<unknown>) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const tick = async () => {
    await poll().catch(() => {});
    if (!stopped) timer = setTimeout(tick, POLL_MS);
  };
  tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** Runs in the logs folder, newest first, re-checked every second. */
export function watchBackendRuns(onChange: (runs: BackendRunInfo[], dir: string) => void, onError: (msg: string) => void) {
  return every(async () => {
    try {
      const { dir, runs } = await getJson<{ dir: string; runs: Omit<BackendRunInfo, "label">[] }>("/api/runs");
      onChange(
        runs.map((r) => ({ ...r, label: runLabel(r.runId) })),
        dir,
      );
    } catch (e) {
      onError((e as Error).message);
    }
  });
}

const LIMITS = { max_turns: 3, wall_clock_s: 0, token_cap: 0 };

/** Stateful: feed messages in log order, get the RunEvents each one implies. */
export function createConverter() {
  let seq = 0;
  const phases = new Set<number>();
  const turns = new Set<string>();
  const proposed = new Map<number, Proposal>(); // phase -> latest ATC proposal
  const accepted = new Map<number, Set<string>>(); // phase -> roles that accepted it
  const violations = new Map<number, number>();
  const suggested = new Set<number>();

  return (m: PyMessage): RunEvent[] => {
    const out: RunEvent[] = [];

    if (!phases.has(m.phase)) {
      phases.add(m.phase);
      out.push({ kind: "phase_start", phase: m.phase, limits: LIMITS });
    }
    // Turn 0 (arrival request) is setup; the fallback is the phase outcome.
    const turn = m.turn === 0 || m.type === "FALLBACK" ? null : m.turn;
    if (turn != null && !turns.has(`${m.phase}.${turn}`)) {
      turns.add(`${m.phase}.${turn}`);
      out.push({ kind: "turn_start", phase: m.phase, turn, candidates: 0, note: "" });
    }

    const failed = m.type === "CHECK_RESULT" && !!m.violated_constraint;
    const check: CheckResult | null =
      m.type === "CHECK_RESULT"
        ? { passed: !failed, checks: failed ? [{ name: m.violated_constraint!, passed: false, detail: m.rationale }] : [] }
        : null;
    if (failed) violations.set(m.phase, (violations.get(m.phase) ?? 0) + 1);

    out.push({
      kind: "entry",
      entry: {
        seq: seq++,
        msg_id: m.msg_id,
        phase: m.phase,
        turn,
        sender: m.sender,
        type: m.type,
        proposal: m.proposal,
        check,
        violated_constraint: m.violated_constraint,
        rationale: m.rationale,
        ts: "", // the backend log has no timestamps
        prev_hash: m.prev_hash,
        hash: m.hash,
      },
    });

    const suggest = (s: Omit<Suggestion, "index" | "violations">) => {
      if (suggested.has(m.phase)) return;
      suggested.add(m.phase);
      out.push({ kind: "suggestion", suggestion: { ...s, index: m.phase as 1 | 2, violations: violations.get(m.phase) ?? 0 } });
    };

    if (m.type === "PROPOSE" && m.proposal) {
      proposed.set(m.phase, m.proposal);
      accepted.set(m.phase, new Set());
    } else if (m.type === "ACCEPT" && (m.sender === "PILOT" || m.sender === "GROUND")) {
      // Same rule as orchestrator.run_phase: both accept the exact proposal ATC made.
      const p = proposed.get(m.phase);
      if (p && m.proposal?.proposal_id === p.proposal_id) {
        const roles = accepted.get(m.phase)!;
        roles.add(m.sender);
        if (roles.size === 2) suggest({ path: "AGENT_CONSENSUS", proposal: p });
      }
    } else if (m.type === "FALLBACK" && m.proposal) {
      suggest({ path: "FALLBACK", fallback_reason: m.suggestion?.reason_code as FallbackReason, proposal: m.proposal });
    }
    return out;
  };
}

const lines = (runId: string, from = 0) =>
  getJson<{ lines: string[]; total: number }>(`/api/runs/${encodeURIComponent(runId)}?from=${from}`);

/** Replays the run's log so far, then follows new lines. Returns an unsubscribe function. */
export function subscribeBackendRun(runId: string, onEvent: (e: RunEvent) => void) {
  const convert = createConverter();
  let read = 0;
  let failed = false;
  return every(async () => {
    try {
      const res = await lines(runId, read);
      read += res.lines.length;
      res.lines.forEach((l) => convert(JSON.parse(l) as PyMessage).forEach(onEvent));
    } catch (e) {
      if (!failed) onEvent({ kind: "error", message: (e as Error).message });
      failed = true;
    }
  });
}

/** Same check as aeroclear/chainlog.py verify(), on the lines exactly as written. */
export async function verifyBackendRun(runId: string): Promise<VerifyResult> {
  return verifyPyChain((await lines(runId)).lines);
}

/** The run's log file contents. */
export async function backendLogText(runId: string): Promise<string> {
  return (await lines(runId)).lines.join("\n") + "\n";
}
