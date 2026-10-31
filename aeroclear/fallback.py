"""Deterministic fallback for the Disruption Negotiator.

Runs when the 3 agents have not agreed after 2 rounds. Plain if/else rules,
no AI: the same input always gives the same output.

Flow:  order_flights -> assign slots and gates -> finalize (approvals)
Any unresolved tie, missing gate or rejected approval -> ESCALATE_TO_CALL.
"""
from dataclasses import dataclass
from functools import cmp_to_key

from .models import field, make_proposal

# ---- Tunable rules (hard-coded on purpose: no AI decides these) ----------
LOW_FUEL_MIN = 20         # endurance at or below this = fuel priority
FUEL_BUCKET_MIN = 5       # endurance gaps smaller than this count as "equal"
GATE_BUCKET_MIN = 2       # taxi-time gaps smaller than this count as "equal"
MIN_SEPARATION_MIN = 3    # minutes between landings on the same runway
APPROVERS = ("ATC", "Pilot", "Ground")


@dataclass
class Flight:
    id: str
    fuel_kg: float
    reserve_kg: float          # final reserve that must not be touched
    burn_kg_per_min: float     # holding burn rate
    taxi_to_gate_min: float    # taxi time to the nearest free gate
    scheduled_min: int         # original scheduled order (minutes from now)
    planned_gate: str = ""
    earliest_min: int = 0      # earliest possible landing (minutes from now)

    @property
    def endurance_min(self) -> float:
        """Minutes this flight can still hold before touching its reserve."""
        return (self.fuel_kg - self.reserve_kg) / self.burn_kg_per_min


@dataclass
class Gate:
    id: str
    taxi_min: float            # taxi time from the runway exit
    free_from_min: float       # minutes from now when the gate is free


# ---- Rule 1: who lands first? ---------------------------------------------
def _low(f):
    return f.endurance_min <= LOW_FUEL_MIN


def _fuel_bucket(f):
    return int(f.endurance_min // FUEL_BUCKET_MIN)


def _gate_bucket(f):
    return int(f.taxi_to_gate_min // GATE_BUCKET_MIN)


def decide(a: Flight, b: Flight):
    """Return (winner, reason). winner is None if the rules cannot separate them."""
    if _low(a) != _low(b):                                   # 1. fuel emergency
        return (a if _low(a) else b), "LOW_FUEL"
    if _fuel_bucket(a) != _fuel_bucket(b):                   # 2. less fuel first
        return (a if _fuel_bucket(a) < _fuel_bucket(b) else b), "LESS_FUEL"
    if _gate_bucket(a) != _gate_bucket(b):                   # 3. nearer to gate
        return (a if _gate_bucket(a) < _gate_bucket(b) else b), "NEARER_GATE"
    if a.scheduled_min != b.scheduled_min:                   # 4. original schedule
        return (a if a.scheduled_min < b.scheduled_min else b), "SCHEDULE_ORDER"
    return None, "UNRESOLVED_TIE"                            # 5. cannot decide


def order_flights(flights):
    def cmp(a, b):
        winner, _ = decide(a, b)
        return 0 if winner is None else (-1 if winner is a else 1)
    return sorted(flights, key=cmp_to_key(cmp))


# ---- Rule 2: gate ---------------------------------------------------------
def assign_gate(flight, slot_min, gates, taken):
    """Keep the planned gate if free, else the nearest free gate."""
    free = [g for g in gates
            if g.id not in taken and g.free_from_min <= slot_min + g.taxi_min]
    if not free:
        return None
    planned = [g for g in free if g.id == flight.planned_gate]
    return planned[0] if planned else min(free, key=lambda g: (g.taxi_min, g.id))


# ---- Full fallback --------------------------------------------------------
def _call(reason, log, **extra):
    return {"status": "ESCALATE_TO_CALL", "reason": reason,
            "call_participants": list(APPROVERS), "log": log, **extra}


def run_fallback(flights, gates):
    log = []
    ordered = order_flights(flights)

    for first, second in zip(ordered, ordered[1:]):          # explain the order
        winner, reason = decide(first, second)
        if winner is None:
            log.append(f"{first.id} and {second.id}: {reason}")
            return _call(reason, log, tied=[first.id, second.id])
        log.append(f"{first.id} before {second.id}: {reason}")

    plan, taken, next_free = [], set(), 0
    for f in ordered:
        slot = max(next_free, f.earliest_min)
        if slot > f.endurance_min:                           # fuel runs out first
            log.append(f"{f.id}: no safe slot before fuel runs short")
            plan.append({"flight": f.id, "action": "DIVERT_ALTERNATE"})
            continue
        gate = assign_gate(f, slot, gates, taken)
        if gate is None:
            log.append(f"{f.id}: no free gate")
            return _call("NO_GATE", log, flight=f.id)
        taken.add(gate.id)
        next_free = slot + MIN_SEPARATION_MIN
        plan.append({"flight": f.id, "action": "LAND",
                     "slot_min": slot, "gate": gate.id})
    return {"status": "PROPOSED", "plan": plan, "log": log}


def finalize(result, approvals):
    """approvals example: {"ATC": True, "Pilot": True, "Ground": False}"""
    if result["status"] != "PROPOSED":
        return result
    rejected = [who for who in APPROVERS if approvals.get(who) is not True]
    if rejected:
        log = result["log"] + [f"Not approved by: {', '.join(rejected)}"]
        return _call("APPROVAL_REJECTED", log, rejected_by=rejected,
                     plan=result["plan"])
    return {**result, "status": "APPROVED"}


# ---- Orchestrator entry point (still a placeholder) -----------------------
def solve(scenario, reason_code):
    """Returns (proposal, reason_code). Called by orchestrator.py.
    TODO: build Flight/Gate lists from the scenario and use run_fallback()."""
    f = scenario["focus_flight"]
    proposal = make_proposal(
        runway=field("RWY-1", "SYNTHETIC:generated_id"),
        gate=field("G-001", "fallback:lowest_free_gate"),
        eta=field("18:00", "fallback:earliest_safe_slot"),
        delay_min=field(f["weather_delay"] + 15, "fallback:computed"),
    )
    return proposal, reason_code


# ---- Demo and self-test ---------------------------------------------------
if __name__ == "__main__":
    gates = [Gate("B14", taxi_min=4, free_from_min=0),
             Gate("B22", taxi_min=9, free_from_min=0)]
    all_ok = {"ATC": True, "Pilot": True, "Ground": True}

    # 1. A has less fuel (30 vs 40 min) -> A first
    A = Flight("A", 3000, 1800, 40, 4, 10, "B14")
    B = Flight("B", 3400, 1800, 40, 9, 5, "B22")
    r = finalize(run_fallback([B, A], gates), all_ok)
    assert r["status"] == "APPROVED" and r["plan"][0]["flight"] == "A"

    # 2. Same fuel bucket, A nearer to the gate -> A first
    A2 = Flight("A", 3000, 1800, 40, 4, 10, "B14")
    B2 = Flight("B", 3040, 1800, 40, 9, 5, "B22")
    r = run_fallback([B2, A2], gates)
    assert r["plan"][0]["flight"] == "A" and "NEARER_GATE" in r["log"][0]

    # 3. Identical flights -> rules cannot decide -> call
    r = run_fallback([Flight("A", 3000, 1800, 40, 4, 10, "B14"),
                      Flight("B", 3000, 1800, 40, 4, 10, "B22")], gates)
    assert r["status"] == "ESCALATE_TO_CALL" and r["reason"] == "UNRESOLVED_TIE"

    # 4. Someone rejects the fallback plan -> call
    r = finalize(run_fallback([A, B], gates),
                 {"ATC": True, "Pilot": True, "Ground": False})
    assert r["status"] == "ESCALATE_TO_CALL" and r["rejected_by"] == ["Ground"]

    # 5. Fuel runs out before a safe slot -> divert
    low = Flight("C", 2000, 1800, 40, 4, 1, "B14", earliest_min=10)
    r = run_fallback([low], gates)
    assert r["plan"][0]["action"] == "DIVERT_ALTERNATE"

    print("All fallback checks passed.")
    print(finalize(run_fallback([A, B], gates), all_ok))
