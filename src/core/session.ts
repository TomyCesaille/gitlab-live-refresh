import type { KeyValueStore } from './storage';

// Per-tab memory that survives a reload, kept in sessionStorage.

export interface ReloadMarker {
  url: string;
  at: number;
  manual: boolean; // a reload you asked for re-arms the error-reload cap, as the browser's does
  reason: string;
}

const MARKER = 'gl-live-refresh:auto-reload';
const ERROR_RELOADS = 'gl-live-refresh:error-reloads';

export function markReload(store: KeyValueStore, marker: ReloadMarker): void {
  store.set(MARKER, marker);
}

export function takeReloadMarker(
  store: KeyValueStore,
  url: string,
  now: number,
  maxAgeMs: number,
): ReloadMarker | null {
  const marker = store.get(MARKER) as ReloadMarker | null;
  store.remove(MARKER);
  if (marker?.url !== url || now - marker.at >= maxAgeMs) return null;
  return marker;
}

export function errorReloadsSpent(store: KeyValueStore, url: string): number {
  const spent = store.get(ERROR_RELOADS) as {
    url: string;
    count: number;
  } | null;
  return spent?.url === url ? spent.count : 0;
}

export function spendErrorReload(store: KeyValueStore, url: string): void {
  store.set(ERROR_RELOADS, { url, count: errorReloadsSpent(store, url) + 1 });
}

export function rearmErrorReloads(store: KeyValueStore): void {
  store.remove(ERROR_RELOADS);
}
