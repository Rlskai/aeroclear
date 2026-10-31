"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { short } from "@/lib/hash";
import type { LogEntry, VerifyResult } from "@/lib/types";

export function LogPanel({ runId, entries }: { runId: string | null; entries: LogEntry[] }) {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!runId) return;
    let live = true;
    api.verify(runId).then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [runId, entries.length, tick]);

  async function download() {
    if (!runId) return;
    const log = await api.getLog(runId);
    const blob = new Blob([log.map((e) => JSON.stringify(e)).join("\n") + "\n"], { type: "application/x-ndjson" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `negotiation-${runId}.jsonl`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const shown = runId ? result : null;
  const status = !shown
    ? { text: "No log yet", cls: "wait" }
    : shown.ok
      ? { text: `Chain verified · ${shown.entries} entries`, cls: "" }
      : { text: `Chain broken at entry #${shown.first_bad_seq}`, cls: "bad" };

  return (
    <section className="card" aria-labelledby="h-log">
      <h2 id="h-log">6. Log verification</h2>
      <p className="sub">Append-only JSONL, each entry hashes the previous one.</p>
      <span className={`status ${status.cls}`} role="status">
        {status.text}
      </span>
      <div className="log mono" tabIndex={0} aria-label="Log entries">
        {!entries.length && <span>#– waiting for the first entry</span>}
        {entries.map((e) => (
          <div key={e.msg_id} className={shown && !shown.ok && e.seq === shown.first_bad_seq ? "bad" : ""}>
            #{e.seq} {e.sender.padEnd(7, " ")} {e.type}&nbsp; prev={short(e.prev_hash)}&nbsp; hash={short(e.hash)}
          </div>
        ))}
      </div>
      <div className="note actions">
        <button className="btn ghost" type="button" disabled={!runId} onClick={download}>
          Download log
        </button>
        <button className="btn ghost" type="button" disabled={!runId} onClick={() => setTick((t) => t + 1)}>
          Re-verify
        </button>
        {api.tamper && (
          <button
            className="btn no"
            type="button"
            disabled={!entries.some((e) => e.type === "PROPOSE")}
            onClick={async () => {
              await api.tamper!(runId!);
              setTick((t) => t + 1);
            }}
            title="Mock only: edits a logged proposal so verification fails"
          >
            Tamper (demo)
          </button>
        )}
      </div>
    </section>
  );
}
