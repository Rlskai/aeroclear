import type { LogEntry } from "./types";

// Hash rule shared with the backend:
//   hash = sha256_hex(prev_hash + canonical_json(entry without "hash"))
// canonical_json = keys sorted, no whitespace, non-ASCII kept as-is.
// Python equivalent: json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

export const GENESIS_HASH = "0".repeat(64);

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashEntry(entry: Omit<LogEntry, "hash">): Promise<string> {
  return sha256Hex(entry.prev_hash + canonicalJson(entry));
}

export async function verifyChain(entries: LogEntry[]) {
  let prev = GENESIS_HASH;
  for (const e of entries) {
    const { hash, ...rest } = e;
    if (e.prev_hash !== prev || (await hashEntry(rest)) !== hash) {
      return { ok: false, entries: entries.length, first_bad_seq: e.seq };
    }
    prev = hash;
  }
  return { ok: true, entries: entries.length };
}

export const short = (h: string) => h.slice(0, 6);
