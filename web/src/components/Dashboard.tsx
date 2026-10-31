"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { presetById } from "@/lib/demo";
import { currentSuggestion, isRunning, runStatus, useRuns } from "@/lib/useRun";
import { Approvals } from "./Approvals";
import { BackendRuns } from "./BackendRuns";
import { Baseline } from "./Baseline";
import { DemoPresets } from "./DemoPresets";
import { LogPanel } from "./LogPanel";
import { ResultCard } from "./ResultCard";
import { ScenarioPicker } from "./ScenarioPicker";
import { Timeline } from "./Timeline";

const TABLE = process.env.NEXT_PUBLIC_TABLE_NUMBER ?? "[YOUR TABLE NUMBER]";

export type Mode = "demo" | "user";

export function Dashboard() {
  const { runs, active, error, start, replay, select, openBackend } = useRuns();
  const [mode, setMode] = useState<Mode>("demo");
  const suggestion = currentSuggestion(active);
  const running = isRunning(active);
  const backend = active?.source === "backend";
  const mock = api.mode === "mock" && !backend;
  const recorded = active?.source === "recorded";
  // Scripts and tamper only apply to Demo-mode preset runs.
  const preset = mode === "demo" ? presetById(active?.presetId) : undefined;

  return (
    <div className="pg">
      <header className="top">
        <div>
          <h1>
            AeroClear · Disruption Negotiation
            <span className={`mode ${mock ? "" : "live"}`}>
              {backend ? "REAL RUN · backend log" : mock ? "MOCK BACKEND · scripted values" : "LIVE BACKEND"}
            </span>
          </h1>
          <small>Autonomous SG 2026 · Airbus Track · Challenge 2 · Table no. {TABLE}</small>
        </div>
        <div className="seg" role="group" aria-label="Mode">
          <button type="button" aria-pressed={mode === "demo"} onClick={() => setMode("demo")}>
            Demo
          </button>
          <button type="button" aria-pressed={mode === "user"} onClick={() => setMode("user")}>
            User
          </button>
        </div>
      </header>

      {!!runs.length && (
        <nav className="runs" aria-label="Run history">
          <span className="runs-l">Runs</span>
          {runs.map((r) => {
            const st = runStatus(r);
            return (
              <button
                key={r.runId}
                type="button"
                className={`runchip ${st.cls}`}
                aria-current={r.runId === active?.runId}
                onClick={() => select(r.runId)}
              >
                {r.label}
                {r.source === "recorded" && " · Recorded"}
                {r.source === "backend" && " · Real"} <span>{st.text}</span>
              </button>
            );
          })}
        </nav>
      )}

      <main className="wrap">
        <div className="col">
          <BackendRuns activeId={backend ? active.runId : null} onOpen={openBackend} />
          {mode === "demo" ? (
            <DemoPresets busy={running} onRun={(p) => start(p.rowId, p.lowFuel, p.label, p.id)} onReplay={replay} />
          ) : (
            <ScenarioPicker busy={running} onRun={(rowId, lowFuel) => start(rowId, lowFuel, `Row ${rowId}${lowFuel !== "off" ? ` · fuel ${lowFuel}` : ""}`)} />
          )}
          {(error || active?.error) && (
            <p className="err" role="alert">
              {error ?? active?.error}
            </p>
          )}
          <Timeline key={`tl-${active?.runId}`} run={active} running={running} />
        </div>
        <div className="col">
          <ResultCard state={active} suggestion={suggestion} />
          <Approvals
            key={`ap-${active?.runId}`}
            run={active}
            suggestion={running ? null : suggestion}
            readOnly={recorded || backend}
            readOnlyNote={backend ? " Real run: the backend has no approval step yet (orchestrator.py TODO), so decisions can't be sent." : undefined}
            preset={preset}
          />
          <Baseline table={active?.baseline ?? null} mock={mock} />
          <LogPanel key={`log-${active?.runId}`} run={active} tamperDemo={!!preset?.tamper && !recorded} />
        </div>
      </main>
    </div>
  );
}
