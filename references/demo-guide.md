# Demo Guide: step by step

For the presenter at judging. Logic: `demoflow.md`. Screen behaviour: `references/demo-userflow.md`.
Assumed slot: about 6 minutes plus questions. If you have less, cut Scenario 2 (step 4).

---

## A. Before judging (do this by 16:00)

### A1. Start the web app
```bash
cd web
npm install          # first time only
npm run dev          # http://localhost:3000
```
- Header badge should read **MOCK BACKEND · scripted values**. That is expected: the full approval flow runs on the in-browser simulator.
- Optional: set your table number in `web/.env.local` as `NEXT_PUBLIC_TABLE_NUMBER=12`, then restart `npm run dev`.

### A2. Make a real agent run work (proof that the agents are real)
Needs human setup:
1. Create `.env` at the repo root from `.env.example`.
2. `ANTHROPIC_API_KEY`: from https://platform.claude.com → API keys (the event's $50 credits are on that Console org).
3. `SUPABASE_SERVICE_KEY`: only if the dataset bucket is private. From Supabase dashboard → Project settings → API → service_role key.
4. Install and run once:
   ```bash
   pip install -r requirements.txt
   python -m aeroclear.orchestrator --scenario 1
   ```
5. Check it appears in the **Real runs** panel at the top of the web page. If the panel is not there, the teammate's change is not merged yet; show the terminal output instead.

### A3. Record the backups (on the presenting laptop, in the browser you will present from)
1. Demo mode → **S1 Happy path** → wait for Suggestion 1 → Approve Pilot, ATC, Ground.
2. **S2 Ground-driven** → Approve all three.
3. **S3 Low fuel** → Pilot: Reject → Confirm (reason pre-filled) → ATC Approve → Ground Approve → wait for Suggestion 2 → Pilot Approve → ATC Approve → Ground: Reject → Confirm → **Record decision**.
4. Each preset now shows **Replay recorded run** instead of "No recording yet".

Recordings live in this browser's storage only. Don't clear site data or switch browsers after this.

### A4. Screen setup
- **Reload the page once** to clear the practice runs from the header. After this, **do not reload during the demo**: run history lives in page memory.
- Browser full screen, window at least 1280 px wide. Zoom 90% if the right column feels cramped.
- Close notifications. Keep a terminal ready for A2 (font size up).
- Mode toggle (top right) on **Demo**.

---

## B. The demo

### Step 1. Open (30 s)
Say: *"When weather or a late aircraft disrupts an arrival, ATC, the pilot and ground ops coordinate by phone. We built three separate AI agents that negotiate the fix in at most 3 turns. Code enforces safety, a non-AI fallback guarantees an answer, and humans approve."*

Point at: the header badge. Say: *"What you see in the browser is our simulator running the exact flow. I'll show a real agent run at the end."*

### Step 2. Scenario 1: happy path (90 s)
1. Click **S1 Happy path**. A run chip appears in the header.
2. As messages stream, narrate:
   - System: disruption injected from a `flights.csv` row; ORD capacity cut 90 → 45 ops/h.
   - Turn 1: ATC proposes P1, **checker ✓**. Pilot **REJECT**s (score 52 below floor 60). Ground accepts.
   - Turn 2: ATC revises to P2, both accept → **AGENT_CONSENSUS**.
3. Click the Pilot's turn-1 message to expand it: show **score vs floor** and the **source chips**. Say: *"Every number is traced to the dataset or labelled as an assumption."*
4. Point at the **Baseline**: negotiated beats do-nothing on delay, holding and fuel, with 0 violations.
5. Click **Approve** for Pilot, ATC, Ground. Status: **HUMAN_APPROVED**. Log badge: **verified ✓ · sealed**.
6. **Tamper demo:** click **Tamper with log** → badge turns red, "Chain broken at entry #k". Click **Reset** → green. Say: *"The log is hash-chained, so any edit shows."*

### Step 3. Scenario 2: Ground decides (60 s) *(cut first if short on time)*
1. Click **S2 Ground-driven**.
2. Narrate turn 1: Ground **REJECT P1 · GATE_OVERLAP**: planned gate still held by the late inbound, spare gates used up.
3. Turn 2: ATC moves to Ground's counter-gate G-044, everyone accepts.
4. Say: *"Only ATC can propose, but Ground's constraint decided the answer."*
5. Approve all three.

### Step 4. Scenario 3: everything goes wrong (2 min)
1. Click **S3 Low fuel**.
2. Narrate: mid-phase **fuel-state update**: usable hold drops 15 → 5 min. ATC's P1 → **checker ✗ FUEL_RESERVE** (red). Say: *"The LLM never gets the last word on safety."*
3. **FALLBACK · INFEASIBLE_NO_SAFE_SLOT**: no safe ORD slot, so the deterministic fallback diverts to **MDW**. Result card shows **Divert to MDW**. Baseline: do-nothing has a red violation.
4. **Pilot** panel shows **Script: reject**. Click **Reject** → reason is pre-filled ("same weather cell…") → **Confirm reject**. Say it's scripted for the demo.
5. Approve ATC and Ground. **Phase 2 starts automatically**: point at the yellow **Constraints added** box.
6. Suggestion 2 = **Divert to MKE**. Approve Pilot and ATC. **Ground**: Reject → Confirm (spare gates + crew overtime).
7. **📞 Human call** panel: MDW and MKE side by side with their rejections. MKE and the note are pre-filled. Click **Record decision**.
8. Say: *"Code blocked the unsafe plan, code guaranteed an answer, and humans accepted a cost the agents wouldn't trade (overtime), without touching safety."*
9. Optional: click the **S1** chip in the header to contrast with the happy path.

### Step 5. Real agents (45 s)
1. Switch to the terminal: `python -m aeroclear.orchestrator --scenario 1`.
2. Show three separate agent calls, the checker results, and the result with source tags; `verify: True` at the end.
3. In the browser, open it from **Real runs** to show the same log in the timeline.
4. Say: *"Three agents, three prompts, three model calls. Never one prompt playing all roles."*

### Step 6. Close (20 s)
Say: *"Bounded: 3 turns, 2 phases. Safe: the checker is code. Always answers: the fallback. Traceable: every value cited, log tamper-evident."*

---

## C. If a judge asks…

| Question | Do |
|---|---|
| "Does it only work on your rows?" | Toggle **User** → pick airport, delay type, row → **Run negotiation**. Low fuel **Moderate** shows agents recovering (3a). |
| "Where does this number come from?" | Click the message → source chips. |
| "What stops endless loops?" | Turn header shows the feasible set F shrinking each turn; 3-turn cap, then fallback with a reason code. |
| "Is the browser flow real AI?" | No, it's the simulator (badge says so). Show Step 5. |

## D. If something breaks

| Problem | Fix |
|---|---|
| Page errors or freezes | Use the preset's **Replay recorded run**. It plays back labelled "Recorded". |
| Page reloaded by accident | History is gone; replays still work. Run or replay the scenario you were on. |
| Python run fails (API key, network) | Skip Step 5 and say the fallback path covers API failure; show a previous log in **Real runs** if one exists. |
| Wrong button clicked in S3 | Start S3 again; the new run appears as a new chip. |
