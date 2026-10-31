"""Shared Claude helper for all three agents. Change with care: everyone uses it."""
import json
import os

MODEL = os.getenv("AGENT_MODEL", "claude-haiku-5-5")

# Tool-forced JSON: the model must answer by "calling" this tool.
REPLY_TOOL = {
    "name": "reply",
    "description": "Send your one structured message for this turn.",
    "input_schema": {
        "type": "object",
        "properties": {
            "type": {"type": "string", "enum": ["PROPOSE", "ACCEPT", "REJECT", "INFO_RESPONSE"]},
            "candidate_index": {"type": "integer", "description": "ATC only: index into the shortlist to propose"},
            "violated_constraint": {"type": ["string", "null"],
                                    "enum": ["FUEL_RESERVE", "WAKE_SEP", "GATE_OVERLAP", "CREW_DUTY", None]},
            "suggestion": {"type": "object", "description": "Counter-suggestion when rejecting"},
            "rationale": {"type": "string"},
        },
        "required": ["type", "rationale"],
    },
}


def ask_claude(system_prompt, history, private):
    """Returns the tool input dict, e.g. {"type": "ACCEPT", "rationale": "..."}.
    One retry on malformed output; raises if it fails twice (orchestrator then falls back)."""
    import anthropic
    client = anthropic.Anthropic()
    user = (
        "Shared negotiation history:\n" + json.dumps(history, indent=1) +
        "\n\nYour private state (others cannot see this):\n" + json.dumps(private, indent=1) +
        "\n\nReply with exactly one message using the reply tool."
    )
    for _ in range(2):
        resp = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=system_prompt,
            tools=[REPLY_TOOL],
            tool_choice={"type": "tool", "name": "reply"},
            messages=[{"role": "user", "content": user}],
        )
        for block in resp.content:
            if block.type == "tool_use" and block.input.get("type"):
                return block.input
    raise RuntimeError("agent returned malformed output twice")
