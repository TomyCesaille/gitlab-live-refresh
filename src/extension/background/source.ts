import { fetchFingerprint, type Fingerprint } from '../../core/fingerprint';
import { createGitLabClient } from '../../core/gitlab';
import type { PageRef } from '../../core/page';

const FORGET_AFTER_MS = 60_000;

export interface FingerprintSource {
  // A read younger than maxAgeMs is shared: several tabs on one page cost one.
  get(origin: string, page: PageRef, maxAgeMs: number): Promise<Fingerprint>;
}

export function fingerprintSource(
  fetch: typeof globalThis.fetch,
  timeoutMs: number,
): FingerprintSource {
  const recent = new Map<string, { at: number; read: Promise<Fingerprint> }>();

  return {
    get(origin, page, maxAgeMs) {
      const now = Date.now();
      for (const [key, entry] of recent) {
        if (now - entry.at > FORGET_AFTER_MS) recent.delete(key);
      }
      const key = `${origin} ${page.key}`;
      const hit = recent.get(key);
      if (hit && now - hit.at < maxAgeMs) return hit.read;

      const client = createGitLabClient({ origin, fetch, timeoutMs });
      const read = fetchFingerprint(client, page);
      recent.set(key, { at: now, read });
      read.catch(() => {
        if (recent.get(key)?.read === read) recent.delete(key);
      });
      return read;
    },
  };
}
