// Verifier for logs written by the Python backend (aeroclear/chainlog.py):
//   hash = sha256_hex(json.dumps(msg without "hash", sort_keys=True))
// with prev_hash inside msg and "GENESIS" as the first prev_hash.
// json.dumps defaults: ", " and ": " separators, non-ASCII escaped as \uXXXX.
// Numbers are kept as their original text, because JSON.parse would turn 48.0 into 48
// and change the hash. Feed this the raw log lines, not parsed objects.

import { sha256Hex } from "./hash";

export const PY_GENESIS = "GENESIS";

/** A JSON number kept as written, e.g. "48.0". */
class Num {
  readonly text: string;
  constructor(text: string) {
    this.text = text;
  }
}

type Raw = null | boolean | string | Num | Raw[] | { [k: string]: Raw };

export function parseRaw(text: string): Raw {
  let i = 0;
  const ws = () => {
    while (i < text.length && " \t\n\r".includes(text[i])) i++;
  };
  const value = (): Raw => {
    ws();
    const c = text[i];
    if (c === "{") {
      i++;
      const obj: Record<string, Raw> = {};
      ws();
      if (text[i] === "}") return i++, obj;
      for (;;) {
        ws();
        const k = value() as string;
        ws();
        i++; // :
        obj[k] = value();
        ws();
        if (text[i++] === "}") return obj;
      }
    }
    if (c === "[") {
      i++;
      const arr: Raw[] = [];
      ws();
      if (text[i] === "]") return i++, arr;
      for (;;) {
        arr.push(value());
        ws();
        if (text[i++] === "]") return arr;
      }
    }
    if (c === '"') {
      const start = i++;
      while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
      return JSON.parse(text.slice(start, ++i)) as string;
    }
    const m = /^(true|false|null|-?\d+(\.\d+)?([eE][+-]?\d+)?)/.exec(text.slice(i, i + 64));
    if (!m) throw new Error(`Bad JSON at ${i}`);
    i += m[0].length;
    return m[0] === "true" ? true : m[0] === "false" ? false : m[0] === "null" ? null : new Num(m[0]);
  };
  const out = value();
  ws();
  if (i !== text.length) throw new Error(`Trailing JSON at ${i}`);
  return out;
}

function pyString(s: string) {
  return JSON.stringify(s).replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** Python json.dumps(v, sort_keys=True). */
export function pyDumps(v: Raw): string {
  if (v === null) return "null";
  if (v === true) return "true";
  if (v === false) return "false";
  if (v instanceof Num) return v.text;
  if (typeof v === "string") return pyString(v);
  if (Array.isArray(v)) return `[${v.map(pyDumps).join(", ")}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${pyString(k)}: ${pyDumps(v[k])}`).join(", ")}}`;
}

/** Checks a run's messages, each given as raw JSON text, in log order. */
export async function verifyPyChain(rawMessages: string[]) {
  let prev = PY_GENESIS;
  for (let seq = 0; seq < rawMessages.length; seq++) {
    const msg = parseRaw(rawMessages[seq]) as Record<string, Raw>;
    const { hash, ...body } = msg;
    if (msg.prev_hash !== prev || (await sha256Hex(pyDumps(body))) !== hash) {
      return { ok: false, entries: rawMessages.length, first_bad_seq: seq };
    }
    prev = hash as string;
  }
  return { ok: true, entries: rawMessages.length };
}
