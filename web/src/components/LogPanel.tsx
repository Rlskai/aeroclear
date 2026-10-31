"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { short, verifyChain } from "@/lib/hash";
import type { LogEntry, VerifyResult } from "@/lib/types";
import type { RunState } from "@/lib/useRun";

const NO_ENTRIES: LogEntry[] = [];

export function LogPanel({ run, tamperDemo }: { run: RunState | null; tamperDemo: boolean }) {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [tampered, setTampered] = useState(false);
  const [tick, setTick] = useState(0);
  const entries = run?.entries ?? NO_ENTRIES;
  // Recorded runs have no backend run behind them; verify the replayed entries in the browser.
  const local = run?.source === "recorded";
  const runId = run?.runId ?? null;
  const sealed = !!run?.final;

  // Auto-verify on every new entry, so the badge is current the moment the log is sealed.
  useEffect(() => {
    if (!runId) return;
    let live = true;
    (local ? verifyChain(entries) : api.verify(runId)).then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [runId, local, entries, tick]);

  async function download() {
    if (!runId) return;
    const log: LogEntry[] = local ? entries : await api.getLog(runId);
    const blob = new Blob([log.map((e) => JSON.stringify(e)).join("\n") + "\n"], { type: "application/x-ndjson" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `negotiation-${runId}.jsonl`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function toggleTamper() {
    if (!runId) return;
    await (tampered ? api.untamper(runId) : api.tamper(runId));
    setTampered((v) => !v);
    setTick((t) => t + 1);
  }

  const shown = runId ? result : null;
  const status = !shown
    ? { text: "No log yet", cls: "wait" }
    : shown.ok
      ? { text: `Log chain verified ✓ (${shown.entries} entries)${sealed ? " · sealed" : ""}`, cls: "" }
      : { text: `Chain broken at entry #${shown.first_bad_seq}`, cls: "bad" };

  return (
    <section className="card" aria-labelledby="h-log">
      <h2 id="h-log">6. Log verification</h2>
      <p className="sub">Append-only JSONL, each entry hashes the previous one. Verified automatically.</p>
      <span className={`status ${status.cls}`} role="status">
        {status.text}
      </span>
      <div className="log mono" tabIndex={0} aria-label="Log entries">
        {!entries.length && <span>#– waiting for the first entry</span>}
        {entries.map((e) => (
          <div key={e.msg_id} className={shown && !shown.ok && e.seq === shown.first_bad_seq ? "bad" : ""}>
            #{e.seq} {e.sender.padEnd(7, " ")} {e.type}&nbsp; prev={short(e.prev_hash)}&nbsp; hash={short(e.hash)}
          </div>
        ))}
      </div>
      <div className="note actions">
        <button className="btn ghost" type="button" disabled={!runId} onClick={download}>
          Download log (JSONL)
        </button>
        <button className="btn ghost" type="button" disabled={!runId} onClick={() => setTick((t) => t + 1)}>
          Verify
        </button>
        {tamperDemo && (
          <button
            className={`btn ${tampered ? "" : "no"}`}
            type="button"
            disabled={!sealed}
            onClick={toggleTamper}
            title="Edits one stored proposal (in memory, never the log file) so verification fails"
          >
            {tampered ? "Reset" : "Tamper with log"}
          </button>
        )}
      </div>
    </section>
  );
}
