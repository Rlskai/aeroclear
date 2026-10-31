"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { api } from "./api";
import { subscribeBackendRun } from "./backend";
import { MAX_REPLAY_GAP_MS, saveRecording, type Recording } from "./recordings";
import type { Approval, BaselineTable, Limits, LogEntry, LowFuel, Proposal, Role, RunEvent, Suggestion } from "./types";

export interface TurnView {
  turn: number;
  candidates: number;
  note?: string;
  entries: LogEntry[];
}

export interface PhaseView {
  phase: number;
  limits: Limits;
  constraintsAdded: string[];
  wall_s: number;
  tokens: number;
  setup: LogEntry[];
  turns: TurnView[];
  outcome: LogEntry[];
}

export interface RunState {
  runId: string;
  label: string;
  presetId?: string;
  /** "recorded" = replayed from a saved stream, read-only. "backend" = real Python run from its log file, read-only. */
  source: "live" | "recorded" | "backend";
  phases: PhaseView[];
  entries: LogEntry[];
  suggestions: Suggestion[];
  approvals: Record<number, Approval[]>;
  baseline: BaselineTable | null;
  humanCallOptions: Suggestion[] | null;
  final: { proposal: Proposal; decided_by: "HUMAN_APPROVED" | "HUMAN_CALL" } | null;
  thinking: Role | null;
  error: string | null;
}

interface Store {
  runs: Record<string, RunState>;
  order: string[];
  active: string | null;
  error: string | null;
}

type Meta = Pick<RunState, "runId" | "label" | "presetId" | "source">;

type Action =
  | { type: "add"; meta: Meta }
  | { type: "event"; runId: string; event: RunEvent }
  | { type: "select"; runId: string }
  | { type: "error"; message: string };

function newRun(meta: Meta): RunState {
  return {
    ...meta,
    phases: [],
    entries: [],
    suggestions: [],
    approvals: {},
    baseline: null,
    humanCallOptions: null,
    final: null,
    thinking: null,
    error: null,
  };
}

function updatePhase(s: RunState, phase: number, f: (p: PhaseView) => PhaseView): RunState {
  return { ...s, phases: s.phases.map((p) => (p.phase === phase ? f(p) : p)) };
}

function runReducer(s: RunState, e: RunEvent): RunState {
  switch (e.kind) {
    case "phase_start":
      return {
        ...s,
        phases: [
          ...s.phases,
          {
            phase: e.phase,
            limits: e.limits,
            constraintsAdded: e.constraints_added ?? [],
            wall_s: 0,
            tokens: 0,
            setup: [],
            turns: [],
            outcome: [],
          },
        ],
      };
    case "thinking":
      return { ...s, thinking: e.role };
    case "turn_start":
      return updatePhase(s, e.phase, (p) => ({
        ...p,
        turns: [...p.turns, { turn: e.turn, candidates: e.candidates, note: e.note, entries: [] }],
      }));
    case "entry": {
      const en = e.entry;
      const next = { ...s, thinking: null, entries: [...s.entries, en] };
      return updatePhase(next, en.phase, (p) => {
        if (en.turn != null) {
          return { ...p, turns: p.turns.map((t) => (t.turn === en.turn ? { ...t, entries: [...t.entries, en] } : t)) };
        }
        return p.turns.length ? { ...p, outcome: [...p.outcome, en] } : { ...p, setup: [...p.setup, en] };
      });
    }
    case "meter":
      return updatePhase(s, e.phase, (p) => ({ ...p, wall_s: e.wall_s, tokens: e.tokens }));
    case "suggestion":
      return { ...s, thinking: null, suggestions: [...s.suggestions, e.suggestion] };
    case "approval":
      return {
        ...s,
        approvals: { ...s.approvals, [e.suggestion_index]: [...(s.approvals[e.suggestion_index] ?? []), e.approval] },
      };
    case "baseline":
      return { ...s, baseline: e.table };
    case "awaiting_human_call":
      return { ...s, humanCallOptions: e.options };
    case "final":
      return { ...s, final: { proposal: e.proposal, decided_by: e.decided_by }, humanCallOptions: null };
    case "error":
      return { ...s, thinking: null, error: e.message };
  }
}

function reducer(s: Store, a: Action): Store {
  switch (a.type) {
    case "add":
      return { ...s, runs: { ...s.runs, [a.meta.runId]: newRun(a.meta) }, order: [...s.order, a.meta.runId], active: a.meta.runId, error: null };
    case "event": {
      const run = s.runs[a.runId];
      return run ? { ...s, runs: { ...s.runs, [a.runId]: runReducer(run, a.event) } } : s;
    }
    case "select":
      return { ...s, active: a.runId };
    case "error":
      return { ...s, error: a.message };
  }
}

const initial: Store = { runs: {}, order: [], active: null, error: null };

export function useRuns() {
  const [store, dispatch] = useReducer(reducer, initial);
  const subs = useRef<(() => void)[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      subs.current.forEach((u) => u());
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const start = useCallback(async (rowId: number, lowFuel: LowFuel, label: string, presetId?: string) => {
    try {
      const runId = await api.startRun(rowId, lowFuel);
      dispatch({ type: "add", meta: { runId, label, presetId, source: "live" } });
      const t0 = Date.now();
      const recorded: Recording["events"] = [];
      let failed = false;
      subs.current.push(
        api.subscribe(runId, (event) => {
          dispatch({ type: "event", runId, event });
          if (!presetId) return;
          if (event.kind === "error") failed = true;
          recorded.push({ t: Date.now() - t0, event });
          // Keep only clean, finished runs as the backup.
          if (event.kind === "final" && !failed) {
            saveRecording({ presetId, label, recordedAt: new Date().toISOString(), events: recorded });
          }
        }),
      );
    } catch (err) {
      dispatch({ type: "error", message: (err as Error).message });
    }
  }, []);

  const replay = useCallback((rec: Recording) => {
    const runId = `rec-${rec.presetId}-${Date.now().toString(36)}`;
    dispatch({ type: "add", meta: { runId, label: rec.label, presetId: rec.presetId, source: "recorded" } });
    let at = 0;
    let prev = 0;
    for (const { t, event } of rec.events) {
      at += Math.min(t - prev, MAX_REPLAY_GAP_MS);
      prev = t;
      timers.current.push(setTimeout(() => dispatch({ type: "event", runId, event }), at));
    }
  }, []);

  const select = useCallback((runId: string) => dispatch({ type: "select", runId }), []);

  // Real backend runs: opened once, then kept live while the page is open.
  const opened = useRef(new Set<string>());
  const openBackend = useCallback((runId: string, label: string) => {
    if (opened.current.has(runId)) return dispatch({ type: "select", runId });
    opened.current.add(runId);
    dispatch({ type: "add", meta: { runId, label, source: "backend" } });
    subs.current.push(subscribeBackendRun(runId, (event) => dispatch({ type: "event", runId, event })));
  }, []);

  const runs = store.order.map((id) => store.runs[id]);
  const active = store.active ? store.runs[store.active] : null;
  return { runs, active, error: store.error, start, replay, select, openBackend };
}

export function currentSuggestion(s: RunState | null): Suggestion | null {
  return s?.suggestions.at(-1) ?? null;
}

export function isRunning(s: RunState | null): boolean {
  if (!s || s.final || s.error || s.humanCallOptions) return false;
  const latest = currentSuggestion(s);
  if (!latest) return true;
  // A suggestion is waiting for humans unless all three decided and phase 2 has begun.
  return s.phases.length > latest.index;
}

export type RunStatus = { text: string; cls: string };

export function runStatus(s: RunState): RunStatus {
  if (s.error) return { text: "error", cls: "bad" };
  if (s.final) return s.final.decided_by === "HUMAN_CALL" ? { text: "📞 human call", cls: "warn" } : { text: "✓ approved", cls: "" };
  if (s.humanCallOptions) return { text: "📞 in call", cls: "bad" };
  if (s.source === "backend" && !isRunning(s)) return { text: `✓ ${currentSuggestion(s)?.path ?? "done"}`, cls: "" };
  if (isRunning(s)) return { text: "⟳ running", cls: "wait" };
  return { text: "awaiting humans", cls: "wait" };
}
