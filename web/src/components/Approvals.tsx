"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Preset, ScriptedReject } from "@/lib/demo";
import type { Approval, Role, Suggestion } from "@/lib/types";
import type { RunState } from "@/lib/useRun";

const ROLES: { role: Role; label: string }[] = [
  { role: "PILOT", label: "Pilot" },
  { role: "ATC", label: "ATC" },
  { role: "GROUND", label: "Ground" },
];

function where(s: Suggestion) {
  const p = s.proposal;
  return `${p.airport ? `Divert ${p.airport.value} · ` : ""}${p.runway.value}, ${p.gate.value}, ETA ${p.eta.value}, +${p.delay_min.value} min`;
}

function RolePanel({
  runId,
  label,
  role,
  suggestion,
  decision,
  locked,
  script,
}: {
  runId: string;
  label: string;
  role: Role;
  suggestion: Suggestion | null;
  decision?: Approval;
  locked: boolean;
  /** Demo mode: this role's scripted reject for the current suggestion. */
  script?: ScriptedReject;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const disabled = !suggestion || locked || sending;

  async function send(a: Approval) {
    if (!suggestion) return;
    setSending(true);
    try {
      await api.approve(runId, suggestion.index, a);
      setRejecting(false);
      setReason("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`ap ${script && !decision ? "scripted" : ""}`}>
      <div className="ap-h">
        <b>{label}</b>
        {script && !decision && <span className="tag">Script: reject</span>}
      </div>
      {decision ? (
        <span className={`decided ${decision.decision === "APPROVE" ? "ok" : "no"}`}>
          {decision.decision === "APPROVE" ? "✓ Approved" : `✗ Rejected: ${decision.reason}`}
        </span>
      ) : (
        <span className="b">
          <button className="btn ok sm" type="button" disabled={disabled} onClick={() => send({ role, decision: "APPROVE" })}>
            Approve
          </button>
          <button
            className="btn no sm"
            type="button"
            disabled={disabled}
            onClick={() => {
              setRejecting((v) => !v);
              if (script && !reason) setReason(script.reason);
            }}
          >
            Reject
          </button>
        </span>
      )}
      {rejecting && !decision && (
        <form
          className="reason"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) send({ role, decision: "REJECT", reason: reason.trim() });
          }}
        >
          {script && <span className="tag">Scripted for demo</span>}
          <label className="sr" htmlFor={`reason-${role}`}>
            Reason for rejecting
          </label>
          <textarea
            id={`reason-${role}`}
            autoFocus
            rows={3}
            placeholder="Reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button className="btn no sm" type="submit" disabled={!reason.trim() || sending}>
            Confirm reject
          </button>
        </form>
      )}
    </div>
  );
}

function HumanCall({ run, preset }: { run: RunState; preset?: Preset }) {
  const options = run.humanCallOptions ?? [];
  const [chosen, setChosen] = useState<number>(preset?.humanCall?.chosen ?? options.at(-1)?.index ?? 1);
  const [note, setNote] = useState(preset?.humanCall?.note ?? "");
  const [sending, setSending] = useState(false);

  return (
    <form
      className="call"
      onSubmit={async (e) => {
        e.preventDefault();
        setSending(true);
        try {
          await api.humanCall(run.runId, chosen, note.trim());
        } finally {
          setSending(false);
        }
      }}
    >
      <div className="call-banner" role="status">
        📞 Humans in call: agents are out of the loop
      </div>
      <span>Suggestion 2 was rejected. There is no phase 3. Pick the plan the humans agreed on the call.</span>
      <div className="call-opts">
        {options.map((o) => {
          const rejects = (run.approvals[o.index] ?? []).filter((a) => a.decision === "REJECT");
          return (
            <label key={o.index} className={`opt ${chosen === o.index ? "on" : ""}`}>
              <span>
                <input type="radio" name="call" checked={chosen === o.index} onChange={() => setChosen(o.index)} />{" "}
                <b>Suggestion {o.index}</b> · {o.path}
                {o.fallback_reason ? ` (${o.fallback_reason})` : ""}
              </span>
              <span className="mono">{where(o)}</span>
              <span>Checker: {o.violations === 0 ? "✓ 0 violations" : `✗ ${o.violations} violations`}</span>
              {rejects.map((r) => (
                <span key={r.role} className="decided no">
                  {r.role} rejected: {r.reason}
                </span>
              ))}
            </label>
          );
        })}
      </div>
      {preset?.humanCall && <span className="tag">Scripted for demo</span>}
      <label className="sr" htmlFor="call-note">
        Decision note
      </label>
      <textarea id="call-note" placeholder="Decision note (required)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div>
        <button className="btn sm" type="submit" disabled={!note.trim() || sending}>
          Record decision
        </button>
      </div>
    </form>
  );
}

export function Approvals({
  run,
  suggestion,
  readOnly,
  preset,
}: {
  run: RunState | null;
  suggestion: Suggestion | null;
  readOnly: boolean;
  preset?: Preset;
}) {
  const approvals = suggestion && run ? (run.approvals[suggestion.index] ?? []) : [];
  const locked = readOnly || !!run?.final || !!run?.humanCallOptions;
  const script = suggestion ? preset?.rejects[suggestion.index as 1 | 2] : undefined;

  return (
    <section className="card" aria-labelledby="h-app">
      <h2 id="h-app">4. Human approval</h2>
      <p className="sub">
        All three decide before anything happens. Any reject starts phase 2 with the reasons as constraints; a reject of Suggestion 2
        goes to a human call.
        {readOnly && " Recorded run: decisions are replayed, not clickable."}
      </p>
      <p className="note ap-for">
        {suggestion ? `Deciding on Suggestion ${suggestion.index}: ${where(suggestion)}` : run && !run.final ? "Waiting for the agents…" : "No suggestion yet."}
      </p>
      <div className="appr">
        {ROLES.map((r) => (
          <RolePanel
            key={`${suggestion?.index}-${r.role}`}
            runId={run?.runId ?? ""}
            label={r.label}
            role={r.role}
            suggestion={run ? suggestion : null}
            decision={approvals.find((a) => a.role === r.role)}
            locked={locked}
            script={script?.role === r.role ? script : undefined}
          />
        ))}
      </div>
      {run?.humanCallOptions && !readOnly && <HumanCall run={run} preset={preset} />}
    </section>
  );
}
