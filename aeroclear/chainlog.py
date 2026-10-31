"""OWNER: P2. Append-only, hash-chained JSONL log (PRD section 13)."""
import hashlib
import json
import os
import sys

from . import db


def _hash(msg):
    body = {k: v for k, v in msg.items() if k != "hash"}
    return hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()


class ChainLog:
    def __init__(self, run_id):
        self.run_id = run_id
        os.makedirs("logs", exist_ok=True)
        self.path = f"logs/{run_id}.jsonl"
        self.prev_hash = "GENESIS"

    def append(self, msg):
        msg["prev_hash"] = self.prev_hash
        msg["hash"] = _hash(msg)
        self.prev_hash = msg["hash"]
        with open(self.path, "a") as f:
            f.write(json.dumps(msg) + "\n")
        db.save(self.run_id, msg)
        return msg


def verify(path):
    prev = "GENESIS"
    with open(path) as f:
        for i, line in enumerate(f, 1):
            msg = json.loads(line)
            if msg["prev_hash"] != prev or msg["hash"] != _hash(msg):
                return False, f"tampered at line {i}"
            prev = msg["hash"]
    return True, "chain ok"


if __name__ == "__main__":
    print(verify(sys.argv[1]))
