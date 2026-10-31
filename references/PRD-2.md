# PRD: Multi-Agent Disruption Negotiation for Air Traffic Management

**Event:** Autonomous SG 2026, Airbus Track, Challenge #2
**Date:** 31 Oct 2026 | **Build window:** 10:15 to 16:15 (SGT) | **Submission:** boardingpass.work/experience (include table number)
**Status:** Draft v3 (organiser clarifications and constraints workbook applied)

---

## Challenge Brief (organiser, verbatim)

> **"How might AI help air traffic controllers, pilots and ground operations staff make faster and better decisions?"**

**Description.** Today, when a runway closes, weather delays occur or ground equipment fails, communication relies on phone calls and manual software updates, leading to cascading delays, excessive holding patterns and fuel burn. The future of Air Traffic Management relies on AI assistants that negotiate trade-offs across organisational boundaries.

**Want to see.** A Multi-Agent Communication Framework where ATC, Pilot and Ground Ops AI agents negotiate resolutions to real-time disruptions without human intervention until a consensus is reached.

- **ATC agent:** runway wake separation, taxiway blockage, maximise sector throughput
- **Pilot agent:** preserve fuel reserves, flight safety, minimise turbulence, protect passenger connections
- **Ground agent:** optimise gate use, avoid ground-crew overtime, minimise turnaround delays

Agents exchange structured messages, check cross-domain constraints explicitly, keep a traceable consensus log, and have a deterministic non-AI fallback.

**What to avoid.**
- Combining the 3 roles into a single prompt call.
- Endless, unconstrained agent loops with no convergence logic or turn limit.
- Accepting solutions that ignore safety margins or operational constraints.

**Provided data.**
- US Department of Transportation 2015 flight delays and cancellations (Challenge 2 folder): `airlines.csv`, `airports.csv`.
- `flights.csv` was missing and is now added: `flights.csv` (358,774 rows, 38.6 MB). It keeps only rows with `WEATHER_DELAY > 15` or `LATE_AIRCRAFT_DELAY > 20`.
- New: `challenge2_operational_constraints.xlsx`. Gates, runways, runway movements per hour and minimum turnaround per airport; wake separation; fuel reserves; crew duty limits.
- Demonstrate how agents negotiate a revised arrival time, gate assignment, or flight plan adjustment within 3 turns.

**Clarifications (Challenge #2).**
- **Input.** Pick any row of `flights.csv`; that row is the disruption you pass to the 3 agents.
- **One turn** = each of the 3 agents sends one structured message. Reach consensus within 3 turns. With no agreement after 3 turns, the deterministic fallback decides and the log says why.
- **Missing operational data.** The DOT data has no gates, runways, fuel or crew. Use the new constraints workbook. Its values are synthetic planning limits scaled from traffic; you may replace them with cited real figures.
- **Output.** A revised arrival time, gate or flight plan, with the full consensus log.

---

## 1. Problem

When a runway capacity drops (weather) or a late inbound blocks a gate, coordination between ATC, pilots and ground operations relies on phone calls and manual updates. This causes cascading delays, excess holding and excess fuel burn.

## 2. Product Summary

A multi-agent framework in which three independent AI agents (ATC, Pilot, Ground) exchange structured messages, check cross-domain constraints and converge on a single arrival plan. A deterministic checker blocks unsafe plans, a non-AI fallback guarantees an answer, and three humans approve before anything is final. Every decision is traceable.

## 3. Goals

| ID | Goal |
|---|---|
| G1 | Three agents with separate prompts and separate model calls negotiate a resolution to a real disruption taken from the provided dataset. |
| G2 | No unsafe plan can be accepted. Hard constraints are enforced in code, not by prompts. |
| G3 | Consensus within 3 turns (one turn = each of the 3 agents sends one structured message). With no agreement after 3 turns, the deterministic fallback decides and the log says why. Team layer on top: max 2 discussion phases; a second human rejection ends in a human call. |
| G4 | Every value in every proposal is cited to a dataset column or labelled `SYNTHETIC`. |
| G5 | A tamper-evident log records the full negotiation. |
| G6 | Output four values: **runway, gate, ETA, delay**. |

## 4. Non-Goals

- Real ATC operational use or certification.
- Ground equipment failure as an input type (no signal in the data). Stretch only.
- Multi-aircraft optimisation across the whole airport. The MVP resolves one focus flight within a small arrival queue.
- Real-time data feeds.

## 5. Users

| Role | Interacts via |
|---|---|
| Pilot (human) | Approval button for pilot side |
| ATC controller (human) | Approval button for ATC side |
| Ground ops (human) | Approval button for ground side |
| Judges / demo audience | Web view of negotiation, log and outputs |

## 6. Data

| File | Used for |
|---|---|
| `flights.csv` (358,774 rows, 2015 US DOT) | Disruption trigger and baseline values: `AIRLINE`, `FLIGHT_NUMBER`, `TAIL_NUMBER`, `ORIGIN_AIRPORT`, `DESTINATION_AIRPORT`, `SCHEDULED_ARRIVAL`, `ARRIVAL_DELAY`, `WEATHER_DELAY`, `LATE_AIRCRAFT_DELAY`, `TAXI_IN`, `AIR_TIME`, `DISTANCE` |
| `airlines.csv` | Airline name lookup |
| `airports.csv` | Airport name, location. Three airports (ECP, PBG, UST) lack coordinates and are excluded. |
| `challenge2_operational_constraints.xlsx` | Organiser-supplied limits. Sheets: `airport_capacity` (size class, active runways, gates, max runway ops per hour, min turnaround, spare gates), `wake_separation`, `fuel_and_crew`, `rules_of_play`. Values are SYNTHETIC planning limits scaled from traffic; any limit we change must be stated in the demo. |

**Input rule (organiser):** pick one row of `flights.csv` with `WEATHER_DELAY > 15` or `LATE_AIRCRAFT_DELAY > 20`. That row is the disruption passed to the 3 agents. For demos we prefer rows with both (9,487 in the file) at a large hub (ORD, DFW, ATL), with weather delay roughly 30 to 120 minutes. Rows above 800 minutes are overnight sits and are excluded from the demo.

**Source tags:** values from the workbook are tagged `constraints.xlsx:<sheet>:<key>:<column>`. The workbook gives counts (runways, gates), not identifiers, so runway and gate identifiers (for example RWY-2, G-073) are generated and tagged `SYNTHETIC:generated_id`.

**Team assumptions (not in the data; must be stated in the demo and tagged `ASSUMPTION`):**
- Aircraft class: widebody (wake class Heavy) if `DISTANCE` is 1,500 miles or more, otherwise narrowbody (wake class Large).
- Weather capacity reduction: runway ops per hour cut to 50% of `max_runway_ops_per_hour` for the weather-delay duration.
- Flight crew report time: 60 minutes before scheduled departure.
- Spare fuel: the workbook's "45 minutes of holding" is read as total holding endurance on arrival, so usable hold before touching the 30-minute final reserve is 15 minutes.
- Other arrivals in the queue: real flights from `flights.csv` landing at the same airport within a window of the focus flight's scheduled arrival.
- Connecting passengers and connection times: synthetic, seeded from the flight row.

## 7. User Flow

1. **Trigger.** A scenario row is selected. The disruption injector creates a typed event (runway capacity reduction for the weather delay duration, plus a late inbound occupying a gate).
2. **Pilot initiates.** The Pilot agent sends an `ARRIVAL_REQUEST` with position, fuel state and connection needs.
3. **ATC collects.** ATC requests and receives ground details (gate availability, crew status).
4. **Discussion phase 1.** The three agents discuss for up to 3 turns until a solution is reached (agent consensus, checker passed). With no agreement after 3 turns, or if another guardrail is hit, the deterministic fallback decides and the log records why (for example `NO_CONSENSUS_AFTER_3_TURNS`). Disagreement between agents never triggers a renegotiation.
5. **Human approval 1.** Pilot, ATC and Ground humans each approve or reject Suggestion 1. If all three approve, go to step 8.
6. **Discussion phase 2 (final).** Any human rejection starts the one and only renegotiation. The rejection reasons become new constraints. Same rules as phase 1, ending in Suggestion 2.
7. **Human approval 2.** The humans review Suggestion 2. If all three approve, go to step 8. If any rejects, there is no further discussion: the **humans are pulled into a call** and decide. The decision is logged as the final entry.
8. **Conclusion.** Final output: runway, gate, ETA, delay. The log is sealed.

### Discussion phase
A discussion phase is one bounded exchange between the agents. There are at most 2 per scenario, and each lasts at most **3 turns**. **One turn = each of the 3 agents sends one structured message** (9 messages maximum per phase). Turn 1: ATC posts a proposal, Pilot and Ground post their constraints and positions. Turns 2 and 3: ATC posts a revised proposal, and Pilot and Ground respond to the previous proposal with `ACCEPT` or `REJECT`. Consensus is checked at the end of every turn. A phase ends on whichever exit fires first. All exits are enforced by the orchestrator in code, never by agent prompts.

**Success exit**
- All three agents `ACCEPT` the same ATC proposal **and** the checker passes.

**Hard stops** (phase ends with no solution; the fallback solver produces the suggestion)
1. **Turn cap:** 3 turns per phase (organiser rule). Checker-rejected proposals and malformed responses still use their turn.
2. **Wall-clock cap:** 90 seconds per phase.
3. **Token budget:** a per-phase cap on total tokens.
4. **Per-call timeout:** an agent that does not respond in time is recorded as `REJECT` with reason `NO_VALID_RESPONSE`.

**Early exits** (stop before the caps are reached)
5. **No-progress rule:** ATC proposes the same plan (same proposal hash) twice, or two consecutive proposals fail the same checker constraint.
6. **Stalemate rule:** the same agent raises the same objection on two consecutive proposals and ATC's revision does not change the thing objected to.
7. **Infeasibility rule:** the checker finds no combination of runway, slot and gate that satisfies the hard constraints. The fallback runs immediately and may suggest an alternate airport.

**Always enforced**
- Only ATC can issue proposals.
- Agent messages must match the schema, or they count as invalid.
- At most 2 phases per scenario; phase 2 uses the same guardrails as phase 1, not larger ones.
- All limits are config values. Defaults above.

### Convergence logic (proposed)

The exit rules above stop a bad discussion. This logic makes a good one converge. The principle: every message must shrink the search space, so the discussion cannot circle.

1. **Candidate set from code.** Before a phase starts, the checker enumerates the feasible set F: every (runway, landing slot, gate) combination that passes all hard constraints. The agents negotiate only inside F. The LLMs choose among options, they do not invent them.
2. **Deterministic scoring.** Code computes a domain score (0 to 100) for each candidate from each agent's soft objectives: ATC (throughput), Pilot (holding time, connections), Ground (gate churn, turnaround). Each agent has a **floor**, a minimum domain score it can accept. Hard-constraint violations are never traded against scores.
3. **ATC proposes from a short list.** Code ranks candidates in F by joint score (weighted sum of the three domain scores, default equal weights) and gives ATC the top 3 that satisfy every floor and objection recorded so far. ATC picks one and writes the rationale.
4. **Valid responses only.**
   - `ACCEPT` is valid only if the proposal passes the checker and the agent's domain score is at or above its floor. Otherwise it is treated as invalid.
   - `REJECT` must cite either a hard constraint or a domain score below the floor, with the number. An unjustified reject is `NO_VALID_RESPONSE`.
5. **Every reject prunes.** A rejected proposal goes onto a rejected list and can never be proposed again. The cited objection becomes a standing constraint on F (for example "gate B14 unavailable after 17:30" or "Pilot score must be at least 60"). F strictly shrinks each time.
6. **Monotone concession.** ATC's next proposal must (a) be in the shrunk F, (b) resolve the cited objection, verified by code, and (c) score at least as well for the rejecting agent as the rejected proposal did. This stops ATC from bouncing between positions.
7. **Soft-floor relaxation (optional, config).** Soft floors drop by a fixed step at the start of turn 2 and turn 3, so a near-miss can close. Hard constraints and the fuel reserve are never relaxed.
8. **Consensus.** All three `ACCEPT` the same proposal hash, valid under rule 4, and the checker passes. The plan becomes `AGENT_CONSENSUS`.
9. **Termination guarantee.** F is finite and shrinks with every reject. Together with the 3-turn, time and token caps, a phase always ends. If F becomes empty, the infeasibility rule fires and the fallback runs.
10. **Phase 2.** The human rejection reasons from Suggestion 1 are added as standing constraints, and Suggestion 1 joins the rejected list. Phase 2 starts with a smaller F, so it converges faster.
11. **Fallback shares the same logic.** The fallback takes the same F and floors and picks deterministically (section 11), so a fallback suggestion is always one the agents could have reached.

### Plan status flow
`PROPOSED` then `AGENT_CONSENSUS` or `FALLBACK`, then `HUMAN_APPROVED` or `HUMAN_REJECTED`. Only `HUMAN_APPROVED` (or a logged human call decision) produces the final output.

## 8. Agents

Each agent is a separate model call with its own system prompt, private state and tool-forced JSON output. Agents see only the shared message history, not each other's private objectives.

| | ATC (lead) | Pilot | Ground |
|---|---|---|---|
| Objectives | Wake separation, taxiway blockage, sector throughput | Fuel reserves, flight safety, minimal turbulence, passenger connections | Gate utilisation, avoid crew overtime, minimal turnaround delay |
| Hard constraints (checker-enforced) | Minimum wake separation by weight class pair; runway open and not occupied; taxiway route clear | Landing fuel at or above final reserve plus contingency; no diversion below safe fuel | Gate free for occupancy window; crew duty within limit |
| Soft objectives (scored) | Arrivals per hour | Holding time, connection protection | Gate churn, turnaround delay |
| Can propose | Runway, slot time, hold or vector | Counter-suggestion inside a `REJECT` | Counter-suggestion inside a `REJECT` |

ATC alone issues official proposals. The other agents can veto on hard-constraint grounds and suggest changes, but cannot issue a competing proposal.

## 9. Message Schema

All messages are JSON, validated against a schema before delivery.

```json
{
  "msg_id": "uuid",
  "phase": 1,
  "turn": 1,
  "sender": "ATC|PILOT|GROUND|CHECKER|SYSTEM",
  "type": "ARRIVAL_REQUEST|INFO_REQUEST|INFO_RESPONSE|PROPOSE|ACCEPT|REJECT|CHECK_RESULT|FALLBACK|HUMAN_APPROVE|HUMAN_REJECT|HUMAN_CALL_DECISION",
  "proposal": {
    "proposal_id": "hash",
    "runway": {"value": "RWY-2", "source": "constraints.xlsx:airport_capacity:ORD:active_runways (id SYNTHETIC:generated_id)"},
    "gate": {"value": "G-073", "source": "constraints.xlsx:airport_capacity:ORD:gates (id SYNTHETIC:generated_id)"},
    "eta": {"value": "17:42", "source": "flights.csv:SCHEDULED_ARRIVAL + delay"},
    "delay_min": {"value": 27, "source": "flights.csv:WEATHER_DELAY"}
  },
  "violated_constraint": "FUEL_RESERVE|WAKE_SEP|GATE_OVERLAP|CREW_DUTY|NO_VALID_RESPONSE|null",
  "suggestion": {},
  "rationale": "string",
  "prev_hash": "sha256",
  "hash": "sha256"
}
```

## 10. Constraint Checker (deterministic, no LLM)

Runs on every proposal before agents respond. All limits are config values with defaults, documented as simplified for the demo.

| Check | Rule (default) |
|---|---|
| Wake separation | Minimum gap by leader/follower class from sheet `wake_separation`: Super to Heavy, Large or Small 180 s; Heavy to Heavy, Large or Small 120 s; Large to Small 60 s; any other pair 60 s. The sheet labels the time column "same runway departures" but tells us to use these numbers for the ATC agent, so we apply them to arrivals and state that in the demo. |
| Runway throughput | Operations per hour at or below `max_runway_ops_per_hour` for the airport, cut by the weather factor (assumption: 50%) during the disruption. Runway chosen from `active_runways`. |
| Fuel | Landing fuel at or above the final reserve (30 min of holding fuel) plus contingency (5% of trip fuel). Holding burn: 2,400 kg/h narrowbody, 6,500 kg/h widebody. Usable hold before touching the reserve: 15 min (see assumptions). |
| Gate | Gate count and `spare_gates_at_any_time` from `airport_capacity`; no overlap within `min_turnaround_min`; gate change notice at least 20 min before arrival. |
| Crew duty | Flight crew within 13 hours from report time (assumption: 60 min before scheduled departure). Ground crew shift 8 hours; overtime costs 1.5x after that (soft cost in Ground score). |
| Connections | Flagged as soft score, not a hard block. Synthetic data. |

A proposal failing any hard check is auto-rejected and the specific violation is passed back to ATC.

## 11. Deterministic Fallback

A non-AI solver, run as a single deterministic pass (it has no rounds). Triggered by: a guardrail hit in a discussion phase with no solution, API failure, or schema failure. In order:

1. Discard any option that fails a hard safety check.
2. Fuel-critical flights go first (threshold in config; lowest remaining fuel first).
3. Landing slot: earliest safe slot, with flights kept in original scheduled order (ration-by-schedule). Stable tie-break: priority, scheduled time, flight number.
4. Gate: keep the planned gate if free, otherwise the lowest-numbered free gate (the workbook gives gate counts only, so there is no terminal or zone data to define "nearest"). Gate change notice must be at least 20 minutes before arrival.
5. If no safe slot exists before fuel runs short, suggest an alternate airport (nearest by `airports.csv` coordinates; fuel to reach it plus final reserve is a hard check; alternate availability is `SYNTHETIC`). This is a suggestion that goes through human approval.
6. Send the result to all three humans for approval.
7. If any human rejects, follow the renegotiation and call rules in section 7.

The fallback passes through the same checker. The log records which path (agent consensus or fallback) produced each suggestion.

## 12. Human Approval

Three independent approve or reject controls (Pilot, ATC, Ground), with a required reason on reject. All three must approve. A rejection of Suggestion 1 triggers the single renegotiation, with the reasons passed to the agents as new constraints. A rejection of Suggestion 2 triggers the human call. Humans see the suggestion, source tags, checker results and which path (consensus or fallback) produced it.

## 13. Logging and Citation

- Append-only JSONL, each entry carries the previous entry's hash (hash chain).
- Logs messages, checker results, fallback activation, human decisions, and model name and token use per call.
- A verify command re-computes the chain and reports tampering.
- Every proposal field has a `source`, either `flights.csv:<column>:row<N>`, `airports.csv:<column>`, `constraints.xlsx:<sheet>:<key>:<column>`, `ASSUMPTION:<name>` or `SYNTHETIC:<name>`.

## 14. Interface

Minimum viable web view:
1. Scenario picker (filter and row).
2. Live negotiation timeline: discussion phases, messages, checker results.
3. Result card: runway, gate, ETA, delay, with source tags.
4. Three approval buttons.
5. Baseline comparison panel: do-nothing vs deterministic fallback vs negotiated (total delay, holding minutes, estimated fuel, violations).
6. Log verification status.

## 15. Technical Approach

- Language: Python. Orchestrator, checker and fallback are plain code.
- Agents: Claude API, small model for speed and cost, one call per agent per message, tool-forced JSON.
- Limits: max 2 discussion phases, 3 turns per phase, per-phase time and token caps, per-call timeout, one retry on malformed output.
- Storage: JSONL log and in-memory state. No database.
- UI: lightweight web page reading the log.
- Budget: $50 per participant. Expected spend is cents per scenario. Log token usage.

## 16. Success Criteria

| Metric | Target |
|---|---|
| Hard-constraint violations in accepted plans | 0 |
| Negotiation termination | 100% within 3 turns per phase (consensus or fallback), at most 2 phases |
| Fallback reason logged | 100% of fallback decisions carry a reason code |
| Fields with a source tag | 100% |
| Log chain verification | Passes |
| Negotiated vs do-nothing delay | Lower on all demo scenarios |
| Demo scenarios | 3 |

## 17. Demo Plan

1. **Scenario 1:** ORD row with weather plus late-aircraft delay. Agents converge, humans approve.
2. **Scenario 2:** late-aircraft-dominant row at a gate-constrained hub. Ground agent drives the outcome.
3. **Scenario 3:** Scenario 1 with injected low fuel. An unsafe proposal is blocked by the checker. The agents either recover within the phase or a guardrail hits and the fallback produces the suggestion. A human rejects Suggestion 1, phase 2 runs, and a second rejection ends in the human call.

## 18. Timeline (31 Oct)

| Time | Milestone |
|---|---|
| 13:15 to 14:15 | Workbook loader, checker, candidate enumerator and scoring, fallback, hash-chained log |
| 14:15 to 15:00 | Three agents, orchestrator, 3-turn discussion loop |
| 15:00 to 15:30 | Human approval layer, web view, log download, baseline comparison |
| 15:30 to 15:50 | Run three scenarios, fix, record backup demo, README (list every changed limit and assumption) |
| 15:50 to 16:15 | Submit (target 16:00, deadline 16:15 sharp) |

## 19. Risks

| Risk | Mitigation |
|---|---|
| Synthetic data seen as fabrication | Label every synthetic value on screen and in the log |
| Agents loop or drift | Per-phase guardrails, schema-validated messages, fallback |
| LLM accepts an unsafe plan | Checker is code and runs before acceptance counts |
| API failure during judging | Fallback path plus recorded backup demo |
| Time overrun | Cut order: web view polish, then Scenario 2, then baseline panel. Never cut checker, log or fallback. |
| Single-table submission rule | Submit once, include table number |

## 20. Open Questions

1. Confirm the fuel reading: 45 min spare holding endurance minus the 30 min final reserve leaves 15 min usable hold. Delays longer than that force ground delay at origin, speed or flight plan adjustment, or an alternate airport.
2. Weather capacity reduction factor (default 50%).
3. Aircraft class rule (default: widebody at 1,500 miles or more).
4. Flight crew report time (default: 60 min before scheduled departure).
5. Demo airport (default: ORD: 4 runways, 150 gates, 90 ops per hour, 45 min turnaround).
6. Is the web view required, or is a CLI plus log viewer acceptable?
7. Preferred model for agents (default: small, fast Claude model).
8. Keep the human approval layer on top of the organiser flow? Default: yes, built after the core 3-turn flow.
