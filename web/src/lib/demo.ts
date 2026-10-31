// Demo-mode presets (demo-userflow.md sections 2 and 6-8).
// Row ids are the mock rows until the real flights.csv rows are chosen (demoflow.md "<TBD>").

import type { LowFuel, Role } from "./types";

export type PresetId = "S1" | "S2" | "S3";

export interface ScriptedReject {
  role: Role;
  reason: string;
}

export interface Preset {
  id: PresetId;
  label: string;
  blurb: string;
  rowId: number;
  lowFuel: LowFuel;
  /** Show the tamper demo for this scenario. */
  tamper: boolean;
  /** Scripted human rejection per suggestion index. Roles not listed approve. */
  rejects: Partial<Record<1 | 2, ScriptedReject>>;
  humanCall?: { chosen: 1 | 2; note: string };
}

export const PRESETS: Preset[] = [
  {
    id: "S1",
    label: "S1 Happy path",
    blurb: "ORD weather + late aircraft. Consensus in turn 2, 3/3 approve, tamper demo.",
    rowId: 104233,
    lowFuel: "off",
    tamper: true,
    rejects: {},
  },
  {
    id: "S2",
    label: "S2 Ground-driven",
    blurb: "Late aircraft holding gates. Ground's GATE_OVERLAP reject changes the answer.",
    rowId: 98410,
    lowFuel: "off",
    tamper: false,
    rejects: {},
  },
  {
    id: "S3",
    label: "S3 Low fuel",
    blurb: "S1 + severe low fuel. Checker block, fallback to MDW, then MKE, then human call.",
    rowId: 104233,
    lowFuel: "severe",
    tamper: false,
    rejects: {
      1: {
        role: "PILOT",
        reason:
          "MDW is 17 mi from ORD and under the same weather cell. Diverting there risks a second hold on fuel we don't have.",
      },
      2: {
        role: "GROUND",
        reason:
          "MKE is a small hub with only 2 spare gates, both committed at the ETA. Handling an unplanned diversion would push the ground crew past their 8 h shift into 1.5x overtime.",
      },
    },
    humanCall: { chosen: 2, note: "Accept MKE; ops to call in extra ground crew, overtime approved." },
  },
];

export const presetById = (id: string | undefined) => PRESETS.find((p) => p.id === id);
