import type { Proposal, Suggestion } from "@/lib/types";
import type { RunState } from "@/lib/useRun";

function statusLine(s: RunState | null, sug: Suggestion | null): { text: string; cls: string } {
  if (!s) return { text: "Plan status: no run yet", cls: "wait" };
  if (s.final) {
    return s.final.decided_by === "HUMAN_CALL"
      ? { text: "Final · decided on human call", cls: "warn" }
      : { text: "Final · HUMAN_APPROVED by all three", cls: "" };
  }
  if (s.humanCallOptions) return { text: "Suggestion 2 rejected · humans on a call", cls: "bad" };
  if (!sug) return { text: "Plan status: PROPOSED · negotiating", cls: "wait" };
  const decided = s.approvals[sug.index]?.length ?? 0;
  return {
    text: `Plan status: ${sug.path} · Suggestion ${sug.index} · ${decided}/3 humans decided`,
    cls: sug.path === "FALLBACK" ? "warn" : "",
  };
}

export function ResultCard({ state, suggestion }: { state: RunState | null; suggestion: Suggestion | null }) {
  const p: Proposal | null = state?.final?.proposal ?? suggestion?.proposal ?? null;
  const status = statusLine(state, suggestion);
  const cells: { label: string; value?: string; source?: string }[] = [
    { label: "Runway", value: p?.runway.value, source: p?.runway.source },
    { label: "Gate", value: p?.gate.value, source: p?.gate.source },
    { label: "ETA", value: p?.eta.value, source: p?.eta.source },
    { label: "Delay", value: p ? `${p.delay_min.value} min` : undefined, source: p?.delay_min.source },
  ];

  return (
    <section className="card" aria-labelledby="h-res">
      <h2 id="h-res">3. Result card</h2>
      <p className="sub">Every value carries a source tag.</p>
      <span className={`status ${status.cls}`}>{status.text}</span>
      {p?.airport && (
        <div className="kv divert">
          <span className="l">Flight plan</span>
          <b>Divert to {p.airport.value}</b>
          <span className="src mono">{p.airport.source}</span>
        </div>
      )}
      <div className="res">
        {cells.map((c) => (
          <div className="kv" key={c.label}>
            <span className="l">{c.label}</span>
            <b className={c.value ? "" : "ph"}>{c.value ?? "–"}</b>
            {c.source && <span className="src mono">{c.source}</span>}
          </div>
        ))}
      </div>
      {suggestion && (
        <p className="note">
          Checker results: {suggestion.violations} hard-constraint violations. Produced by{" "}
          {suggestion.path === "FALLBACK"
            ? `the deterministic fallback (${suggestion.fallback_reason}).`
            : "agent consensus."}
        </p>
      )}
    </section>
  );
}
