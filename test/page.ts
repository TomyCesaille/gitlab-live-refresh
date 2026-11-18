import { vi, type Mock } from 'vitest';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

export interface FakeGitLab {
  // keyed by pathname + search, or '/api/graphql' for every GraphQL query
  answers: Map<string, unknown>;
  fetch: Mock<typeof fetch>;
  failNext(times?: number): void;
  hold(): () => void;
}

export function fakeGitLab(answers: Record<string, unknown>): FakeGitLab {
  const state = { failures: 0, held: null as Promise<void> | null };
  const map = new Map(Object.entries(answers));
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    if (state.held) await state.held;
    const url = new URL(input as string);
    if (state.failures > 0) {
      state.failures -= 1;
      return new Response('{}', { status: 502 });
    }
    const key =
      url.pathname === '/api/graphql'
        ? url.pathname
        : url.pathname + url.search;
    if (url.pathname === '/api/v4/version') return new Response('{}');
    if (!map.has(key)) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(map.get(key)));
  });
  return {
    answers: map,
    fetch,
    failNext(times = 1) {
      state.failures = times;
    },
    hold() {
      let release: () => void = () => undefined;
      state.held = new Promise((resolve) => {
        release = () => {
          state.held = null;
          resolve();
        };
      });
      return release;
    },
  };
}

export interface FakeWindow {
  win: Window;
  doc: Document;
  events: EventTarget;
  location: URL & { reload: Mock };
  session: Storage;
  local: Storage;
  setHidden(hidden: boolean): void;
  dispatch(type: string): void;
}

// A window of its own per test: its own document, location, storage and event
// target, so watchers from different tests never hear each other.
export function fakeWindow(url: string, gitlab: FakeGitLab): FakeWindow {
  const doc = document.implementation.createHTMLDocument('GitLab');
  let hidden = false;
  Object.defineProperty(doc, 'hidden', { get: () => hidden });
  const events = new EventTarget();
  const location = Object.assign(new URL(url), { reload: vi.fn() });
  const session = new MemoryStorage();
  const local = new MemoryStorage();
  const win = {
    document: doc,
    location,
    sessionStorage: session,
    localStorage: local,
    fetch: gitlab.fetch,
    addEventListener: events.addEventListener.bind(events),
  } as unknown as Window;
  return {
    win,
    doc,
    events,
    location,
    session,
    local,
    setHidden(next) {
      hidden = next;
    },
    dispatch(type) {
      events.dispatchEvent(new Event(type));
    },
  };
}
