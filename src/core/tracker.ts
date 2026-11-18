import { absorbUnknowns, changedKeys } from './changes';
import type { Fingerprint } from './fingerprint';

// Plain data, so an extension background can keep it in session storage.
export interface TrackerState {
  snapshot: {
    baseline: Fingerprint; // what the page showed when it loaded
    latest: Fingerprint;
  } | null;
  changed: string[]; // keys that differ from the baseline
  moved: string[]; // keys that differ from the previous observation
  lastMoveAt: number;
}

export const emptyTracker = (): TrackerState => ({
  snapshot: null,
  changed: [],
  moved: [],
  lastMoveAt: 0,
});

export function observe(
  state: TrackerState,
  current: Fingerprint,
  now: number,
): TrackerState {
  if (!state.snapshot) {
    return {
      ...emptyTracker(),
      snapshot: { baseline: current, latest: current },
    };
  }
  const baseline = absorbUnknowns(state.snapshot.baseline, current);
  const latest = absorbUnknowns(state.snapshot.latest, current);
  const moved = changedKeys(latest, current);
  return {
    snapshot: { baseline, latest: current },
    changed: changedKeys(baseline, current),
    moved,
    lastMoveAt: moved.length > 0 ? now : state.lastMoveAt,
  };
}

// You dismissed the banner: what the server shows now is the new normal.
export function acknowledge(state: TrackerState): TrackerState {
  const snapshot = state.snapshot && {
    baseline: state.snapshot.latest,
    latest: state.snapshot.latest,
  };
  return { ...state, snapshot, changed: [], moved: [] };
}
