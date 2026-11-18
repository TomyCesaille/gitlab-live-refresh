import { describe, expect, it, vi } from 'vitest';
import { memoryStore, webStore } from './storage';

describe('webStore', () => {
  it('keeps JSON values', () => {
    const store = webStore(() => sessionStorage);

    store.set('k', { a: 1 });
    expect(store.get('k')).toEqual({ a: 1 });
    store.remove('k');
    expect(store.get('k')).toBeNull();
  });

  it('reads blocked or corrupt storage as nothing stored', () => {
    const blocked = webStore(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    sessionStorage.setItem('corrupt', '{');

    expect(blocked.get('k')).toBeNull();
    expect(() => {
      blocked.set('k', 1);
      blocked.remove('k');
    }).not.toThrow();
    expect(webStore(() => sessionStorage).get('corrupt')).toBeNull();
  });

  it('survives a full storage on write', () => {
    const full = {
      setItem: vi.fn(() => {
        throw new DOMException('full', 'QuotaExceededError');
      }),
    } as unknown as Storage;

    expect(() => {
      webStore(() => full).set('k', 1);
    }).not.toThrow();
  });
});

describe('memoryStore', () => {
  it('keeps values for the life of the page', () => {
    const store = memoryStore();

    expect(store.get('k')).toBeNull();
    store.set('k', 2);
    expect(store.get('k')).toBe(2);
    store.remove('k');
    expect(store.get('k')).toBeNull();
  });
});
