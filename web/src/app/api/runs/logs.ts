// Server-only access to the Python backend's run logs (aeroclear/chainlog.py writes
// logs/<run_id>.jsonl relative to where the orchestrator runs: the repo root).

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

// Read at runtime only, outside the app: keep it out of build tracing.
export const LOGS_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.LOGS_DIR ?? path.join(process.cwd(), "..", "logs"));

const RUN_ID = /^[\w.-]+$/;

/** Path of a run's log, or null if the id could escape the logs folder. */
export function logPath(runId: string) {
  return RUN_ID.test(runId) && !runId.includes("..") ? path.join(LOGS_DIR, `${runId}.jsonl`) : null;
}

/** Complete lines only: a line still being written has no trailing newline yet. */
export async function readLines(file: string): Promise<string[]> {
  const text = await readFile(file, "utf8");
  return text.slice(0, text.lastIndexOf("\n") + 1).split("\n").filter(Boolean);
}

export async function listRuns() {
  let names: string[];
  try {
    names = (await readdir(LOGS_DIR)).filter((n) => n.endsWith(".jsonl"));
  } catch {
    return [];
  }
  const runs = await Promise.all(
    names.map(async (n) => {
      const file = path.join(LOGS_DIR, n);
      const [s, lines] = await Promise.all([stat(file), readLines(file)]);
      return { runId: n.slice(0, -".jsonl".length), messages: lines.length, lastAt: s.mtime.toISOString() };
    }),
  );
  return runs.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
