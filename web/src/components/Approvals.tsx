"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Approval, Role, Suggestion } from "@/lib/types";

const ROLES: { role: Role; label: string }[] = [
  { role: "PILOT", label: "Pilot" },
  { role: "ATC", label: "ATC" },
  { role: "GROUND", label: "Ground" },
];

function RoleRow({
  runId,
  label,
  role,
  suggestion,
  decision,
  locked,
}: {
  runId: string;
  label: string;
  role: Role;
  suggestion: Suggestion | null;
  decision?: Approval;
  locked: boolean;
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
    <div className="ap">
      <span>
        <b>{label}</b> · {suggestion ? `Suggestion ${suggestion.index}` : "waiting for a suggestion"}
      </span>
      {decision ? (
        <span className={`decided ${decision.decision === "APPROVE" ? "ok" : "no"}`}>
          {decision.decision === "APPROVE" ? "Approved" : `Rejected: ${decision.reason}`}
        </span>
      ) : (
        <span className="b">
          <button className="btn ok" type="button" disabled={disabled} onClick={() => send({ role, decision: "APPROVE" })}>
            Approve
          </button>
          <button className="btn no" type="button" disabled={disabled} onClick={() => setRejecting((v) => !v)}>
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
          <label className="sr" htmlFor={`reason-${role}`}>
            Reason for rejecting
          </label>
          <input
            id={`reason-${role}`}
            autoFocus
            placeholder="Reason (required), e.g. gate too far from connecting flights"
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

function HumanCall({ runId, options }: { runId: string; options: Suggestion[] }) {
  const [chosen, setChosen] = useState(options.at(-1)?.index ?? 1);
  const [note, setNote] = useState("");
  return (
    <form
      className="call"
      onSubmit={(e) => {
        e.preventDefault();
        void api.humanCall(runId, chosen, note.trim());
      }}
    >
      <b>Human call</b>
      <span>Suggestion 2 was rejected. No further agent discussion. Record what the humans decided on the call.</span>
      {options.map((o) => (
        <label key={o.index}>
          <input type="radio" name="call" checked={chosen === o.index} onChange={() => setChosen(o.index)} />
          Suggestion {o.index} ({o.path}): {o.proposal.runway.value}, {o.proposal.gate.value}, ETA {o.proposal.eta.value}
        </label>
      ))}
      <label className="sr" htmlFor="call-note">
        Decision note
      </label>
      <textarea id="call-note" placeholder="Decision note (required)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div>
        <button className="btn sm" type="submit" disabled={!note.trim()}>
          Record decision
        </button>
      </div>
    </form>
  );
}

export function Approvals({
  runId,
  suggestion,
  approvals,
  humanCallOptions,
  finalised,
}: {
  runId: string | null;
  suggestion: Suggestion | null;
  approvals: Approval[];
  humanCallOptions: Suggestion[] | null;
  finalised: boolean;
}) {
  return (
    <section className="card" aria-labelledby="h-app">
      <h2 id="h-app">4. Human approval</h2>
      <p className="sub">
        All three must approve. A reason is required on reject. First reject starts phase 2; a second ends in a human call.
      </p>
      <div className="appr">
        {ROLES.map((r) => (
          <RoleRow
            key={`${runId}-${suggestion?.index}-${r.role}`}
            runId={runId ?? ""}
            label={r.label}
            role={r.role}
            suggestion={runId ? suggestion : null}
            decision={approvals.find((a) => a.role === r.role)}
            locked={finalised || !!humanCallOptions}
          />
        ))}
      </div>
      {runId && humanCallOptions && <HumanCall runId={runId} options={humanCallOptions} />}
    </section>
  );
}
