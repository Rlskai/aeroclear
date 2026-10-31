"""OWNER: P2. ATC agent (lead). The ONLY agent that issues PROPOSE.
Contract: respond(history, private, ctx) -> message dict (see models.make_message)."""
from ..models import field, make_message, make_proposal
from .base import ask_claude

USE_LLM = False  # flip to True once your prompt is ready

SYSTEM_PROMPT = """You are the Air Traffic Control agent at {airport}.
Objectives: wake separation, taxiway blockage, sector throughput.
You alone issue PROPOSE messages. Pick a candidate from the shortlist.
If Pilot or Ground rejected the last proposal, your next proposal must address their objection.
TODO: refine."""


def respond(history, private, ctx):
    phase, turn = ctx["phase"], ctx["turn"]
    if USE_LLM:
        out = ask_claude(SYSTEM_PROMPT.format(airport=ctx["airport"]), history, private)
        # TODO: map out["candidate_index"] to a real candidate from checker.enumerate_candidates
    # Stub: first proposal uses the planned gate, later ones move to G-074
    gate = ctx["focus_flight"]["planned_gate"] if turn == 1 else "G-074"
    proposal = make_proposal(
        runway=field("RWY-2", "SYNTHETIC:generated_id"),
        gate=field(gate, "constraints.xlsx:airport_capacity:ORD:gates (id SYNTHETIC:generated_id)"),
        eta=field("17:45", "flights.csv:SCHEDULED_ARRIVAL + delay"),
        delay_min=field(30, "flights.csv:WEATHER_DELAY"),
    )
    return make_message("ATC", "PROPOSE", phase, turn, proposal=proposal,
                        rationale="stub proposal")
