import type { BaselineRow } from "@/lib/types";

const COLS = ["do_nothing", "fallback", "negotiated"] as const;

export function Baseline({ rows, mock }: { rows: BaselineRow[] | null; mock: boolean }) {
  return (
    <section className="card" aria-labelledby="h-base">
      <h2 id="h-base">5. Baseline comparison</h2>
      <p className="sub">
        {rows
          ? mock
            ? "MOCK values from the in-browser simulator, not computed from flights.csv."
            : "Do nothing vs deterministic fallback vs negotiated plan, for this row."
          : "Placeholder values until the scenario runs."}
      </p>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Do nothing</th>
            <th>Fallback</th>
            <th>Negotiated</th>
          </tr>
        </thead>
        <tbody>
          {(rows ?? PLACEHOLDER).map((r) => {
            const vals = COLS.map((c) => r[c]).filter((v): v is number => v != null);
            const best = vals.length ? Math.min(...vals) : null;
            return (
              <tr key={r.metric}>
                <td>{r.metric}</td>
                {COLS.map((c) => (
                  <td key={c} className={rows && r[c] != null && r[c] === best ? "best" : ""}>
                    {r[c] == null ? (rows && c === "negotiated" ? "n/a" : "–") : r[c].toLocaleString()}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

const PLACEHOLDER: BaselineRow[] = ["Total delay (min)", "Holding (min)", "Est. holding fuel (kg)", "Violations"].map(
  (metric) => ({ metric, do_nothing: null, fallback: null, negotiated: null }),
);
