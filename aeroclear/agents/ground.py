"""OWNER: P3. Ground agent. Can ACCEPT or REJECT (with a counter-suggestion). Cannot PROPOSE.
Contract: respond(history, private, ctx) -> message dict (see models.make_message)."""
from ..models import latest_proposal, make_message
from .base import ask_claude

USE_LLM = False  # flip to True once your prompt is ready

SYSTEM_PROMPT = """You are the Ground Operations agent at {airport}.
Objectives: gate utilisation, avoid crew overtime, minimal turnaround delay.
You may ACCEPT or REJECT ATC's latest proposal. If you reject, give violated_constraint
and a suggestion (e.g. a different gate or later slot). You cannot issue your own proposal.
TODO: refine."""


def respond(history, private, ctx):
    phase, turn = ctx["phase"], ctx["turn"]
    proposal = latest_proposal(history)
    if USE_LLM:
        out = ask_claude(SYSTEM_PROMPT.format(airport=ctx["airport"]), history, private)
        return make_message("GROUND", out["type"], phase, turn, proposal=proposal,
                            violated_constraint=out.get("violated_constraint"),
                            suggestion=out.get("suggestion"), rationale=out["rationale"])
    # Stub: reject if the gate is occupied
    if proposal and proposal["gate"]["value"] in private["occupied_gates"]:
        return make_message("GROUND", "REJECT", phase, turn, proposal=proposal,
                            violated_constraint="GATE_OVERLAP",
                            suggestion={"gate": "any free gate"}, rationale="stub: gate occupied")
    return make_message("GROUND", "ACCEPT", phase, turn, proposal=proposal, rationale="stub accept")
