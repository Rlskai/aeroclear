"""OWNER: P3. Supabase writer. Does nothing if SUPABASE_URL is not set, so others can run without it."""
import os

_client = None


def _get():
    global _client
    if _client is None and os.getenv("SUPABASE_URL"):
        from supabase import create_client
        _client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    return _client


def save(run_id, msg):
    sb = _get()
    if sb is None:
        return
    sb.table("messages").insert({
        "run_id": run_id, "phase": msg["phase"], "turn": msg["turn"],
        "sender": msg["sender"], "type": msg["type"], "body": msg,
        "prev_hash": msg["prev_hash"], "hash": msg["hash"],
    }).execute()
