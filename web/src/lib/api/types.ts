import type { Approval, LogEntry, RunEvent, Scenario, VerifyResult } from "../types";

export interface ScenarioFilter {
  airport: string;
  delayType: "weather_late" | "late_only";
}

export interface NegotiationApi {
  mode: "mock" | "http";
  listScenarios(filter: ScenarioFilter): Promise<Scenario[]>;
  startRun(rowId: number, injectLowFuel: boolean): Promise<string>;
  /** Replays every event so far, then streams new ones. Returns an unsubscribe function. */
  subscribe(runId: string, onEvent: (e: RunEvent) => void): () => void;
  approve(runId: string, suggestionIndex: number, approval: Approval): Promise<void>;
  humanCall(runId: string, chosenSuggestion: number, note: string): Promise<void>;
  getLog(runId: string): Promise<LogEntry[]>;
  verify(runId: string): Promise<VerifyResult>;
  /** Mock only: edits one log entry in place so the verifier can be shown failing. */
  tamper?(runId: string): Promise<void>;
}
