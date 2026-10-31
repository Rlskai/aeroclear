# Team guide: how we build in parallel

## Who owns what (only edit your own files)

| Person | Files |
|---|---|
| **P1** | `aeroclear/agents/pilot.py`, `aeroclear/data.py`, `aeroclear/checker.py`, `aeroclear/fallback.py` |
| **P2** | `aeroclear/agents/atc.py`, `aeroclear/orchestrator.py`, `aeroclear/chainlog.py` |
| **P3** | `aeroclear/agents/ground.py`, `aeroclear/db.py`, `web/index.html`, `supabase/schema.sql` |
| **Shared: ask the group first** | `aeroclear/models.py`, `aeroclear/agents/base.py` |

## The contract (do not break it)

Every agent has exactly this function:

```python
def respond(history, private, ctx) -> dict:   # returns models.make_message(...)
```

- `history`: every message so far (the shared list)
- `private`: this agent's own state only
- `ctx`: scenario info + current `phase` and `turn`

Each agent has `USE_LLM = False` (a placeholder answer). Write your prompt, then flip it to `True`.

## Setup (once)

```bash
git clone https://github.com/Rlskai/aeroclear.git && cd aeroclear
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # add your ANTHROPIC_API_KEY
```

## Run

```bash
python -m aeroclear.orchestrator --scenario 1     # 1, 2 or 3
python -m aeroclear.chainlog logs/<file>.jsonl    # verify a log
```

This already works with the placeholder agents, so you can check you haven't broken anything at any time.

## Git workflow

```bash
git checkout -b p1-pilot          # your own branch (p2-atc, p3-ground)
# ... work ...
git add -A && git commit -m "pilot: fuel check"
git push -u origin p1-pilot
```

Merge to `main` often (every 30–45 min), and only when `python -m aeroclear.orchestrator --scenario 1` still runs:

```bash
git checkout main && git pull
git merge p1-pilot && git push
git checkout p1-pilot && git merge main   # pick up everyone else's work
```

Because you each edit different files, merges should not conflict.

## Supabase (P3 sets up, then shares the values)

1. Create a project at supabase.com and run `supabase/schema.sql` in the SQL editor.
2. Put `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in everyone's `.env` (send privately, **never commit**).
3. Put the URL and the **anon** key in `web/index.html`.
4. Run a scenario and the web page updates live.

Without Supabase values, everything still runs and logs to `logs/`.

### Datasets (Supabase Storage)

Datasets like `flights.csv` live in the `Aeroclear bucket` bucket, not in git (too big). In code:

```python
from aeroclear.data import dataset_path
df = pd.read_csv(dataset_path("flights.csv"))
```

The first call downloads the file into `data/` (gitignored); later calls reuse it. Needs `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in `.env`. To add a dataset, upload it to the bucket in the dashboard.

## Meet-up points

| When | What |
|---|---|
| ~14:15 | Each agent works alone with `USE_LLM = True`. Real checker started. |
| ~15:00 | Merge all. Scenario 1 runs with real agents end to end. |
| ~15:30 | Scenarios 2 and 3 pass the checklist in `demoflow.md`. Record backup. |
