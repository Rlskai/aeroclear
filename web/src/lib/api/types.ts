import type { Approval, LogEntry, LowFuel, RunEvent, Scenario, VerifyResult } from "../types";

export interface ScenarioFilter {
  airport: string;
  delayType: "weather_late" | "late_only";
}

export interface NegotiationApi {
  mode: "mock" | "http";
  listScenarios(filter: ScenarioFilter): Promise<Scenario[]>;
  startRun(rowId: number, lowFuel: LowFuel): Promise<string>;
  /** Replays every event so far, then streams new ones. Returns an unsubscribe function. */
  subscribe(runId: string, onEvent: (e: RunEvent) => void): () => void;
  approve(runId: string, suggestionIndex: number, approval: Approval): Promise<void>;
  humanCall(runId: string, chosenSuggestion: number, note: string): Promise<void>;
  getLog(runId: string): Promise<LogEntry[]>;
  verify(runId: string): Promise<VerifyResult>;
  /** Demo: edits one stored log entry so the verifier fails. Never touches the log file. */
  tamper(runId: string): Promise<void>;
  /** Demo: undoes tamper(). */
  untamper(runId: string): Promise<void>;
}
