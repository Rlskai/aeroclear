"use client";

import { useEffect, useRef } from "react";
import type { LogEntry, Suggestion } from "@/lib/types";
import type { PhaseView } from "@/lib/useRun";

const WHO: Record<LogEntry["sender"], { label: string; cls: string }> = {
  ATC: { label: "ATC", cls: "atc" },
  PILOT: { label: "PILOT", cls: "plt" },
  GROUND: { label: "GROUND", cls: "gnd" },
  CHECKER: { label: "CHECKER", cls: "chk" },
  SYSTEM: { label: "SYSTEM", cls: "sys" },
  HUMAN: { label: "HUMAN", cls: "hum" },
};

function typeClass(e: LogEntry) {
  if (e.type === "ACCEPT" || e.type === "CONSENSUS" || e.type === "HUMAN_APPROVE") return "acc";
  if (e.type === "REJECT" || e.type === "HUMAN_REJECT") return "rej";
  if (e.type === "CHECK_RESULT") return e.check?.passed === false ? "rej" : "ck";
  if (e.type === "FALLBACK") return "fb";
  if (e.type === "HUMAN_CALL_DECISION") return "hum";
  return "";
}

function Msg({ e }: { e: LogEntry }) {
  const who = WHO[e.sender];
  const type = e.type === "CHECK_RESULT" && e.check?.passed === false ? "CHECK_FAIL" : e.type;
  return (
    <div className="msg">
      <span className={`who ${who.cls}`}>{who.label}</span>
      <span className={`typ ${typeClass(e)}`}>{type}</span>
      <div>
        {e.rationale}
        {!!e.sources?.length && (
          <>
            <br />
            {e.sources.map((s) => (
              <span key={s} className="src mono">
                {s}
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export function Timeline({
  phases,
  suggestions,
  running,
}: {
  phases: PhaseView[];
  suggestions: Suggestion[];
  running: boolean;
}) {
  const end = useRef<HTMLDivElement>(null);
  const count = phases.reduce((n, p) => n + p.setup.length + p.outcome.length + p.turns.reduce((m, t) => m + t.entries.length, 0), 0);

  useEffect(() => {
    if (running) end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [count, running]);

  return (
    <section className="card" aria-labelledby="h-neg">
      <h2 id="h-neg">2. Live negotiation timeline</h2>
      <p className="sub">
        Max 2 phases, 3 turns each. One turn = one message from each agent. The checker runs before any ACCEPT counts.
      </p>

      {!phases.length && <div className="empty">Pick a scenario and run the negotiation. Messages stream in here.</div>}

      <div aria-live="polite">
        {phases.map((p) => {
          const s = suggestions.find((x) => x.index === p.phase);
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

              {!!p.setup.length && (
                <div className="turn">
                  <h3>
                    <span>{p.phase === 1 ? "Setup" : "Renegotiation input"}</span>
                    <span>Before turn 1</span>
                  </h3>
                  {p.setup.map((e) => (
                    <Msg key={e.msg_id} e={e} />
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
                    <Msg key={e.msg_id} e={e} />
                  ))}
                </div>
              ))}

              {!!p.outcome.length && (
                <div className="turn">
                  <h3>
                    <span>Outcome</span>
                    <span>
                      {s
                        ? s.path === "FALLBACK"
                          ? `Path: FALLBACK (${s.fallback_reason})`
                          : "Path: AGENT_CONSENSUS (not FALLBACK)"
                        : "…"}
                    </span>
                  </h3>
                  {p.outcome.map((e) => (
                    <Msg key={e.msg_id} e={e} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div ref={end} />
    </section>
  );
}
