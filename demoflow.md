# Demo Flow: Multi-Agent Disruption Negotiation

**Event:** Autonomous SG 2026, Airbus Track, Challenge #2
**Source of truth:** `references/PRD-2.md` (sections 7, 10, 11, 12, 17) for logic; `demo-userflow.md` for screen layout and presenter actions.
**Format:** three scenarios, run live by one presenter on one screen in **Demo mode**, each ending on the result card (runway, gate, ETA, delay) and a passing log verification.

---

## What the three scenarios prove together

| | Scenario 1: Happy path | Scenario 2: Ground-driven | Scenario 3: Failure and escalation (3b) |
|---|---|---|---|
| Disruption | Weather + late aircraft at ORD | Late aircraft at a gate-constrained hub | Scenario 1 + injected **severe** low fuel |
| Agent whose domain binds | ATC (runway throughput cut by weather), Pilot soft objection | Ground (gate availability) | Pilot (fuel reserve), then Pilot and Ground humans |
| Exit path | `AGENT_CONSENSUS` in turn 2 | `AGENT_CONSENSUS` in turn 2, steered by Ground's reject | Checker block → `FALLBACK` (`INFEASIBLE_NO_SAFE_SLOT`) in both phases |
| Human outcome | 3/3 approve Suggestion 1 | 3/3 approve Suggestion 1 | Pilot rejects S1 (MDW), Ground rejects S2 (MKE), human call picks MKE |
| Output type | Revised arrival time + gate | Revised gate (and arrival time) | Revised flight plan: divert to MKE |
| Safety layers shown | Checker passes, tamper-evident log | Checker passes, reject pruning | Checker, fallback, renegotiation, human override |

Each agent gets one scenario where its constraint decides the outcome. That answers the question "is this just ATC with two rubber stamps?"

---

## Screen and controls (see `demo-userflow.md` for detail)

- **One presenter, one screen.** All three approval panels (Pilot, ATC, Ground) are visible side by side.
- **Demo / User toggle** in the header, default **Demo**.
  - Demo: three preset buttons (**S1 Happy path**, **S2 Ground-driven**, **S3 Low fuel**), scripted reject reasons pre-filled (not labelled on screen), **Replay recorded run** button, tamper demo on S1.
  - User: full picker (airport → delay type → row → low fuel off / moderate / severe). Lets a judge pick any row.
- **Live streaming** of real agent calls, no artificial pacing. The timeline is a scrollable history: auto-scroll pauses while you read back, a **"↓ new messages"** pill jumps to the latest, a **"thinking…"** indicator shows which agent is mid-call.
- **Message cards** are compact one-liners; click to expand rationale, score vs floor and source chips. Checker pass/fail is always shown inline.
- **Run history chips** in the header. Clicking one restores that run's full timeline. Do not restart the backend between scenarios (runs live in memory).

---

## Common setup (all scenarios)

1. Presenter clicks the scenario preset. A run chip appears in the header.
2. The disruption injector turns the row into typed events:
   - `WEATHER_DELAY` → runway capacity cut to 50% of `max_runway_ops_per_hour` for the delay duration (`ASSUMPTION:weather_factor`).
   - `LATE_AIRCRAFT_DELAY` → the inbound aircraft holds its gate past schedule.
3. The arrival queue is built from real `flights.csv` arrivals at the same airport within the window around the focus flight.
4. The checker enumerates the feasible set F (runway × slot × gate) and the code scores each candidate for ATC, Pilot and Ground.
5. Pilot sends `ARRIVAL_REQUEST`. ATC sends `INFO_REQUEST` to Ground and gets `INFO_RESPONSE` (gate availability, crew status).
6. Discussion phase 1 starts. Max 3 turns, one structured message per agent per turn.

**Human approval (all scenarios):** when a suggestion lands, the result card, baseline panel and three approval panels activate. Nothing happens until **all three** roles have approved or rejected (reject needs a reason). All approve → `HUMAN_APPROVED`. Any reject → **phase 2 starts automatically**, with every reason as a standing constraint, shown in a phase divider. Any reject of Suggestion 2 → **human call panel**.

**On seal:** the log is verified automatically ("Log chain verified ✓ (N entries)") with a JSONL download.

On screen throughout: source tag on every value (`flights.csv:…`, `constraints.xlsx:…`, `ASSUMPTION:…`, `SYNTHETIC:…`) and checker results inline.

---

## Scenario 1: Happy path

**Purpose:** show the core loop, the best case, and that the log is tamper-evident.

**Input**
- Airport: ORD (`constraints.xlsx:airport_capacity:ORD`: 4 runways, 150 gates, 90 ops/h, 45 min turnaround, 3 spare gates).
- Row: `flights.csv` row `<TBD>` with `WEATHER_DELAY` about 30 to 120 min **and** `LATE_AIRCRAFT_DELAY > 20`. Arrival delay under 800 min.
- Effective capacity during the weather window: 45 ops/h.

**Expected flow**

| Turn | ATC | Pilot | Ground | Checker |
|---|---|---|---|---|
| 1 | `PROPOSE` P1 (runway, slot, gate from the top-3 shortlist) | `REJECT`: holding below Pilot floor (soft objection, score cited) | Position: gate status, crew shift | P1 passes |
| 2 | `PROPOSE` P2 (revised to address the Pilot objection) | `ACCEPT` | `ACCEPT` | P2 passes |

- Consensus: all three `ACCEPT` the same proposal hash and the checker passes, so the status is `AGENT_CONSENSUS`.
- Consensus in **turn 2, not turn 1**, so the audience sees a revision.

**Human step:** Pilot, ATC and Ground humans all approve Suggestion 1. Status: `HUMAN_APPROVED`.

**End state to show**
- Result card: runway, gate, ETA, delay, each with its source tag.
- Baseline panel: do-nothing vs fallback vs negotiated (negotiated highlighted).
- Log badge green automatically.
- **Tamper demo (S1 only):** click **Tamper with log** → Verify → red "Chain broken at entry #k" → **Reset** → green.

**Talking point:** three separate agents with separate prompts and model calls reached a checked plan within the organiser's 3-turn limit, every number is traceable, and the log cannot be edited without detection.

---

## Scenario 2: Ground-driven

**Purpose:** show that each agent's domain matters and the negotiation is not ATC dictating.

**Input**
- Row: `flights.csv` row `<TBD>`, late-aircraft dominant (`LATE_AIRCRAFT_DELAY` large, `WEATHER_DELAY` small or 0), at a hub where gates are the binding constraint.
- "Gate-constrained" has to come from the queue, not the workbook: every large hub in `airport_capacity` has the same 150 gates and 3 spare gates. Choose a window where several late inbounds are holding gates, so the spare gates (3) are used up around the focus flight's arrival. A medium hub (MDW: 70 gates, 3 spare, 35 min turnaround) works as well.

**Expected flow**

| Turn | ATC | Pilot | Ground | Checker |
|---|---|---|---|---|
| 1 | `PROPOSE` P1: earliest runway slot, planned gate | `ACCEPT` | `REJECT` P1: `GATE_OVERLAP` (planned gate still occupied within `min_turnaround_min`), counter-suggests a different gate | P1 passes but is below the Ground floor |
| 2 | `PROPOSE` P2: slot and gate moved to resolve Ground's objection | `ACCEPT` | `ACCEPT` | P2 passes |

- Ground's reject prunes F: P1 goes on the rejected list and the gate objection becomes a standing constraint. ATC's next proposal must resolve it (monotone concession, verified by code).
- Gate change notice is at least 20 min before arrival (`constraints.xlsx:fuel_and_crew:Gate change notice`).
- Ground-crew overtime (8 h shift, 1.5x after) appears as a soft cost in Ground's score.

**Human step:** all three approve Suggestion 1. No tamper demo.

**End state to show:** result card with a gate that differs from ATC's first proposal. Scroll back and expand the Ground `REJECT` that caused the change. Optionally click the S1 run chip to contrast.

**Talking point:** ATC is the only agent that issues proposals, but Ground's constraint decided the answer. The negotiation goes across organisational boundaries.

---

## Scenario 3: Failure and escalation (branch 3b, live)

**Purpose:** go through every safety layer: checker, fallback, renegotiation, human override.

**Input**
- Same row as Scenario 1.
- Injected event: **severe** low fuel on the focus flight (`SYNTHETIC:injected_low_fuel`). Normal usable hold is 15 min (45 min endurance minus 30 min final reserve). The injection reduces it below the time to the earliest available slot.
- The injection is applied **after** F is built, as a mid-phase fuel-state update, so the checker visibly blocks a proposal.

**Phase 1**

1. Mid-phase System message: fuel-state update for the focus flight.
2. ATC proposes a slot that needs more holding than the fuel now allows. **Checker blocks it** with `FUEL_RESERVE`. The rejected proposal still uses its turn.
3. Infeasibility rule fires: no safe ORD slot. **`FALLBACK` · `INFEASIBLE_NO_SAFE_SLOT`**: fuel-critical first, otherwise nearest alternate by `airports.csv` coordinates, with fuel to reach it plus reserve checked. **Suggestion 1 = divert to MDW** (`constraints.xlsx:airport_capacity:MDW`: medium hub, 3 runways, 70 gates, 60 ops/h).
4. Baseline: do-nothing at ORD shows a red `FUEL_RESERVE` violation.

**Human approval 1 (scripted):** the **Pilot** human rejects Suggestion 1; ATC and Ground approve.
> "MDW is 17 mi from ORD and under the same weather cell. Diverting there risks a second hold on fuel we don't have."

Status: `HUMAN_REJECTED`.

**Phase 2 (final)**
- The rejection becomes a standing constraint: alternate must be outside the weather radius (`ASSUMPTION:shared_weather_radius`, about 50 mi). MDW joins the rejected list.
- ORD is still infeasible, so the fallback picks the next-nearest qualifying alternate: **Suggestion 2 = divert to MKE** (`constraints.xlsx:airport_capacity:MKE`: small hub, 2 runways, 30 gates, 36 ops/h, 2 spare gates). Checker passes.

**Human approval 2 (scripted):** the **Ground** human rejects Suggestion 2; Pilot and ATC approve.
> "MKE is a small hub with only 2 spare gates, both committed at the ETA. Handling an unplanned diversion would push the ground crew past their 8 h shift into 1.5x overtime."

Sources: `constraints.xlsx:airport_capacity:MKE:spare_gates`, `constraints.xlsx:fuel_and_crew:Ground crew shift`.

**Human call:** there is no phase 3. The human call panel opens (📞 banner) with S1 (MDW) and S2 (MKE) side by side, each with the rejection it received. The presenter picks **S2 (MKE)** with the note:
> "Accept MKE; ops to call in extra ground crew, overtime approved."

`HUMAN_CALL_DECISION` is the final log entry and the log is sealed.

**End state to show**
- The timeline with the checker block, the fallback reason code in both phases, both human rejections with reasons, and the call decision.
- Baseline: do-nothing at ORD (red violation) vs S1 MDW vs S2 MKE vs final call.
- Violations in any accepted plan: 0.
- Log verification passes.

**Talking point:** the LLMs never get the last word on safety. Code blocks unsafe plans, code guarantees an answer, and humans can accept a cost (overtime) the agents would not trade, without touching safety.

**Backup branch 3a** (moderate fuel cut, agents recover inside the phase with a fuel-priority slot): kept as a recorded run, and runnable live from User mode with low fuel = moderate.

---

## Demo controls (make the live run repeatable)

| Need | How |
|---|---|
| Fixed rows | Demo-mode presets hard-code the rows (`web/src/lib/demo.ts`). Fill in the `<TBD>` values above once chosen. |
| Checker visibly blocks a proposal in Scenario 3 | Fuel injection applied **after** F is built (mid-phase fuel-state update). |
| Choosing branch 3a or 3b | S3 preset is fixed to **severe** (3b). Moderate (3a) is available in User mode. |
| Human rejections | Demo mode pre-fills the scripted reasons, with no "scripted" label on screen. The presenter still clicks each decision. |
| API failure during judging | The fallback path still produces a suggestion. Each preset's last clean run is saved in the browser; **Replay recorded run** plays it back, labelled "Recorded". Record all three (and 3a) before judging, on the presenting laptop. |
| Judge asks for another row | Flip to User mode and run it. |

## Pass criteria per run

- [ ] Every phase ends within 3 turns, with consensus or fallback.
- [ ] Every fallback carries a reason code.
- [ ] Every value on the result card has a source tag.
- [ ] No accepted plan has a hard-constraint violation.
- [ ] Negotiated delay is lower than do-nothing (Scenarios 1 and 2; for Scenario 3 compare the final decision).
- [ ] Log verification passes.

## Run order and cut order

Show them in order 1 → 2 → 3, so the story escalates from best case to worst case. If time is short, cut Scenario 2 first (as in PRD section 19). Scenarios 1 and 3 are must-shows: Scenario 3 covers the brief's "what to avoid" list.
