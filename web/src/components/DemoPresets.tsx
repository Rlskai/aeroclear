"use client";

import { PRESETS, type Preset } from "@/lib/demo";
import { useRecordings, type Recording } from "@/lib/recordings";

export function DemoPresets({
  busy,
  onRun,
  onReplay,
}: {
  busy: boolean;
  onRun: (p: Preset) => void;
  onReplay: (r: Recording) => void;
}) {
  const recs = useRecordings(PRESETS.map((p) => p.id));

  return (
    <section className="card" aria-labelledby="h-demo">
      <h2 id="h-demo">1. Demo scenarios</h2>
      <p className="sub">Fixed rows, run live. Switch to User mode to run any flights.csv row.</p>
      <div className="presets">
        {PRESETS.map((p) => {
          const rec = recs[p.id];
          return (
            <div className="preset" key={p.id}>
              <button className="btn" type="button" disabled={busy} onClick={() => onRun(p)}>
                {p.label}
              </button>
              <p>{p.blurb}</p>
              <button
                className="btn ghost sm"
                type="button"
                disabled={busy || !rec}
                onClick={() => rec && onReplay(rec)}
                title={rec ? `Recorded ${new Date(rec.recordedAt).toLocaleTimeString()}` : "Finish one clean run of this scenario to record it"}
              >
                {rec ? "Replay recorded run" : "No recording yet"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
