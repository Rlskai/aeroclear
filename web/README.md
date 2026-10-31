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
| `LOGS_DIR` | Folder of backend run logs for **Real runs** (below). Default `../logs`. |

## Demo / User mode

Header toggle, default **Demo** (see `../demo-userflow.md`). Independent of mock vs live backend.

- **Demo:** preset buttons S1 / S2 / S3 from `src/lib/demo.ts` (rows, low-fuel level, scripted reject reasons, human-call choice). Scripted reasons are pre-filled when the presenter clicks Reject, with no on-screen label, so the presenter follows the script in `../demoflow.md`. Tamper demo on S1 only.
- **User:** full picker, low fuel off / moderate / severe, reasons typed by hand.
- **Replay recorded run:** every clean, finished preset run is saved to this browser's localStorage and can be replayed (labelled "Recorded"). Record all three on the presenting laptop before judging.
- **Run history:** chips under the header; click to restore any earlier run. Runs live in backend memory, so don't restart it between scenarios.

## Real runs (log files)

The **Real runs** card lists every run in `../logs/*.jsonl` (written by `python -m aeroclear.orchestrator` run from the repo root), newest first, re-checked every second. Click one to open it in the dashboard; it keeps following the file while the run is in progress. Demo presets and the mock still work alongside it.

- The Next.js server reads the files: `GET /api/runs` lists runs, `GET /api/runs/<id>?from=n` returns raw lines from index n (`src/app/api/runs/`). Set `LOGS_DIR` to read another folder.
- `src/lib/backend.ts` turns each line into the same `RunEvent`s the mock sends, so every panel works unchanged. Turn 0 (arrival request) is setup, `FALLBACK` is the phase outcome, and a suggestion appears on fallback or when Pilot and Ground both accept ATC's exact proposal (same rule as `orchestrator.run_phase`).
- Read-only: runs start from the terminal, and approvals are disabled because the backend has no approval step yet. The log has no timestamps or token counts, so the phase meter is hidden.
- Log verification re-hashes the lines exactly as written with the backend's rule (`aeroclear/chainlog.py`, `src/lib/pyhash.ts`): `sha256(json.dumps(msg without "hash", sort_keys=True))`, first `prev_hash` = `"GENESIS"`.
- Needs the web server on the same machine as the backend (it reads the files from disk).

## Mock mode

Without `NEXT_PUBLIC_API_BASE` the UI runs on `src/lib/api/mock.ts` and the header shows **MOCK BACKEND · scripted values**.
The rows, agent messages and baseline numbers are scripted, not read from `flights.csv` and not produced by a model. The hash chain is real (SHA-256 in the browser).

| Start | Flow |
|---|---|
| S1 (weather + late, fuel off) | Pilot soft reject in turn 1, consensus in turn 2 |
| S2 (late aircraft only) | Ground `GATE_OVERLAP` reject, consensus in turn 2 on a new gate |
| S3 (fuel severe) | Checker `FUEL_RESERVE` block → `FALLBACK (INFEASIBLE_NO_SAFE_SLOT)` divert MDW; after a reject, phase 2 diverts MKE; second reject → human call |
| Fuel moderate (User mode) | Checker block, agents recover with a fuel-priority slot (3a) |

## Backend contract

Types are in `src/lib/types.ts`. The FastAPI service needs CORS for the web origin.

| Method | Path | Body / response |
|---|---|---|
| GET | `/scenarios?airport=ORD&delay_type=weather_late\|late_only` | `Scenario[]` |
| POST | `/runs` | `{row_id, inject:{low_fuel: "off"\|"moderate"\|"severe"}}` → `{run_id}` |
| GET | `/runs/{id}/stream` | SSE. Each `data:` line is one `RunEvent` JSON. Replay all past events on connect. |
| POST | `/runs/{id}/approvals` | `{suggestion_index, role, decision, reason?}` |
| POST | `/runs/{id}/human-call` | `{chosen_suggestion, note}` |
| GET | `/runs/{id}/log` | `LogEntry[]` |
| GET | `/runs/{id}/verify` | `{ok, entries, first_bad_seq?}` |
| POST | `/runs/{id}/tamper` | Demo: edit one stored proposal in the in-memory copy (never the file) so verify fails |
| POST | `/runs/{id}/tamper/reset` | Undo tamper |

Event and field notes:
- `phase_start` carries `constraints_added: string[]` in phase 2 (human reasons + rejected suggestion), shown as a divider.
- Send `{kind:"thinking", role}` just before each agent model call, so the UI can show "ATC thinking…".
- `baseline` is `{kind:"baseline", table:{columns:[{key,label,highlight?}], rows:[{metric, values:{[key]: number|null}}]}}`. Send it with every suggestion and again before `final`. S3 uses columns do-nothing / S1 / S2 / final call.
- `Proposal.airport` (`Sourced<string>`) is set on diversions. `LogEntry.score` = `{value, floor}` for the sender's domain score. Checker `CHECK_RESULT` entries set `violated_constraint` on failure.
- Fallback reason for no safe slot is `INFEASIBLE_NO_SAFE_SLOT`.

Event order per phase: `phase_start` → setup `entry`s (turn `null`) → per turn: `turn_start`, `entry`s → outcome `entry`s (turn `null`) → `suggestion` (+ `baseline` after Suggestion 1). Send `meter` after each agent message.
After approvals: `approval` per human, then `final`, a new `phase_start`, or `awaiting_human_call`.

**Hash rule** (must match `src/lib/hash.ts`):

```python
body = {k: v for k, v in entry.items() if k != "hash"}  # keep None values: they hash as null
entry["hash"] = sha256((prev_hash + json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)).encode()).hexdigest()
# genesis prev_hash = "0" * 64
```

Note the JS side drops `undefined` keys but keeps `null`, so either always send optional keys or always omit them.
