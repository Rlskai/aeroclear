"use client";

import { useEffect, useState } from "react";
import { api, type ScenarioFilter } from "@/lib/api";
import type { LowFuel, Scenario } from "@/lib/types";

const AIRPORTS = ["ORD", "DFW", "ATL"];

export function ScenarioPicker({
  busy,
  onRun,
}: {
  busy: boolean;
  onRun: (rowId: number, lowFuel: LowFuel) => void;
}) {
  const [airport, setAirport] = useState("ORD");
  const [delayType, setDelayType] = useState<ScenarioFilter["delayType"]>("weather_late");
  const [rows, setRows] = useState<Scenario[]>([]);
  const [rowId, setRowId] = useState<number | null>(null);
  const [lowFuel, setLowFuel] = useState<LowFuel>("off");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .listScenarios({ airport, delayType })
      .then((r) => {
        if (!live) return;
        setRows(r);
        setRowId(r[0]?.row_id ?? null);
        setLoadError(null);
      })
      .catch((e: Error) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, [airport, delayType]);

  const sc = rows.find((r) => r.row_id === rowId);

  return (
    <section className="card" aria-labelledby="h-scn">
      <h2 id="h-scn">1. Scenario picker (User mode)</h2>
      <p className="sub">
        Pick one flights.csv row with WEATHER_DELAY &gt; 15 or LATE_AIRCRAFT_DELAY &gt; 20. That row is the disruption.
      </p>
      <div className="row">
        <div className="fld">
          <label htmlFor="ap">Airport</label>
          <select id="ap" value={airport} onChange={(e) => setAirport(e.target.value)} disabled={busy}>
            {AIRPORTS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="dl">Delay type</label>
          <select
            id="dl"
            value={delayType}
            onChange={(e) => setDelayType(e.target.value as ScenarioFilter["delayType"])}
            disabled={busy}
          >
            <option value="weather_late">Weather + late aircraft</option>
            <option value="late_only">Late aircraft only</option>
          </select>
        </div>
        <div className="fld">
          <label htmlFor="rw">Row</label>
          <select id="rw" value={rowId ?? ""} onChange={(e) => setRowId(Number(e.target.value))} disabled={busy || !rows.length}>
            {!rows.length && <option value="">No matching rows</option>}
            {rows.map((r) => (
              <option key={r.row_id} value={r.row_id}>
                Row {r.row_id} · {r.airline}
                {r.flight_number} {r.origin}→{r.destination}
              </option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="lf">Injected low fuel</label>
          <select id="lf" value={lowFuel} onChange={(e) => setLowFuel(e.target.value as LowFuel)} disabled={busy}>
            <option value="off">Off</option>
            <option value="moderate">Moderate (usable hold 10 min)</option>
            <option value="severe">Severe (usable hold 5 min)</option>
          </select>
        </div>
        <button className="btn" type="button" disabled={busy || rowId == null} onClick={() => rowId != null && onRun(rowId, lowFuel)}>
          {busy ? "Negotiating…" : "Run negotiation"}
        </button>
      </div>
      {loadError && <p className="err" role="alert">Could not load scenarios: {loadError}</p>}
      <div className="chips">
        <span className="chip">Weather delay: {sc ? sc.weather_delay : "–"} min</span>
        <span className="chip">Late aircraft: {sc ? sc.late_aircraft_delay : "–"} min</span>
        <span className="chip">
          Class: {sc ? `${sc.wake_class} (${sc.distance} mi)` : "–"} (ASSUMPTION)
        </span>
        {sc && sc.weather_delay > 0 && <span className="chip">Runway ops cut to 50% (ASSUMPTION)</span>}
        {lowFuel !== "off" && (
          <span className="chip">{lowFuel === "severe" ? "Severe: no safe slot → fallback (3b)" : "Moderate: agents recover (3a)"}</span>
        )}
      </div>
    </section>
  );
}
