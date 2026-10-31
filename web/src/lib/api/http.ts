import type { Approval, LogEntry, RunEvent, Scenario, VerifyResult } from "../types";
import type { NegotiationApi, ScenarioFilter } from "./types";

// Client for the FastAPI backend. Endpoints are documented in web/README.md.
export function createHttpApi(base: string): NegotiationApi {
  const url = (path: string) => `${base.replace(/\/$/, "")}${path}`;

  async function json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url(path), {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    mode: "http",

    listScenarios: (f: ScenarioFilter) =>
      json<Scenario[]>(`/scenarios?airport=${encodeURIComponent(f.airport)}&delay_type=${f.delayType}`),

    startRun: async (rowId, lowFuel) =>
      (
        await json<{ run_id: string }>("/runs", {
          method: "POST",
          body: JSON.stringify({ row_id: rowId, inject: { low_fuel: lowFuel } }),
        })
      ).run_id,

    subscribe(runId, onEvent) {
      const es = new EventSource(url(`/runs/${runId}/stream`));
      es.onmessage = (m) => onEvent(JSON.parse(m.data) as RunEvent);
      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) onEvent({ kind: "error", message: "Stream closed by backend" });
      };
      return () => es.close();
    },

    approve: (runId, suggestionIndex, approval: Approval) =>
      json<void>(`/runs/${runId}/approvals`, {
        method: "POST",
        body: JSON.stringify({ suggestion_index: suggestionIndex, ...approval }),
      }),

    humanCall: (runId, chosenSuggestion, note) =>
      json<void>(`/runs/${runId}/human-call`, {
        method: "POST",
        body: JSON.stringify({ chosen_suggestion: chosenSuggestion, note }),
      }),

    getLog: (runId) => json<LogEntry[]>(`/runs/${runId}/log`),
    verify: (runId) => json<VerifyResult>(`/runs/${runId}/verify`),
    tamper: (runId) => json<void>(`/runs/${runId}/tamper`, { method: "POST" }),
    untamper: (runId) => json<void>(`/runs/${runId}/tamper/reset`, { method: "POST" }),
  };
}
