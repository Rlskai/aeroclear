// Backup for API failure during judging: the last clean run of each preset is kept in
// localStorage and can be replayed. Recordings live in this browser only, so record on
// the presenting laptop before judging.

import { useMemo, useSyncExternalStore } from "react";
import type { RunEvent } from "./types";

export interface Recording {
  presetId: string;
  label: string;
  recordedAt: string;
  /** ms since run start, per event */
  events: { t: number; event: RunEvent }[];
}

const key = (presetId: string) => `aeroclear.recording.${presetId}`;
const CHANGED = "aeroclear-recordings";

export function saveRecording(r: Recording) {
  try {
    localStorage.setItem(key(r.presetId), JSON.stringify(r));
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    // Storage full or disabled: the live run is unaffected.
  }
}

/** Gaps longer than this (human think time) are shortened on replay. */
export const MAX_REPLAY_GAP_MS = 1500;

function subscribe(cb: () => void) {
  window.addEventListener(CHANGED, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGED, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Saved recordings for the given presets, kept in sync with localStorage. */
export function useRecordings(presetIds: string[]): Record<string, Recording | null> {
  const ids = presetIds.join("|");
  // Snapshot is the raw strings joined, so it is stable between renders when nothing changed.
  const snap = useSyncExternalStore(
    subscribe,
    () => ids.split("|").map((id) => localStorage.getItem(key(id)) ?? "").join("\u0000"),
    () => "",
  );
  return useMemo(() => {
    const raws = snap ? snap.split("\u0000") : [];
    return Object.fromEntries(
      ids.split("|").map((id, i) => {
        try {
          return [id, raws[i] ? (JSON.parse(raws[i]) as Recording) : null];
        } catch {
          return [id, null];
        }
      }),
    );
  }, [snap, ids]);
}
