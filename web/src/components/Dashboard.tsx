"use client";

import { api } from "@/lib/api";
import { currentSuggestion, isRunning, useRun } from "@/lib/useRun";
import { Approvals } from "./Approvals";
import { Baseline } from "./Baseline";
import { LogPanel } from "./LogPanel";
import { ResultCard } from "./ResultCard";
import { ScenarioPicker } from "./ScenarioPicker";
import { Timeline } from "./Timeline";

const TABLE = process.env.NEXT_PUBLIC_TABLE_NUMBER ?? "[YOUR TABLE NUMBER]";

export function Dashboard() {
  const { state, start } = useRun();
  const suggestion = currentSuggestion(state);
  const running = isRunning(state);
  const mock = api.mode === "mock";

  return (
    <div className="pg">
      <header className="top">
        <div>
          <h1>
            Disruption Negotiation: ATC, Pilot, Ground
            <span className={`mode ${mock ? "" : "live"}`}>{mock ? "MOCK BACKEND · scripted values" : "LIVE BACKEND"}</span>
          </h1>
          <small>Autonomous SG 2026 · Airbus Track · Challenge 2</small>
        </div>
        <small className="mono">Table no. {TABLE}</small>
      </header>
      <main className="wrap">
        <div className="col">
          <ScenarioPicker busy={running} onRun={start} />
          {state.error && (
            <p className="err" role="alert">
              {state.error}
            </p>
          )}
          <Timeline phases={state.phases} suggestions={state.suggestions} running={running} />
        </div>
        <div className="col">
          <ResultCard state={state} suggestion={suggestion} />
          <Approvals
            runId={state.runId}
            suggestion={running ? null : suggestion}
            approvals={suggestion && !running ? (state.approvals[suggestion.index] ?? []) : []}
            humanCallOptions={state.humanCallOptions}
            finalised={!!state.final}
          />
          <Baseline rows={state.baseline} mock={mock} />
          <LogPanel runId={state.runId} entries={state.entries} />
        </div>
      </main>
    </div>
  );
}
