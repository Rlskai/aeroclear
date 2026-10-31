"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LogEntry, Sender } from "@/lib/types";
import type { RunState } from "@/lib/useRun";

const WHO: Record<Sender, { label: string; cls: string }> = {
  ATC: { label: "ATC", cls: "atc" },
  PILOT: { label: "PILOT", cls: "plt" },
  GROUND: { label: "GROUND", cls: "gnd" },
  CHECKER: { label: "CHECKER", cls: "chk" },
  SYSTEM: { label: "SYSTEM", cls: "sys" },
  HUMAN: { label: "HUMAN", cls: "hum" },
};

/** Pixels from the bottom that still count as "following" the stream. */
const FOLLOW_SLACK = 48;

function typeClass(e: LogEntry) {
  if (e.type === "ACCEPT" || e.type === "CONSENSUS" || e.type === "HUMAN_APPROVE") return "acc";
  if (e.type === "REJECT" || e.type === "HUMAN_REJECT") return "rej";
  if (e.type === "CHECK_RESULT") return e.check?.passed === false ? "rej" : "ck";
  if (e.type === "FALLBACK") return "fb";
  if (e.type === "HUMAN_CALL_DECISION") return "hum";
  return "";
}

function firstSentence(text: string, max = 130) {
  const cut = text.split(/(?<=\.)\s/)[0];
  return cut.length > max ? `${cut.slice(0, max - 1)}…` : cut;
}

function summary(e: LogEntry, pnum: number | undefined) {
  const p = e.proposal;
  if (e.type === "PROPOSE" && p) {
    return `P${pnum} · ${p.airport ? `divert ${p.airport.value}, ` : ""}${p.runway.value}, ${p.gate.value}, ETA ${p.eta.value} (+${p.delay_min.value} min)`;
  }
  if (e.type === "CHECK_RESULT") {
    if (e.check?.passed !== false) return `${pnum ? `P${pnum} ` : ""}✓ all checks pass`;
    const bad = e.check.checks.find((c) => !c.passed);
    return `${pnum ? `P${pnum} ` : ""}✗ ${e.violated_constraint ?? bad?.name}: ${bad?.detail ?? ""}`;
  }
  const ref = pnum && (e.type === "ACCEPT" || e.type === "REJECT") ? `P${pnum} · ` : "";
  return ref + firstSentence(e.rationale);
}

function Msg({ e, pnum }: { e: LogEntry; pnum?: number }) {
  const [open, setOpen] = useState(false);
  const who = WHO[e.sender];
  const failed = e.type === "CHECK_RESULT" && e.check?.passed === false;
  const type = failed ? "CHECK_FAIL" : e.type;
  const p = e.proposal;

  if (e.type === "CHECK_RESULT") {
    // Checker results are never collapsed: pass/fail must be visible at a glance.
    return (
      <div className={`msg chkline ${failed ? "fail" : ""}`}>
        <span className={`who ${who.cls}`}>{who.label}</span>
        <span className={`typ ${typeClass(e)}`}>{type}</span>
        <div>
          {summary(e, pnum)}
          {failed && <div className="detail">{e.rationale}</div>}
        </div>
      </div>
    );
  }

  const sources = [...(p ? [p.airport?.source, p.runway.source, p.gate.source, p.eta.source, p.delay_min.source] : []), ...(e.sources ?? [])].filter(
    (s, i, a): s is string => !!s && a.indexOf(s) === i,
  );

  return (
    <div className={`msg ${open ? "open" : ""}`}>
      <span className={`who ${who.cls}`}>{who.label}</span>
      <span className={`typ ${typeClass(e)}`}>{type}</span>
      <div>
        <button type="button" className="sum" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {e.turn != null && <span className="tt mono">T{e.turn}</span>}
          {summary(e, pnum)}
          <span className="caret" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
        </button>
        {open && (
          <div className="detail">
            <p>{e.rationale}</p>
            {e.score && (
              <span className={`score ${e.score.value < e.score.floor ? "below" : ""}`}>
                {who.label} score {e.score.value} / floor {e.score.floor}
              </span>
            )}
            {p && (
              <dl className="pv">
                {p.airport && (
                  <>
                    <dt>Airport</dt>
                    <dd>{p.airport.value}</dd>
                  </>
                )}
                <dt>Runway</dt>
                <dd>{p.runway.value}</dd>
                <dt>Gate</dt>
                <dd>{p.gate.value}</dd>
                <dt>ETA</dt>
                <dd>{p.eta.value}</dd>
                <dt>Delay</dt>
                <dd>{p.delay_min.value} min</dd>
              </dl>
            )}
            {!!sources.length && (
              <div>
                {sources.map((s) => (
                  <span key={s} className="src mono">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Timeline({ run, running }: { run: RunState | null; running: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [unseen, setUnseen] = useState(false);
  const phases = run?.phases ?? [];
  const count = (run?.entries.length ?? 0) + phases.length + (run?.thinking ? 1 : 0);

  // P1, P2, … numbering across the run; responses point at the latest proposal.
  const pnums = useMemo(() => {
    const m = new Map<string, number>();
    let n = 0;
    for (const e of run?.entries ?? []) {
      if (e.type === "PROPOSE") n += 1;
      else if (e.type === "FALLBACK" && e.proposal) n += 1;
      if (n && ["PROPOSE", "FALLBACK", "CHECK_RESULT", "ACCEPT", "REJECT"].includes(e.type)) m.set(e.msg_id, n);
    }
    return m;
  }, [run?.entries]);

  const toBottom = () => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
    following.current = true;
    setUnseen(false);
  };

  useLayoutEffect(() => {
    if (following.current) {
      const el = box.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [count]);

  useEffect(() => {
    if (!following.current && count) setUnseen(true);
  }, [count]);

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    following.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK;
    if (following.current) setUnseen(false);
  };

  return (
    <section className="card tl" aria-labelledby="h-neg">
      <h2 id="h-neg">
        2. Negotiation timeline
        {run?.source === "recorded" && <span className="mode">Recorded</span>}
      </h2>
      <p className="sub">
        Max 2 phases, 3 turns each. Click a message to see its rationale, score and sources. Scroll up to read back; the stream keeps going.
      </p>

      {!phases.length && <div className="empty">Start a scenario. Messages stream in here as the agents talk.</div>}

      <div className="tl-scroll" ref={box} onScroll={onScroll} aria-live="polite">
        {phases.map((p) => {
          const s = run?.suggestions.find((x) => x.index === p.phase);
          return (
            <div key={p.phase}>
              <div className="phase">
                <span>
                  Phase {p.phase} · up to {p.limits.max_turns} turns
                </span>
                <span className="mono">
                  Wall clock {p.wall_s}s / {p.limits.wall_clock_s} s · Tokens {p.tokens.toLocaleString()} /{" "}
                  {p.limits.token_cap.toLocaleString()}
                </span>
              </div>
              {!!p.constraintsAdded.length && (
                <div className="added">
                  <b>Constraints added for phase {p.phase}:</b>
                  <ul>
                    {p.constraintsAdded.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!!p.setup.length && (
                <div className="turn">
                  <h3>
                    <span>{p.phase === 1 ? "Setup" : "Renegotiation input"}</span>
                    <span>Before turn 1</span>
                  </h3>
                  {p.setup.map((e) => (
                    <Msg key={e.msg_id} e={e} pnum={pnums.get(e.msg_id)} />
                  ))}
                </div>
              )}

              {p.turns.map((t) => (
                <div className="turn" key={t.turn}>
                  <h3>
                    <span>Turn {t.turn}</span>
                    <span>{t.note ?? `Candidates in F: ${t.candidates}`}</span>
                  </h3>
                  {t.entries.map((e) => (
                    <Msg key={e.msg_id} e={e} pnum={pnums.get(e.msg_id)} />
                  ))}
                </div>
              ))}

              {!!p.outcome.length && (
                <div className="turn">
                  <h3>
                    <span>Outcome</span>
                    <span>
                      {s ? (s.path === "FALLBACK" ? `Path: FALLBACK (${s.fallback_reason})` : "Path: AGENT_CONSENSUS") : "…"}
                    </span>
                  </h3>
                  {p.outcome.map((e) => (
                    <Msg key={e.msg_id} e={e} pnum={pnums.get(e.msg_id)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {running && (
          <div className="thinking" role="status">
            {run?.thinking ? (
              <>
                <span className={`who ${WHO[run.thinking].cls}`}>{WHO[run.thinking].label}</span> thinking…
              </>
            ) : (
              "Negotiating…"
            )}
          </div>
        )}
      </div>
      {unseen && (
        <button type="button" className="pill" onClick={toBottom}>
          ↓ New messages
        </button>
      )}
    </section>
  );
}
