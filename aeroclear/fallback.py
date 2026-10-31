"""OWNER: P1. Deterministic fallback solver (PRD section 11). No LLM here."""
from .models import field, make_proposal


def solve(scenario, reason_code):
    """Returns (proposal, reason_code).
    TODO: fuel-critical first, earliest safe slot, keep planned gate else lowest free gate,
    else alternate airport."""
    f = scenario["focus_flight"]
    proposal = make_proposal(
        runway=field("RWY-1", "SYNTHETIC:generated_id"),
        gate=field("G-001", "fallback:lowest_free_gate"),
        eta=field("18:00", "fallback:earliest_safe_slot"),
        delay_min=field(f["weather_delay"] + 15, "fallback:computed"),
    )
    return proposal, reason_code
