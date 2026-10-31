# Demo User Flow: Multi-Agent Disruption Negotiation

**Event:** Autonomous SG 2026, Airbus Track, Challenge #2
**Status:** Agreed in grilling session, 31 Oct 2026
**Builds on:** `demoflow.md` (scenario logic) and `references/PRD-2.md` (sections 7, 12, 13, 14, 17). Where this file and `demoflow.md` differ, this file wins on UI and user flow.

---

## 1. Decisions at a glance

| # | Topic | Decision |
|---|---|---|
| 1 | Who operates | One presenter, one screen. All three approval panels (Pilot, ATC, Ground) visible side by side. |
| 2 | Negotiation playback | Live streaming of real agent calls, no artificial pacing. Full timeline stays scrollable. |
| 3 | Starting a run | Demo / User mode toggle (see section 2). |
| 4 | Modes | One app, header toggle, defaults to Demo. Engine is identical in both modes. |
| 5 | Human approval | All three roles decide before anything happens. Any reject → phase 2 starts automatically with all reasons as constraints. |
| 6 | Human call | Panel compares S1 and S2; presenter picks one and types a required note. No free-entry plans. |
| 7 | Log verification | Auto-verify badge on seal + JSONL download. Tamper demo in Scenario 1 only. |
| 8 | Moving between scenarios | Run history chips in the header; clicking one restores the full run. |
| 9 | Scenario 3 branch | 3b (fallback to alternate) live, single S3 button. 3a kept as recorded backup. |
| 10 | 3b Suggestion 2 | Next-nearest alternate: S1 = MDW, S2 = MKE. |
| 11 | Scripted rejections | Pilot rejects MDW (shared weather), Ground rejects MKE (spare gates + overtime). Human call picks MKE. |
| 12 | Timeline messages | Compact cards, click to expand. Checker result inline. |
| 13 | Baseline panel | Appears with Suggestion 1, updates on final decision. S3 uses a custom comparison. |

---

## 2. Modes

A **Demo / User** toggle in the header, defaulting to **Demo**. Not the same as the dev-only `mock` vs `http` API switch (`web/src/lib/api/mock.ts` vs `http.ts`): Demo mode always talks to the real backend.

| | Demo mode | User mode |
|---|---|---|
| Start a run | Three preset buttons: **S1 Happy path**, **S2 Ground-driven**, **S3 Low fuel**. Rows fixed, S3 has severe low fuel injected (branch 3b). | Picker: airport → delay type (`weather_late` / `late_only`) → row → "Inject low fuel" checkbox (moderate / severe) → Start. |
| Reject reasons | Pre-filled with the scripted text; panel labelled **"Scripted for demo"**. | Empty, typed by hand. |
| API failure | **"Replay recorded run"** button plays a saved event stream, labelled **"Recorded"**. | No replay; real error or fallback result shown. |
| Tamper button | Shown on Scenario 1 only. | Hidden. |
| Agents, checker, fallback, log | Live, identical. | Live, identical. |

Use: run Demo mode for the pitch. If a judge asks "does it only work on these rows?", switch to User mode and run their row.

---

## 3. Screen layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ AeroClear   [Demo | User]   Runs: [S1 ✓ approved] [S2 ✓] [S3 📞 call]      │
├──────────────────────────────────────────────────────────────────────────┤
│ Start: [S1 Happy path] [S2 Ground-driven] [S3 Low fuel]   (Demo mode)    │
├───────────────────────────────────────┬──────────────────────────────────┤
│ NEGOTIATION TIMELINE (scrollable)     │ RESULT CARD                      │
│  ── Phase 1 ──                        │  Runway · Gate · ETA · Delay     │
│  [ATC] T1 PROPOSE P1 · RWY-2 G-073 …  │  (each with source chip)         │
│     ✓ checker pass                    │  Path: AGENT_CONSENSUS/FALLBACK  │
│  [PILOT] T1 position · fuel 15 min…   │──────────────────────────────────│
│  [GROUND] T1 REJECT · GATE_OVERLAP …  │ BASELINE COMPARISON              │
│  … (ATC thinking…)                    │──────────────────────────────────│
│              [↓ new messages]         │ APPROVALS  Pilot | ATC | Ground  │
│                                       │──────────────────────────────────│
│                                       │ LOG  ✓ verified (N) [Download]   │
└───────────────────────────────────────┴──────────────────────────────────┘
```

### Timeline behaviour
- Events stream in live as the backend produces them.
- Auto-scrolls to newest **unless** the presenter has scrolled up. Then auto-scroll pauses and a **"↓ new messages"** pill appears to jump back.
- A **"thinking…"** indicator shows on the agent whose model call is in progress (covers slow calls).
- **Phase dividers** between phases list the constraints added (e.g. "Phase 2: alternate must be outside weather radius").

### Message cards
- **Collapsed (default):** role badge + colour (ATC / Pilot / Ground / Checker / System / Human), message type, turn (`T2`), one-line summary.
  e.g. `ATC · PROPOSE P2 · RWY-2, G-073, ETA 18:52 (+37 min)` or `Ground · REJECT P1 · GATE_OVERLAP: G-041 occupied until 18:20`.
- **Checker result always inline** under each proposal: green pass or red fail with the violation code.
- **Expanded (click):** full rationale, domain score vs floor (e.g. `Pilot 72 / floor 60`), and every value with its source chip (`flights.csv:…`, `constraints.xlsx:…`, `ASSUMPTION:…`, `SYNTHETIC:…`).

### Run history
- Every run started this session becomes a chip in the header with its end status (`✓ approved`, `📞 human call`, `⟳ running`).
- Clicking a chip restores its timeline, result card, baseline, approvals and log badge (via `subscribe` replaying all events).
- Runs live in backend memory: **do not restart the backend between scenarios**.

---

## 4. Common flow (every scenario)

1. Presenter clicks a scenario button (Demo) or picks a row and clicks Start (User).
2. A new run chip appears. Timeline shows the System message: disruption injected from `flights.csv` row N (with source chips).
3. Pilot `ARRIVAL_REQUEST` → ATC `INFO_REQUEST` → Ground `INFO_RESPONSE`.
4. **Phase 1** streams live: up to 3 turns, checker result inline under each proposal.
5. Phase ends (`AGENT_CONSENSUS` or `FALLBACK` with reason code). **Suggestion 1** appears on the result card, the **baseline panel** appears beside it, and the **three approval panels** activate.
6. Presenter clicks through **Pilot → ATC → Ground**. Each is Approve or Reject; Reject requires a reason.
7. Nothing happens until all three have decided.
   - All approve → `HUMAN_APPROVED` → final output, log sealed.
   - Any reject → **phase 2 starts automatically**. A phase divider lists every rejection reason as a standing constraint; Suggestion 1 joins the rejected list.
8. Phase 2 streams live (same guardrails). **Suggestion 2** appears; approvals reset.
9. All approve → sealed. Any reject → **Human call** (section 5).
10. On seal: UI calls `verify` automatically and shows **"Log chain verified ✓ (N entries)"** plus **Download log (JSONL)**.

---

## 5. Human call panel

- Triggered by any rejection of Suggestion 2. Banner: **"📞 Humans in call: agents are out of the loop."**
- Shows **Suggestion 1 and Suggestion 2 side by side**: runway/airport, gate, ETA, delay, checker result, path (consensus or fallback), and the rejection reasons each received.
- Presenter selects one and types a **required decision note**. Calls `humanCall(runId, chosenSuggestion, note)`.
- Logged as `HUMAN_CALL_DECISION`, the final entry. Log sealed and auto-verified.
- No free-entry plans: every choosable option has passed the checker.

---

## 6. Scenario 1: Happy path

**Button:** S1 Happy path. **Row:** `flights.csv` row `<TBD>` (ORD, `WEATHER_DELAY` 30–120, `LATE_AIRCRAFT_DELAY > 20`, arrival delay < 800).

| Step | What the presenter does | What the audience sees |
|---|---|---|
| 1 | Clicks **S1** | Disruption message; ORD capacity cut 90 → 45 ops/h (`ASSUMPTION:weather_factor`). |
| 2 | Narrates | Phase 1: ATC P1 (checker ✓), Pilot soft objection (e.g. holding below floor), Ground position. T2: ATC P2 revised, Pilot `ACCEPT`, Ground `ACCEPT`. `AGENT_CONSENSUS` in turn 2. |
| 3 | Optional: scrolls back, expands Pilot's T1 message | Score vs floor and source chips showing why P1 was revised. |
| 4 | Points at baseline panel | Do-nothing vs fallback vs negotiated; negotiated highlighted (lower delay, 0 violations). |
| 5 | Approves Pilot, ATC, Ground | `HUMAN_APPROVED`. Result card final. |
| 6 | Log badge turns green automatically | "Log chain verified ✓ (N entries)". |
| 7 | **Tamper demo:** clicks **Tamper with log**, then **Verify** | Badge turns red: "Chain broken at entry #k". |
| 8 | Clicks **Reset** | Badge back to green. |

**Talking point:** three separate agents with separate model calls reached a checked plan within the 3-turn limit; every number is traceable; the log is tamper-evident.

---

## 7. Scenario 2: Ground-driven

**Button:** S2 Ground-driven. **Row:** `flights.csv` row `<TBD>` (late-aircraft dominant, small or zero weather, window where several late inbounds hold gates and spare gates are used up; a medium hub like MDW also works).

| Step | What the presenter does | What the audience sees |
|---|---|---|
| 1 | Clicks **S2** | Disruption message; late inbound holding the planned gate. |
| 2 | Narrates; **pauses scrolling on Ground's reject** | T1: ATC P1 (earliest slot, planned gate), Pilot accepts, **Ground `REJECT` P1 · `GATE_OVERLAP`** with a counter-suggestion. Phase divider-style note: objection is now a standing constraint. |
| 3 | Narrates | T2: ATC P2 moves slot/gate to resolve it, Pilot and Ground `ACCEPT`, checker ✓. Gate change notice ≥ 20 min shown in Ground's expanded message. |
| 4 | Points at result card vs P1 | Final gate/slot differs from ATC's first proposal. |
| 5 | Approves all three | `HUMAN_APPROVED`, log verified ✓ (no tamper demo). |
| 6 | Optional: clicks the **S1 chip** | Shows S1's history to contrast who decided each outcome. |

**Talking point:** ATC is the only one who proposes, but Ground's constraint decided the answer.

---

## 8. Scenario 3: Low fuel, branch 3b (fallback → alternate → human call)

**Button:** S3 Low fuel (single button, fixed to 3b). **Row:** same as Scenario 1. **Injection:** severe low fuel (`SYNTHETIC:injected_low_fuel`), applied **after** F is built, so it arrives as a mid-phase fuel-state update.

| Step | What the presenter does | What the audience sees |
|---|---|---|
| 1 | Clicks **S3** | Same disruption as S1. |
| 2 | Narrates | Mid-phase System message: fuel-state update for the focus flight. |
| 3 | Pauses on the checker block | ATC's next proposal → **Checker ✗ `FUEL_RESERVE`** (red, inline). The rejected proposal still uses its turn. |
| 4 | Narrates | Infeasibility rule fires: no safe ORD slot. **`FALLBACK` · `INFEASIBLE_NO_SAFE_SLOT`** → Suggestion 1 = **divert to MDW** (nearest by `airports.csv`, fuel to reach + reserve checked). |
| 5 | Points at baseline | Do-nothing at ORD shows a red `FUEL_RESERVE` violation. |
| 6 | Pilot panel: **Reject** (pre-filled, "Scripted for demo"); ATC and Ground approve | Reason: *"MDW is 17 mi from ORD and under the same weather cell. Diverting there risks a second hold on fuel we don't have."* |
| 7 | Phase 2 starts automatically | Divider: constraint "alternate must be outside weather radius" (`ASSUMPTION:shared_weather_radius`, about 50 mi); MDW on the rejected list. |
| 8 | Narrates | Phase 2 → Suggestion 2 = **divert to MKE** (next-nearest outside radius, checker ✓). |
| 9 | Ground panel: **Reject** (pre-filled); Pilot and ATC approve | Reason: *"MKE is a small hub with only 2 spare gates, both committed at the ETA. Handling an unplanned diversion would push the ground crew past their 8 h shift into 1.5x overtime."* (`constraints.xlsx:airport_capacity:MKE:spare_gates`, `constraints.xlsx:fuel_and_crew:Ground crew shift`) |
| 10 | Human call panel opens | 📞 banner; S1 (MDW) and S2 (MKE) side by side with their rejection reasons. |
| 11 | Selects **S2 (MKE)**, note: *"Accept MKE; ops to call in extra ground crew, overtime approved."* | `HUMAN_CALL_DECISION` logged as final entry. Baseline updates with the final call. Log sealed, verified ✓. |

**Baseline panel for S3:** columns are **do-nothing at ORD** (red `FUEL_RESERVE` violation) **vs S1 (MDW) vs S2 (MKE) vs final call**. Fuel estimates use workbook burn rates (2,400 kg/h narrowbody, 6,500 kg/h widebody), tagged `constraints.xlsx:fuel_and_crew`.

**Talking point:** the LLMs never get the last word on safety. Code blocked the unsafe plan, code guaranteed an answer, and humans accepted a cost (overtime) the agents would not trade, without touching safety.

**Backup:** branch 3a (moderate fuel cut, agents recover with a fuel-priority slot) is recorded and available via **Replay recorded run**; it can also be run live from User mode with the "moderate" fuel option.

---

## 9. Data facts used (verified in `challenge2_operational_constraints.xlsx`)

| Airport | Class | Runways | Gates | Ops/h | Min turnaround | Spare gates |
|---|---|---|---|---|---|---|
| ORD | Large hub | 4 | 150 | 90 | 45 | 3 |
| MDW | Medium hub | 3 | 70 | 60 | 35 | 3 |
| MKE | Small hub | 2 | 30 | 36 | 35 | 2 |

Fuel and crew: final reserve 30 min; spare on arrival 45 min (usable hold 15 min, team reading); flight crew max duty 13 h from report; ground crew shift 8 h then 1.5x; gate change notice ≥ 20 min.

---

## 10. Build items this flow implies

| Item | Where | Notes |
|---|---|---|
| Demo / User toggle + preset buttons | Web | Presets hard-code rows and injection level. |
| Pre-filled scripted reasons + "Scripted for demo" label | Web | Demo mode only. |
| Replay recorded run | Web + saved event JSON | Record each scenario's event stream once it runs cleanly. |
| Run history chips | Web | Uses existing `subscribe` replay. |
| Auto-scroll with pause + "new messages" pill, thinking indicator | Web | |
| Approval gating (all three before acting), auto phase 2 | Backend + web | |
| Human call panel | Web | Existing `humanCall` API. |
| `POST /runs/{id}/tamper` and reset | Backend | Edits the in-memory copy only, never the file. |
| Severe vs moderate low-fuel injection, applied after F is built | Backend | `inject: { low_fuel: "severe" | "moderate" }`. The current API sends a boolean; needs widening. |
| Alternate-airport selection with `shared_weather_radius` constraint | Backend fallback | Nearest by `airports.csv` coordinates; airport must also exist in `airport_capacity`. |
| S3 baseline columns (do-nothing / S1 / S2 / final) | Backend + web | |

---

## 11. Open items

- [ ] **Rows for S1 and S2** (`<TBD>`): needs `flights.csv` downloaded from the Challenge 2 Drive folder into `references/Datasets/`, then a query for candidates.
- [ ] Confirm the S1 focus flight's wake class (narrowbody vs widebody) since it drives the fuel burn figures in S3.
- [ ] Record replay streams for S1, S2, S3 (3b) and 3a after the first clean runs.
- [ ] State on screen and in README: `weather_factor` 50%, `shared_weather_radius` ~50 mi, usable hold 15 min, scripted rejections.
