export interface Timing {
  pollMs: number; // a visible tab asks GitLab whether anything changed this often
  hiddenPollMs: number; // same for a background tab
  maxBackoffMs: number; // ceiling of the backoff while the API keeps failing
  idleMs: number; // no input for this long before an automatic reload
  editSettleMs: number; // an edit-only change waits until the page stops changing for this long
  reloadGapMs: number; // after an automatic reload, the next one waits this long in a visible tab
  hiddenReloadGapMs: number; // same in a background tab: coming back reloads it at once anyway
  recheckMs: number; // while a reload waits on you, how often to check again
  requestTimeoutMs: number;
  errorReloadLimit: number; // automatic reloads per page on "Something went wrong", until a reload by hand
  scrollRestoreMs: number; // how long a reloaded page gets to grow back to the saved scroll position
  reloadMarkerMs: number; // a reload marker older than this belongs to another visit
  arrivalDedupeMs: number; // a tab switch fires both visibilitychange and focus
}

export const TIMING: Timing = {
  pollMs: 15_000,
  hiddenPollMs: 60_000,
  maxBackoffMs: 5 * 60_000,
  idleMs: 8_000,
  editSettleMs: 30_000,
  reloadGapMs: 45_000,
  hiddenReloadGapMs: 3 * 60_000,
  recheckMs: 1_000,
  requestTimeoutMs: 10_000,
  errorReloadLimit: 3,
  scrollRestoreMs: 10_000,
  reloadMarkerMs: 60_000,
  arrivalDedupeMs: 1_000,
};
