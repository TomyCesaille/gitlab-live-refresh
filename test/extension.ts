import { vi } from 'vitest';
import type { Browser } from '../src/extension/background/start';
import type { SessionArea } from '../src/extension/background/tabs';

// Values go through structuredClone, as they would through the real storage:
// no state is ever shared by reference.
export function memorySessionArea(): SessionArea & {
  data: Map<string, unknown>;
} {
  const data = new Map<string, unknown>();
  return {
    data,
    get(keys) {
      if (keys === null)
        return Promise.resolve(structuredClone(Object.fromEntries(data)));
      return Promise.resolve(
        data.has(keys) ? { [keys]: structuredClone(data.get(keys)) } : {},
      );
    },
    set(items) {
      for (const [key, value] of Object.entries(items)) {
        data.set(key, structuredClone(value));
      }
      return Promise.resolve();
    },
    remove(key) {
      data.delete(key);
      return Promise.resolve();
    },
  };
}

type Listener = (...args: never[]) => unknown;

function event() {
  const listeners: Listener[] = [];
  return {
    listeners,
    addListener: (listener: Listener) => {
      listeners.push(listener);
    },
    fire: (...args: unknown[]) =>
      listeners.map((listener) =>
        (listener as (...a: unknown[]) => unknown)(...args),
      ),
  };
}

export function fakeExtensionBrowser(granted: string[] = []) {
  const fake = {
    storage: { session: memorySessionArea() },
    tabs: {
      reload: vi.fn(() => Promise.resolve()),
      query: vi.fn(() => Promise.resolve([] as { id?: number }[])),
      onRemoved: event(),
    },
    alarms: {
      create: vi.fn(() => Promise.resolve()),
      onAlarm: event(),
    },
    runtime: {
      onMessage: event(),
      onInstalled: event(),
      onStartup: event(),
    },
    permissions: {
      getAll: vi.fn(() => Promise.resolve({ origins: granted })),
      onAdded: event(),
      onRemoved: event(),
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(() =>
        Promise.resolve([] as { id: string }[]),
      ),
      registerContentScripts: vi.fn(() => Promise.resolve()),
      unregisterContentScripts: vi.fn(() => Promise.resolve()),
      executeScript: vi.fn(() => Promise.resolve([])),
    },
  };
  return { fake, browser: fake as unknown as Browser };
}
