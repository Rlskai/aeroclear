"""OWNER: P1. Loads datasets and builds scenario inputs.
TODO: replace the hard-coded values with real rows from flights.csv / airports.csv /
references/Datasets/challenge2_operational_constraints.xlsx."""
import os
import urllib.parse
from pathlib import Path

import httpx  # installed with supabase

BUCKET = "Aeroclear bucket"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def dataset_path(name):
    """Local path to a dataset from the Supabase bucket, e.g. dataset_path("flights.csv").
    Downloads it into data/ the first time; later calls reuse the local copy."""
    path = DATA_DIR / name
    if path.exists():
        return path
    DATA_DIR.mkdir(exist_ok=True)
    url, key = os.environ["SUPABASE_URL"], os.getenv("SUPABASE_SERVICE_KEY")
    obj = f"{urllib.parse.quote(BUCKET)}/{urllib.parse.quote(name)}"
    if key:  # private bucket: needs the secret key
        r = httpx.get(f"{url}/storage/v1/object/{obj}",
                      headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=120)
    else:  # public bucket
        r = httpx.get(f"{url}/storage/v1/object/public/{obj}", timeout=120)
    if r.status_code != 200:
        raise RuntimeError(f"Could not download {name} from Supabase ({r.status_code}). "
                           "Private bucket? Set SUPABASE_SERVICE_KEY in .env.")
    path.write_bytes(r.content)
    return path



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
