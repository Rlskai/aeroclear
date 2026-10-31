# Disruption Negotiation web view

Next.js front end for Challenge 2, built from `references/Disruption Negotiation Mockup.html`.
Six panels: scenario picker, live negotiation timeline, result card, human approval, baseline comparison, log verification.

## Run

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

| Env var (`web/.env.local`) | Effect |
|---|---|
| `NEXT_PUBLIC_API_BASE` | Backend URL, e.g. `http://localhost:8000`. **Unset = in-browser mock.** |
| `NEXT_PUBLIC_TABLE_NUMBER` | Shown in the header. |

## Mock mode

Without `NEXT_PUBLIC_API_BASE` the UI runs on `src/lib/api/mock.ts` and the header shows **MOCK BACKEND · scripted values**.
The rows, agent messages and baseline numbers are scripted, not read from `flights.csv` and not produced by a model.
The hash chain, however, is real (SHA-256 in the browser), and the **Tamper (demo)** button edits a logged proposal so you can show verification failing.

Mock scripts cover the three PRD demo scenarios:

| Pick | Flow |
|---|---|
| Weather + late aircraft, low fuel off | Ground rejects once, consensus in turn 2 |
| Late aircraft only | Ground rejects twice (gate, crew duty), consensus in turn 3 |
| Any row with **Injected low fuel: on** | Checker blocks unsafe plan, Ground stalemate, `FALLBACK (NO_CONSENSUS_AFTER_3_TURNS)` |

Any human reject on Suggestion 1 runs phase 2; a reject on Suggestion 2 opens the human-call form.

## Backend contract

Types are in `src/lib/types.ts`. The FastAPI service needs CORS for the web origin.

| Method | Path | Body / response |
|---|---|---|
| GET | `/scenarios?airport=ORD&delay_type=weather_late\|late_only` | `Scenario[]` |
| POST | `/runs` | `{row_id, inject:{low_fuel}}` → `{run_id}` |
| GET | `/runs/{id}/stream` | SSE. Each `data:` line is one `RunEvent` JSON. Replay all past events on connect. |
| POST | `/runs/{id}/approvals` | `{suggestion_index, role, decision, reason?}` |
| POST | `/runs/{id}/human-call` | `{chosen_suggestion, note}` |
| GET | `/runs/{id}/log` | `LogEntry[]` |
| GET | `/runs/{id}/verify` | `{ok, entries, first_bad_seq?}` |

Event order per phase: `phase_start` → setup `entry`s (turn `null`) → per turn: `turn_start`, `entry`s → outcome `entry`s (turn `null`) → `suggestion` (+ `baseline` after Suggestion 1). Send `meter` after each agent message.
After approvals: `approval` per human, then `final`, a new `phase_start`, or `awaiting_human_call`.

**Hash rule** (must match `src/lib/hash.ts`):

```python
body = {k: v for k, v in entry.items() if k != "hash"}  # keep None values: they hash as null
entry["hash"] = sha256((prev_hash + json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)).encode()).hexdigest()
# genesis prev_hash = "0" * 64
```

Note the JS side drops `undefined` keys but keeps `null`, so either always send optional keys or always omit them.
