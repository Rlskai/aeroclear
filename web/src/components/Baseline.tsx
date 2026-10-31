import type { BaselineTable } from "@/lib/types";

const PLACEHOLDER: BaselineTable = {
  columns: [
    { key: "nothing", label: "Do nothing" },
    { key: "fallback", label: "Fallback" },
    { key: "negotiated", label: "Negotiated" },
  ],
  rows: ["Total delay (min)", "Holding (min)", "Est. holding fuel (kg)", "Violations"].map((metric) => ({ metric, values: {} })),
};

export function Baseline({ table, mock }: { table: BaselineTable | null; mock: boolean }) {
  const t = table ?? PLACEHOLDER;
  return (
    <section className="card" aria-labelledby="h-base">
      <h2 id="h-base">5. Baseline comparison</h2>
      <p className="sub">
        {table
          ? `${mock ? "MOCK values from the in-browser simulator. " : ""}Lower is better. Fuel uses constraints.xlsx:fuel_and_crew burn rates.`
          : "Appears with Suggestion 1 and updates on the final decision."}
      </p>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            {t.columns.map((c) => (
              <th key={c.key} className={table && c.highlight ? "hl" : ""}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r) => {
            const violations = r.metric === "Violations";
            return (
              <tr key={r.metric}>
                <td>{r.metric}</td>
                {t.columns.map((c) => {
                  const v = r.values[c.key];
                  const cls = [table && c.highlight ? "hl" : "", violations && v ? "viol" : ""].join(" ").trim();
                  return (
                    <td key={c.key} className={cls}>
                      {v == null ? "–" : violations && v ? `${v} ✗` : v.toLocaleString()}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
