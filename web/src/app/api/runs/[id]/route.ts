import { connection } from "next/server";
import { logPath, readLines } from "../logs";

/** GET /api/runs/<id>?from=n -> {lines: raw JSONL lines from index n, total}. Lines are returned as written, for hashing. */
export async function GET(request: Request, { params }: RouteContext<"/api/runs/[id]">) {
  await connection();
  const { id } = await params;
  const file = logPath(id);
  if (!file) return Response.json({ error: "Bad run id" }, { status: 400 });
  const from = Math.max(0, Number(new URL(request.url).searchParams.get("from")) || 0);
  try {
    const lines = await readLines(file);
    return Response.json({ lines: lines.slice(from), total: lines.length });
  } catch {
    return Response.json({ error: `No log for run ${id}` }, { status: 404 });
  }
}
