import type { Fingerprint, FingerprintValue } from './fingerprint';

// Edits (a bot rewriting its comment, a description or label change) only move
// `updatedAt`. Bots rewrite the same comment several times in a row, so an
// edit-only change waits for the page to sit still.
const EDIT_KEYS = new Set(['updatedAt']);

const LABELS: Record<string, string> = {
  state: 'state',
  commits: 'commits',
  comments: 'comments',
  pipeline: 'pipeline',
  mergeability: 'merge status',
  approvals: 'approvals',
  updatedAt: 'edits',
  status: 'status',
  jobs: 'jobs',
  downstream: 'downstream pipelines',
  pipelines: 'pipelines',
};

export const isUrgent = (keys: readonly string[]) =>
  keys.some((key) => !EDIT_KEYS.has(key));

export function changedKeys(before: Fingerprint, after: Fingerprint): string[] {
  return Object.keys(after).filter(
    (key) => after[key] !== undefined && after[key] !== before[key],
  );
}

// A key the reference missed (unknown at the time) adopts its first known
// value instead of reading as a change.
export function absorbUnknowns(
  reference: Fingerprint,
  current: Fingerprint,
): Fingerprint {
  const absorbed: Record<string, FingerprintValue> = { ...reference };
  for (const [key, value] of Object.entries(current)) {
    if (absorbed[key] === undefined && value !== undefined)
      absorbed[key] = value;
  }
  return absorbed;
}

// `updatedAt` moves with every other change, so it names the change only when
// nothing more specific did.
export function describeChanges(keys: readonly string[]): string {
  const specific =
    keys.length > 1 ? keys.filter((k) => !EDIT_KEYS.has(k)) : keys;
  return specific.map((key) => LABELS[key] ?? key).join(', ');
}
