"""OWNER: P1. Deterministic constraint checker (PRD section 10). No LLM here."""


def check(proposal, scenario):
    """Returns {"passed": bool, "violated_constraint": str|None, "detail": str}.
    TODO, in order:
      - WAKE_SEP: gap to leader by class pair (180/120/60 s)
      - runway throughput <= max_ops_per_hour * weather_factor
      - FUEL_RESERVE: holding minutes <= usable_hold_min
      - GATE_OVERLAP: gate free for min_turnaround_min, notice >= 20 min
      - CREW_DUTY: flight crew <= 13 h
    """
    occupied = scenario["private"]["GROUND"]["occupied_gates"]
    if proposal["gate"]["value"] in occupied:
        return {"passed": False, "violated_constraint": "GATE_OVERLAP", "detail": "gate occupied"}
    return {"passed": True, "violated_constraint": None, "detail": "stub: only gate check implemented"}


def enumerate_candidates(scenario):
    """TODO: feasible set F (runway x slot x gate), filtered by check(), scored per agent."""
    return []
