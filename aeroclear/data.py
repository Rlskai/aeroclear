"""OWNER: P1. Loads datasets and builds scenario inputs.
TODO: replace the hard-coded values with real rows from flights.csv / airports.csv /
references/Datasets/challenge2_operational_constraints.xlsx."""


def load_scenario(n):
    """Returns everything the checker, fallback and agents need for scenario n (1, 2 or 3)."""
    base = {
        "scenario": n,
        "airport": "ORD",
        # constraints.xlsx:airport_capacity:ORD
        "capacity": {"runways": 4, "gates": 150, "max_ops_per_hour": 90,
                     "min_turnaround_min": 45, "spare_gates": 3},
        "weather_factor": 0.5,  # ASSUMPTION:weather_factor
        "focus_flight": {
            "flight": "AA1234", "row": None,  # TODO: real flights.csv row
            "scheduled_arrival": "17:15", "weather_delay": 30, "late_aircraft_delay": 25,
            "aircraft_class": "LARGE", "planned_gate": "G-073",
        },
        "queue": [],  # TODO: other arrivals in the window
        # Private state handed to each agent (each agent only sees its own)
        "private": {
            "ATC": {"active_runways": ["RWY-1", "RWY-2", "RWY-3", "RWY-4"]},
            "PILOT": {"usable_hold_min": 15, "connections": 12},
            "GROUND": {"occupied_gates": [], "crew_hours_on_shift": 5},
        },
    }
    if n == 2:
        base["private"]["GROUND"]["occupied_gates"] = ["G-073"]  # TODO: derive from queue
    if n == 3:
        base["private"]["PILOT"]["usable_hold_min"] = 5  # SYNTHETIC:injected_low_fuel
    return base
