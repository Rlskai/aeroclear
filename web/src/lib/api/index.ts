import { createHttpApi } from "./http";
import { createMockApi } from "./mock";
import type { NegotiationApi } from "./types";

// Set NEXT_PUBLIC_API_BASE (e.g. http://localhost:8000) to use the FastAPI backend.
// Unset, the UI runs on the in-browser mock and labels itself as such.
const base = process.env.NEXT_PUBLIC_API_BASE;

export const api: NegotiationApi = base ? createHttpApi(base) : createMockApi();
export type { NegotiationApi, ScenarioFilter } from "./types";
