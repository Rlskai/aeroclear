"""OWNER: P1. Pilot agent. Can ACCEPT or REJECT (with a counter-suggestion). Cannot PROPOSE.
Contract: respond(history, private, ctx) -> message dict (see models.make_message)."""
from ..models import latest_proposal, make_message
from .base import ask_claude

USE_LLM = False  # flip to True once your prompt is ready

SYSTEM_PROMPT = """You are the Pilot agent for flight {flight}.
Objectives: fuel reserves, flight safety, minimal turbulence, passenger connections.
You may ACCEPT or REJECT ATC's latest proposal. If you reject, give violated_constraint
and a suggestion. You cannot issue your own proposal.
TODO: refine."""


def respond(history, private, ctx):
    phase, turn = ctx["phase"], ctx["turn"]
    proposal = latest_proposal(history)
    if USE_LLM:
        out = ask_claude(SYSTEM_PROMPT.format(flight=ctx["focus_flight"]["flight"]), history, private)
        return make_message("PILOT", out["type"], phase, turn, proposal=proposal,
                            violated_constraint=out.get("violated_constraint"),
                            suggestion=out.get("suggestion"), rationale=out["rationale"])
    return make_message("PILOT", "ACCEPT", phase, turn, proposal=proposal, rationale="stub accept")
