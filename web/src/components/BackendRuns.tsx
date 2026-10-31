"use client";

import { useEffect, useState } from "react";
import { watchBackendRuns, type BackendRunInfo } from "@/lib/backend";

export function BackendRuns({ activeId, onOpen }: { activeId: string | null; onOpen: (runId: string, label: string) => void }) {
  const [runs, setRuns] = useState<BackendRunInfo[] | null>(null);
  const [dir, setDir] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      watchBackendRuns(
        (r, d) => {
          setRuns(r);
          setDir(d);
          setError(null);
        },
        setError,
      ),
    [],
  );

  return (
    <section className="card" aria-labelledby="h-real">
      <h2 id="h-real">
        Real runs <span className="mode live">LOG FILES</span>
      </h2>
      <p className="sub">
        Runs of <code>python -m aeroclear.orchestrator</code>, read from <code>logs/*.jsonl</code> and followed live. Read-only: start runs
        from the terminal at the repo root.
      </p>
      {error ? (
        <p className="err" role="alert">
          {error.replace(/\.?$/, ".")}
        </p>
      ) : !runs ? (
        <p className="note">Loading…</p>
      ) : !runs.length ? (
        <p className="note">
          No runs in <code>{dir}</code> yet. Run <code>python -m aeroclear.orchestrator --scenario 1</code> from the repo root and it
          appears here.
        </p>
      ) : (
        <div className="chips">
          {runs.map((r) => (
            <button
              key={r.runId}
              type="button"
              className="btn ghost sm"
              aria-pressed={r.runId === activeId}
              onClick={() => onOpen(r.runId, r.label)}
              title={r.runId}
            >
              {r.label} · {r.messages} msgs
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
