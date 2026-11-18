import { describe, expect, it } from 'vitest';
import {
  errorReloadsSpent,
  markReload,
  rearmErrorReloads,
  spendErrorReload,
  takeReloadMarker,
} from './session';
import { memoryStore } from './storage';

const url = 'https://gitlab.example.com/g/p/-/merge_requests/1';
const marker = { url, at: 1_000, manual: false, reason: 'changed: pipeline' };

describe('reload markers', () => {
  it('hands back the marker of a reload of this page, once', () => {
    const store = memoryStore();
    markReload(store, marker);

    expect(takeReloadMarker(store, url, 2_000, 60_000)).toEqual(marker);
    expect(takeReloadMarker(store, url, 2_000, 60_000)).toBeNull();
  });

  it('ignores a marker for another page or from another visit', () => {
    const store = memoryStore();
    markReload(store, marker);
    expect(takeReloadMarker(store, `${url}/diffs`, 2_000, 60_000)).toBeNull();

    markReload(store, marker);
    expect(takeReloadMarker(store, url, 61_000, 60_000)).toBeNull();
  });
});

describe('error reload budget', () => {
  it('counts automatic reloads per page', () => {
    const store = memoryStore();

    expect(errorReloadsSpent(store, url)).toBe(0);
    spendErrorReload(store, url);
    spendErrorReload(store, url);
    expect(errorReloadsSpent(store, url)).toBe(2);
    expect(errorReloadsSpent(store, `${url}/diffs`)).toBe(0);
  });

  it('re-arms', () => {
    const store = memoryStore();
    spendErrorReload(store, url);
    rearmErrorReloads(store);

    expect(errorReloadsSpent(store, url)).toBe(0);
  });
});
