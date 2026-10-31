# Demo Flow: Multi-Agent Disruption Negotiation

**Event:** Autonomous SG 2026, Airbus Track, Challenge #2
**Source of truth:** `references/PRD-2.md` (sections 7, 10, 11, 12, 17)
**Format:** three scenarios, shown live in the web view, each ending on the result card (runway, gate, ETA, delay) and a passing log verification.

---

## What the three scenarios prove together

| | Scenario 1: Happy path | Scenario 2: Ground-driven | Scenario 3: Failure and escalation |
|---|---|---|---|
| Disruption | Weather + late aircraft at ORD | Late aircraft at a gate-constrained hub | Scenario 1 + injected low fuel |
| Agent whose domain binds | ATC (runway throughput cut by weather) | Ground (gate availability) | Pilot (fuel reserve) |
| Exit path | `AGENT_CONSENSUS` | `AGENT_CONSENSUS`, steered by Ground's rejects | Checker block, then recovery or `FALLBACK` |
| Human outcome | 3/3 approve Suggestion 1 | 3/3 approve Suggestion 1 | Reject S1, phase 2, reject S2, human call |
| Output type | Revised arrival time + gate | Revised gate (and arrival time) | Revised arrival time or flight plan (alternate) |
| Safety layers shown | Checker passes | Checker passes, reject pruning | Checker, fallback, renegotiation, human override |

Each agent gets one scenario where its constraint is the one that decides the outcome. That answers the question "is this just ATC with two rubber stamps?"

---

## Common setup (all scenarios)

1. Pick the scenario in the scenario picker (filter + `flights.csv` row number).
2. The disruption injector turns the row into typed events:
   - `WEATHER_DELAY` → runway capacity cut to 50% of `max_runway_ops_per_hour` for the delay duration (`ASSUMPTION:weather_factor`).
   - `LATE_AIRCRAFT_DELAY` → the inbound aircraft holds its gate past schedule.
3. The arrival queue is built from real `flights.csv` arrivals at the same airport within the window around the focus flight.
4. The checker enumerates the feasible set F (runway × slot × gate) and the code scores each candidate for ATC, Pilot and Ground.
5. Pilot sends `ARRIVAL_REQUEST`. ATC sends `INFO_REQUEST` to Ground and gets `INFO_RESPONSE` (gate availability, crew status).
6. Discussion phase 1 starts. Max 3 turns, one structured message per agent per turn.

On screen throughout: the negotiation timeline, a source tag on every value (`flights.csv:…`, `constraints.xlsx:…`, `ASSUMPTION:…`, `SYNTHETIC:…`), and checker results inline.

---

## Scenario 1: Happy path

**Purpose:** show the core loop and the best case.

**Input**
- Airport: ORD (`constraints.xlsx:airport_capacity:ORD`: 4 runways, 150 gates, 90 ops/h, 45 min turnaround, 3 spare gates).
- Row: `flights.csv` row `<TBD>` with `WEATHER_DELAY` about 30 to 120 min **and** `LATE_AIRCRAFT_DELAY > 20`. Arrival delay under 800 min.
- Effective capacity during the weather window: 45 ops/h.

**Expected flow**

| Turn | ATC | Pilot | Ground | Checker |
|---|---|---|---|---|
| 1 | `PROPOSE` P1 (runway, slot, gate from the top-3 shortlist) | Position: fuel state, connections | Position: gate status, crew shift | P1 passes |
| 2 | `PROPOSE` P2 (revised to address any turn-1 concern) | `ACCEPT` | `ACCEPT` | P2 passes |

- Consensus: all three `ACCEPT` the same proposal hash and the checker passes, so the status is `AGENT_CONSENSUS`.
- Aim for consensus in **turn 2, not turn 1**. A one-turn agreement shows no negotiation. If turn 1 includes a soft objection (for example Pilot below floor on holding time), the audience sees a revision that addresses it.

**Human step:** Pilot, ATC and Ground humans all approve Suggestion 1. Status: `HUMAN_APPROVED`.

**End state to show**
- Result card: runway, gate, ETA, delay, each with its source tag.
- Baseline panel: do-nothing vs fallback vs negotiated (total delay, holding minutes, estimated fuel, violations = 0).
- Log verification: chain passes.

**Talking point:** three separate agents with separate prompts and model calls reached a checked plan within the organiser's 3-turn limit, and every number is traceable.

---

## Scenario 2: Ground-driven

**Purpose:** show that each agent's domain matters and the negotiation is not ATC dictating.

**Input**
- Row: `flights.csv` row `<TBD>`, late-aircraft dominant (`LATE_AIRCRAFT_DELAY` large, `WEATHER_DELAY` small or 0), at a hub where gates are the binding constraint.
- "Gate-constrained" has to come from the queue, not the workbook: every large hub in `airport_capacity` has the same 150 gates and 3 spare gates. Choose a window where several late inbounds are holding gates, so the spare gates (3) are used up around the focus flight's arrival. A medium hub (70 gates, 3 spare, 35 min turnaround) works as well.

**Expected flow**

| Turn | ATC | Pilot | Ground | Checker |
|---|---|---|---|---|
| 1 | `PROPOSE` P1: earliest runway slot, planned gate | Accepts the slot | `REJECT` P1: `GATE_OVERLAP` (planned gate still occupied within `min_turnaround_min`), counter-suggests a later slot or a different gate | P1 fails the gate check, or passes but is below the Ground floor |
| 2 | `PROPOSE` P2: slot and gate moved to resolve Ground's objection | `ACCEPT` (or a soft objection on connections) | `ACCEPT` | P2 passes |

- Ground's reject prunes F: P1 goes on the rejected list and the gate objection becomes a standing constraint. ATC's next proposal must resolve it (monotone concession, verified by code).
- Gate change notice is at least 20 min before arrival (`constraints.xlsx:fuel_and_crew:Gate change notice`).
- Ground-crew overtime (8 h shift, 1.5x after) appears as a soft cost in Ground's score.

**Human step:** all three approve Suggestion 1.

**End state to show:** result card with a gate or slot that differs from what ATC proposed first. Point at the Ground `REJECT` in the timeline that caused the change.

**Talking point:** ATC is the only agent that issues proposals, but Ground's constraint decided the answer. The negotiation goes across organisational boundaries.

---

## Scenario 3: Failure and escalation

**Purpose:** go through every safety layer: checker, fallback, renegotiation, human override.

**Input**
- Same row as Scenario 1.
- Injected event: low fuel on the focus flight (`SYNTHETIC:injected_low_fuel`). Normal usable hold is 15 min (45 min endurance minus 30 min final reserve). The injection reduces it below the weather-driven delay.

**Phase 1**

1. Turn 1: ATC proposes a slot that needs more holding than the fuel now allows.
2. **Checker blocks it** with `FUEL_RESERVE`. The violation goes back to ATC and the rejected proposal still uses its turn.
3. Then one of two branches:
   - **3a. Agents recover inside the phase.** ATC proposes a fuel-priority slot (the focus flight moves up the queue), Pilot and Ground `ACCEPT`, and the checker passes. Status: `AGENT_CONSENSUS`.
   - **3b. A guardrail fires.** Turn cap, no-progress, stalemate, or infeasibility (no safe slot before fuel runs short). The deterministic fallback runs: fuel-critical first, earliest safe slot, otherwise an **alternate airport** (nearest by `airports.csv` coordinates, fuel to reach it plus reserve checked). Status: `FALLBACK`, with a reason code in the log (for example `INFEASIBLE_NO_SAFE_SLOT`).

**Human approval 1:** one human rejects Suggestion 1 and gives a reason (for example the Pilot human: "alternate not acceptable, crew duty would exceed 13 h on the return"). Status: `HUMAN_REJECTED`.

**Phase 2 (final)**
- The rejection reason becomes a standing constraint, and Suggestion 1 goes on the rejected list. F is smaller.
- Same guardrails as phase 1, no larger limits. The result is Suggestion 2.

**Human approval 2:** a second rejection. There is no phase 3. **The humans are pulled into a call** and decide. The `HUMAN_CALL_DECISION` is the final log entry and the log is sealed.

**End state to show**
- The timeline with the checker block, the fallback reason code (if 3b), both human rejections with reasons, and the call decision.
- Violations in any accepted plan: 0.
- Log verification passes.

**Talking point:** the LLMs never get the last word on safety. Code blocks unsafe plans, code guarantees an answer, and humans can override everything.

---

## Demo controls (make the live run repeatable)

| Need | How |
|---|---|
| Fixed rows | Hard-code the three row numbers in the scenario picker. Fill in the `<TBD>` values above once chosen. |
| Checker visibly blocks a proposal in Scenario 3 | ATC normally picks from a shortlist the checker has already filtered, so it cannot propose an unsafe plan. To show a block, apply the fuel injection **after** F is built (a fuel-state update arriving mid-phase). ATC's next proposal is then checked against the new fuel state and fails. |
| Choosing branch 3a or 3b | Set the injected fuel level. A moderate cut leaves safe slots in F, so the agents recover (3a). A severe cut leaves no safe slot, so the infeasibility rule fires the fallback (3b). Choose one branch for the live demo and keep the other as a backup recording. |
| Human rejections | Scripted by the presenter, with the reason typed in live. Say on screen that they are scripted. |
| API failure during judging | The fallback path still produces a suggestion. Keep a recorded backup of all three scenarios. |

## Pass criteria per run

- [ ] Every phase ends within 3 turns, with consensus or fallback.
- [ ] Every fallback carries a reason code.
- [ ] Every value on the result card has a source tag.
- [ ] No accepted plan has a hard-constraint violation.
- [ ] Negotiated delay is lower than do-nothing (Scenarios 1 and 2; for Scenario 3 compare the final decision).
- [ ] Log verification passes.

## Run order and cut order

Show them in order 1 → 2 → 3, so the story escalates from best case to worst case. If time is short, cut Scenario 2 first (as in PRD section 19). Scenarios 1 and 3 are must-shows: Scenario 3 covers the brief's "what to avoid" list.
