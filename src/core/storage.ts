export interface KeyValueStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}

// Web storage throws when site data is blocked: every failure reads as
// "nothing stored", and the features that lean on it degrade, never the reload.
export function webStore(storage: () => Storage): KeyValueStore {
  return {
    get(key) {
      try {
        return JSON.parse(storage().getItem(key) ?? 'null') as unknown;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        storage().setItem(key, JSON.stringify(value));
      } catch {
        // best effort
      }
    },
    remove(key) {
      try {
        storage().removeItem(key);
      } catch {
        // best effort
      }
    },
  };
}

export function memoryStore(): KeyValueStore {
  const values = new Map<string, unknown>();
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  };
}
