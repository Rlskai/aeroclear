import { connection } from "next/server";
import { LOGS_DIR, listRuns } from "./logs";

/** GET /api/runs -> {dir, runs: [{runId, messages, lastAt}]}, newest first. */
export async function GET() {
  await connection(); // log files change: always read at request time, never prerender
  return Response.json({ dir: LOGS_DIR, runs: await listRuns() });
}
