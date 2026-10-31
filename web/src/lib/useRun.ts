"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { api } from "./api";
import type { Approval, BaselineRow, Limits, LogEntry, Proposal, RunEvent, Suggestion } from "./types";

export interface TurnView {
  turn: number;
  candidates: number;
  note?: string;
  entries: LogEntry[];
}

export interface PhaseView {
  phase: number;
  limits: Limits;
  wall_s: number;
  tokens: number;
  setup: LogEntry[];
  turns: TurnView[];
  outcome: LogEntry[];
}

export interface RunState {
  runId: string | null;
  phases: PhaseView[];
  entries: LogEntry[];
  suggestions: Suggestion[];
  approvals: Record<number, Approval[]>;
  baseline: BaselineRow[] | null;
  humanCallOptions: Suggestion[] | null;
  final: { proposal: Proposal; decided_by: "HUMAN_APPROVED" | "HUMAN_CALL" } | null;
  error: string | null;
}

const initial: RunState = {
  runId: null,
  phases: [],
  entries: [],
  suggestions: [],
  approvals: {},
  baseline: null,
  humanCallOptions: null,
  final: null,
  error: null,
};

type Action = { type: "reset"; runId: string | null } | { type: "event"; event: RunEvent };

function updatePhase(s: RunState, phase: number, f: (p: PhaseView) => PhaseView): RunState {
  return { ...s, phases: s.phases.map((p) => (p.phase === phase ? f(p) : p)) };
}

function reducer(s: RunState, a: Action): RunState {
  if (a.type === "reset") return { ...initial, runId: a.runId };
  const e = a.event;
  switch (e.kind) {
    case "phase_start":
      return {
        ...s,
        phases: [...s.phases, { phase: e.phase, limits: e.limits, wall_s: 0, tokens: 0, setup: [], turns: [], outcome: [] }],
      };
    case "turn_start":
      return updatePhase(s, e.phase, (p) => ({
        ...p,
        turns: [...p.turns, { turn: e.turn, candidates: e.candidates, note: e.note, entries: [] }],
      }));
    case "entry": {
      const en = e.entry;
      const next = { ...s, entries: [...s.entries, en] };
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
      return { ...s, suggestions: [...s.suggestions, e.suggestion] };
    case "approval":
      return {
        ...s,
        approvals: { ...s.approvals, [e.suggestion_index]: [...(s.approvals[e.suggestion_index] ?? []), e.approval] },
      };
    case "baseline":
      return { ...s, baseline: e.rows };
    case "awaiting_human_call":
      return { ...s, humanCallOptions: e.options };
    case "final":
      return { ...s, final: { proposal: e.proposal, decided_by: e.decided_by }, humanCallOptions: null };
    case "error":
      return { ...s, error: e.message };
  }
}

export function useRun() {
  const [state, dispatch] = useReducer(reducer, initial);
  const unsub = useRef<(() => void) | null>(null);

  useEffect(() => () => unsub.current?.(), []);

  const start = useCallback(async (rowId: number, lowFuel: boolean) => {
    unsub.current?.();
    dispatch({ type: "reset", runId: null });
    try {
      const runId = await api.startRun(rowId, lowFuel);
      dispatch({ type: "reset", runId });
      unsub.current = api.subscribe(runId, (event) => dispatch({ type: "event", event }));
    } catch (err) {
      dispatch({ type: "event", event: { kind: "error", message: (err as Error).message } });
    }
  }, []);

  return { state, start };
}

export function currentSuggestion(s: RunState): Suggestion | null {
  return s.suggestions.at(-1) ?? null;
}

export function isRunning(s: RunState): boolean {
  if (!s.runId || s.final || s.error || s.humanCallOptions) return false;
  const latest = currentSuggestion(s);
  if (!latest) return true;
  // A suggestion is waiting for humans unless all three decided and phase 2 has begun.
  return s.phases.length > latest.index;
}
