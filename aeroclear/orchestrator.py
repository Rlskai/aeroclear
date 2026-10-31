"""OWNER: P2. Runs the negotiation (PRD section 7).
Run:  python -m aeroclear.orchestrator --scenario 1"""
import argparse
import time

from . import checker, data, fallback
from .agents import atc, ground, pilot
from .chainlog import ChainLog, verify
from .models import MAX_TURNS, make_message


def run_phase(phase, scenario, history, log):
    """Returns (status, proposal, reason_code). status is AGENT_CONSENSUS or FALLBACK."""
    priv = scenario["private"]
    for turn in range(1, MAX_TURNS + 1):
        ctx = {**scenario, "phase": phase, "turn": turn}
        try:
            # 1. ATC proposes
            msg = log.append(atc.respond(history, priv["ATC"], ctx))
            history.append(msg)
            proposal = msg["proposal"]

            # 2. Checker runs before anyone responds. A blocked proposal still uses the turn.
            result = checker.check(proposal, scenario)
            history.append(log.append(make_message(
                "CHECKER", "CHECK_RESULT", phase, turn, proposal=proposal,
                violated_constraint=result["violated_constraint"], rationale=result["detail"])))
            if not result["passed"]:
                continue

            # 3. Pilot and Ground respond
            replies = []
            for agent, name in ((pilot, "PILOT"), (ground, "GROUND")):
                reply = log.append(agent.respond(history, priv[name], ctx))
                history.append(reply)
                replies.append(reply)
        except Exception as e:  # API or schema failure -> deterministic fallback
            print(f"  ! agent error: {e}")
            break

        # 4. Consensus = both accept this exact proposal (checker already passed)
        if all(r["type"] == "ACCEPT" and r["proposal"]["proposal_id"] == proposal["proposal_id"]
               for r in replies):
            return "AGENT_CONSENSUS", proposal, None

    proposal, reason = fallback.solve(scenario, "TURN_CAP")  # TODO: pick reason from the guardrail that fired
    history.append(log.append(make_message(
        "SYSTEM", "FALLBACK", phase, MAX_TURNS, proposal=proposal,
        suggestion={"reason_code": reason}, rationale=f"fallback: {reason}")))
    return "FALLBACK", proposal, reason


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", type=int, default=1, choices=[1, 2, 3])
    args = ap.parse_args()

    scenario = data.load_scenario(args.scenario)
    run_id = f"s{args.scenario}-{int(time.time())}"
    log = ChainLog(run_id)
    history = [log.append(make_message("PILOT", "ARRIVAL_REQUEST", 1, 0,
                                       rationale=f"{scenario['focus_flight']['flight']} requests arrival"))]

    status, proposal, reason = run_phase(1, scenario, history, log)
    # TODO (P3): human approval. On HUMAN_REJECT, add the reason as a constraint and run phase 2.
    # On a second reject, log HUMAN_CALL_DECISION.

    for m in history:
        tag = m.get("violated_constraint") or ""
        print(f"  [{m['phase']}.{m['turn']}] {m['sender']:7} {m['type']:15} {tag:13} {m['rationale']}")
    print(f"\nRESULT: {status}" + (f" ({reason})" if reason else ""))
    for k in ("runway", "gate", "eta", "delay_min"):
        print(f"  {k:9} {proposal[k]['value']!s:8} <- {proposal[k]['source']}")
    print(f"\nLog: {log.path}  verify: {verify(log.path)}")


if __name__ == "__main__":
    main()
