"""Shared contract (PRD section 9). EVERYONE depends on this file.
Talk to the team before changing anything here."""
import hashlib
import json
import uuid

SENDERS = ("ATC", "PILOT", "GROUND", "CHECKER", "SYSTEM")
TYPES = (
    "ARRIVAL_REQUEST", "INFO_REQUEST", "INFO_RESPONSE",
    "PROPOSE", "ACCEPT", "REJECT", "CHECK_RESULT", "FALLBACK",
    "HUMAN_APPROVE", "HUMAN_REJECT", "HUMAN_CALL_DECISION",
)
VIOLATIONS = ("FUEL_RESERVE", "WAKE_SEP", "GATE_OVERLAP", "CREW_DUTY", "NO_VALID_RESPONSE", None)

MAX_TURNS = 3
MAX_PHASES = 2


def field(value, source):
    """Every value carries its source, e.g. 'flights.csv:WEATHER_DELAY:row42' or 'ASSUMPTION:weather_factor'."""
    return {"value": value, "source": source}


def make_proposal(runway, gate, eta, delay_min):
    """Each argument is a field(value, source)."""
    core = {"runway": runway, "gate": gate, "eta": eta, "delay_min": delay_min}
    values = json.dumps({k: v["value"] for k, v in core.items()}, sort_keys=True)
    return {"proposal_id": hashlib.sha256(values.encode()).hexdigest()[:12], **core}


def make_message(sender, type, phase, turn, proposal=None, violated_constraint=None,
                 suggestion=None, rationale=""):
    assert sender in SENDERS, sender
    assert type in TYPES, type
    assert violated_constraint in VIOLATIONS, violated_constraint
    return {
        "msg_id": str(uuid.uuid4()),
        "phase": phase,
        "turn": turn,
        "sender": sender,
        "type": type,
        "proposal": proposal,
        "violated_constraint": violated_constraint,
        "suggestion": suggestion or {},
        "rationale": rationale,
        "prev_hash": None,  # filled in by chainlog
        "hash": None,
    }


def latest_proposal(history):
    """The most recent PROPOSE from ATC, or None."""
    for msg in reversed(history):
        if msg["type"] == "PROPOSE":
            return msg["proposal"]
    return None
