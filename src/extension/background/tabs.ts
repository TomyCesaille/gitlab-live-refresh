import type { PageRef } from '../../core/page';
import type { ReloadMarker } from '../../core/session';
import type { TrackerState } from '../../core/tracker';

export interface TabState {
  origin: string;
  url: string;
  page: PageRef | null;
  visible: boolean;
  busy: boolean; // unsent work when the tab went away: never reload it there
  tracker: TrackerState;
  lastSeenAt: number; // last message from the page
  lastPollAt: number; // last time the background read the page's server state
  lastAutoReloadAt: number;
  reload: ReloadMarker | null; // handed to the page that loads next
}

export interface SessionArea {
  get(keys: string | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string): Promise<void>;
}

const PREFIX = 'tab:';

// A service worker can stop between two events: tab state lives in session
// storage, which outlives the worker and is cleared with the browser session.
export function tabStore(area: SessionArea) {
  return {
    async get(tabId: number): Promise<TabState | null> {
      const key = `${PREFIX}${String(tabId)}`;
      return ((await area.get(key))[key] as TabState | undefined) ?? null;
    },
    set(tabId: number, state: TabState): Promise<void> {
      return area.set({ [`${PREFIX}${String(tabId)}`]: state });
    },
    remove(tabId: number): Promise<void> {
      return area.remove(`${PREFIX}${String(tabId)}`);
    },
    async all(): Promise<[number, TabState][]> {
      return Object.entries(await area.get(null))
        .filter(([key]) => key.startsWith(PREFIX))
        .map(([key, state]) => [
          Number(key.slice(PREFIX.length)),
          state as TabState,
        ]);
    },
  };
}

export type TabStore = ReturnType<typeof tabStore>;
