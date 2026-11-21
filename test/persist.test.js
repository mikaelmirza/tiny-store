import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStore } from '../src/index.js';
import { persist, logger } from '../src/middleware/index.js';

/** An in-memory storage adapter with the same API as localStorage. */
const memoryStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key) => (data.has(key) ? data.get(key) : null)),
    setItem: vi.fn((key, value) => data.set(key, String(value))),
    removeItem: vi.fn((key) => data.delete(key)),
    data,
  };
};

const saved = (state, version = 0) => JSON.stringify({ state, version });
const read = (storage, key = 'settings') => JSON.parse(storage.data.get(key));

const settings = (set) => ({
  theme: 'light',
  fontSize: 14,
  toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('persist', () => {
  describe('saving', () => {
    it('saves after an action changes state', () => {
      const storage = memoryStorage();
      const store = createStore(persist(settings, { key: 'settings', storage }));

      store.getState().toggleTheme();

      expect(read(storage)).toEqual({
        state: { theme: 'dark', fontSize: 14 }, // functions are left out
        version: 0,
      });
    });

    it('saves after store.setState from outside', () => {
      const storage = memoryStorage();
      const store = createStore(persist(settings, { key: 'settings', storage }));

      store.setState({ fontSize: 18 });

      expect(read(storage).state.fontSize).toBe(18);
    });

    it('does not save on no-op updates', () => {
      const storage = memoryStorage();
      const store = createStore(persist(settings, { key: 'settings', storage }));

      store.setState({ theme: 'light' });

      expect(storage.setItem).not.toHaveBeenCalled();
    });

    it('does not write anything just from creating the store', () => {
      const storage = memoryStorage();
      createStore(persist(settings, { key: 'settings', storage }));
      expect(storage.setItem).not.toHaveBeenCalled();
    });

    it('saves only what partialize picks', () => {
      const storage = memoryStorage();
      const store = createStore(
        persist(settings, {
          key: 'settings',
          storage,
          partialize: (s) => ({ theme: s.theme }),
        })
      );

      store.setState({ theme: 'dark', fontSize: 20 });

      expect(read(storage).state).toEqual({ theme: 'dark' });
    });

    it('still saves when a listener throws, since the state changed', () => {
      const storage = memoryStorage();
      const store = createStore(persist(settings, { key: 'settings', storage }));
      store.subscribe(() => {
        throw new Error('boom');
      });

      expect(() => store.getState().toggleTheme()).toThrow('boom');
      expect(read(storage).state.theme).toBe('dark');
    });

    it('reports save failures (e.g. quota exceeded) without breaking the store', () => {
      const storage = memoryStorage();
      const quotaError = new Error('QuotaExceededError');
      storage.setItem.mockImplementation(() => {
        throw quotaError;
      });
      const onError = vi.fn();
      const store = createStore(persist(settings, { key: 'settings', storage, onError }));

      store.getState().toggleTheme();

      expect(onError).toHaveBeenCalledWith(quotaError);
      expect(store.getState().theme).toBe('dark');
    });

    it('reports values JSON cannot serialize', () => {
      const storage = memoryStorage();
      const onError = vi.fn();
      const store = createStore(persist({ n: 0n }, { key: 'k', storage, onError }));

      store.setState({ n: 1n }); // BigInt can't be stringified

      expect(onError).toHaveBeenCalledWith(expect.any(TypeError));
    });
  });

  describe('restoring', () => {
    it('restores saved state when the store is created', () => {
      const storage = memoryStorage({ settings: saved({ theme: 'dark', fontSize: 20 }) });
      const store = createStore(persist(settings, { key: 'settings', storage }));

      expect(store.getState().theme).toBe('dark');
      expect(store.getState().fontSize).toBe(20);
    });

    it('keeps actions and fills in keys missing from the saved copy', () => {
      const storage = memoryStorage({ settings: saved({ theme: 'dark' }) });
      const store = createStore(persist(settings, { key: 'settings', storage }));

      expect(store.getState().fontSize).toBe(14); // from the initializer
      store.getState().toggleTheme();
      expect(store.getState().theme).toBe('light');
    });

    it('restores without notifying listeners or saving again', () => {
      const storage = memoryStorage({ settings: saved({ theme: 'dark' }) });
      const store = createStore(persist(settings, { key: 'settings', storage }));
      const listener = vi.fn();
      store.subscribe(listener);

      expect(listener).not.toHaveBeenCalled();
      expect(storage.setItem).not.toHaveBeenCalled();
    });

    it('round-trips: a new store picks up what an old one saved', () => {
      const storage = memoryStorage();
      const first = createStore(persist(settings, { key: 'settings', storage }));
      first.getState().toggleTheme();
      first.setState({ fontSize: 22 });

      const second = createStore(persist(settings, { key: 'settings', storage }));

      expect(second.getState().theme).toBe('dark');
      expect(second.getState().fontSize).toBe(22);
    });

    it('uses a custom merge function', () => {
      const storage = memoryStorage({
        settings: saved({ theme: 'dark', fontSize: 99 }),
      });
      const store = createStore(
        persist(settings, {
          key: 'settings',
          storage,
          // Only trust the saved theme.
          merge: (persisted, current) => ({ ...current, theme: persisted.theme }),
        })
      );

      expect(store.getState().theme).toBe('dark');
      expect(store.getState().fontSize).toBe(14);
    });

    it('treats saved data with no version as version 0', () => {
      const storage = memoryStorage({
        settings: JSON.stringify({ state: { theme: 'dark' } }),
      });
      const store = createStore(persist(settings, { key: 'settings', storage }));
      expect(store.getState().theme).toBe('dark');
    });

    it.each([
      ['invalid JSON', '{not json'],
      ['a non-object', '42'],
      ['a missing state field', JSON.stringify({ version: 0 })],
      ['an array state', JSON.stringify({ state: [1, 2], version: 0 })],
    ])('falls back to the initial state for %s', (_, raw) => {
      const storage = memoryStorage({ settings: raw });
      const onError = vi.fn();
      const store = createStore(persist(settings, { key: 'settings', storage, onError }));

      expect(store.getState().theme).toBe('light');
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('falls back to the initial state if reading storage throws', () => {
      const storage = memoryStorage();
      storage.getItem.mockImplementation(() => {
        throw new Error('SecurityError');
      });
      const onError = vi.fn();
      const store = createStore(persist(settings, { key: 'settings', storage, onError }));

      expect(store.getState().theme).toBe('light');
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'SecurityError' })
      );
    });

    it('warns on the console by default', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const storage = memoryStorage({ settings: '{not json' });

      createStore(persist(settings, { key: 'settings', storage }));

      expect(warn).toHaveBeenCalledWith('[tiny-store/persist]', expect.any(SyntaxError));
    });
  });

  describe('versions and migrations', () => {
    it('discards saved state from another version when there is no migrate', () => {
      const storage = memoryStorage({ settings: saved({ theme: 'dark' }, 1) });
      const store = createStore(
        persist(settings, { key: 'settings', storage, version: 2 })
      );
      expect(store.getState().theme).toBe('light');
    });

    it('migrates saved state from an older version', () => {
      // v1 stored { dark: boolean }; v2 stores { theme: 'light' | 'dark' }.
      const storage = memoryStorage({ settings: saved({ dark: true }, 1) });
      const migrate = vi.fn((old, fromVersion) =>
        fromVersion === 1 ? { theme: old.dark ? 'dark' : 'light' } : old
      );
      const store = createStore(
        persist(settings, { key: 'settings', storage, version: 2, migrate })
      );

      expect(migrate).toHaveBeenCalledWith({ dark: true }, 1);
      expect(store.getState().theme).toBe('dark');
      expect(store.getState()).not.toHaveProperty('dark');
    });

    it('saves under the new version after migrating', () => {
      const storage = memoryStorage({ settings: saved({ dark: true }, 1) });
      const store = createStore(
        persist(settings, {
          key: 'settings',
          storage,
          version: 2,
          migrate: (old) => ({ theme: old.dark ? 'dark' : 'light' }),
        })
      );

      store.getState().toggleTheme();

      expect(read(storage).version).toBe(2);
    });

    it.each([
      [
        'throws',
        () => {
          throw new Error('bad migration');
        },
      ],
      ['returns a non-object', () => null],
    ])('falls back to the initial state when migrate %s', (_, migrate) => {
      const storage = memoryStorage({ settings: saved({ dark: true }, 1) });
      const onError = vi.fn();
      const store = createStore(
        persist(settings, { key: 'settings', storage, version: 2, migrate, onError })
      );

      expect(store.getState().theme).toBe('light');
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  describe('store.persist', () => {
    it('clear() removes the saved copy but keeps in-memory state', () => {
      const storage = memoryStorage();
      const store = createStore(persist(settings, { key: 'settings', storage }));
      store.getState().toggleTheme();

      store.persist.clear();

      expect(storage.data.has('settings')).toBe(false);
      expect(store.getState().theme).toBe('dark');
    });

    it('clear() reports storage errors', () => {
      const storage = memoryStorage();
      storage.removeItem.mockImplementation(() => {
        throw new Error('nope');
      });
      const onError = vi.fn();
      const store = createStore(persist(settings, { key: 'settings', storage, onError }));

      store.persist.clear();

      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('exposes the storage in use', () => {
      const storage = memoryStorage();
      const store = createStore(persist(settings, { key: 'settings', storage }));
      expect(store.persist.storage).toBe(storage);
    });
  });

  describe('default storage', () => {
    it('uses localStorage when it is available', () => {
      const storage = memoryStorage();
      vi.stubGlobal('localStorage', storage);

      const store = createStore(persist(settings, { key: 'settings' }));
      store.getState().toggleTheme();

      expect(store.persist.storage).toBe(storage);
      expect(read(storage).state.theme).toBe('dark');
      expect(storage.data.has('__tiny_store_probe__')).toBe(false); // cleaned up
    });

    it('works in memory only when localStorage does not exist', () => {
      vi.stubGlobal('localStorage', undefined);

      const store = createStore(persist(settings, { key: 'settings' }));
      store.getState().toggleTheme();

      expect(store.persist.storage).toBeNull();
      expect(store.getState().theme).toBe('dark');
      expect(() => store.persist.clear()).not.toThrow();
    });

    it('works in memory only when localStorage throws on use (private mode)', () => {
      const broken = memoryStorage();
      broken.setItem.mockImplementation(() => {
        throw new Error('SecurityError');
      });
      vi.stubGlobal('localStorage', broken);

      const store = createStore(persist(settings, { key: 'settings' }));

      expect(store.persist.storage).toBeNull();
      store.getState().toggleTheme();
      expect(store.getState().theme).toBe('dark');
    });

    it('can be switched off explicitly with storage: null', () => {
      const store = createStore(persist(settings, { key: 'settings', storage: null }));
      store.getState().toggleTheme();
      expect(store.persist.storage).toBeNull();
    });
  });

  describe('options validation', () => {
    it.each([undefined, {}, { key: '' }, { key: 42 }])(
      'throws a TypeError without a valid key (%o)',
      (options) => {
        expect(() => persist(settings, options)).toThrow(TypeError);
      }
    );

    it('throws a TypeError for a non-integer version', () => {
      expect(() => persist(settings, { key: 'k', version: 1.5 })).toThrow(TypeError);
    });

    it('throws a TypeError for storage missing required methods', () => {
      expect(() => persist(settings, { key: 'k', storage: { getItem() {} } })).toThrow(
        TypeError
      );
    });
  });
});

describe('combining middleware', () => {
  it('logs and persists the same updates, in either order', () => {
    for (const compose of [
      (init, o) => persist(logger(init, o.logger), o.persist),
      (init, o) => logger(persist(init, o.persist), o.logger),
    ]) {
      const storage = memoryStorage();
      const log = vi.fn();
      const store = createStore(
        compose(settings, { logger: { log }, persist: { key: 'settings', storage } })
      );

      store.getState().toggleTheme(); // through an action
      store.setState({ fontSize: 16 }); // from outside

      expect(log).toHaveBeenCalledTimes(2);
      expect(read(storage).state).toEqual({ theme: 'dark', fontSize: 16 });
    }
  });

  it('works with a plain object as the innermost initial state', () => {
    const storage = memoryStorage({ k: saved({ count: 7 }) });
    const store = createStore(
      persist(logger({ count: 0 }, { log: () => {} }), { key: 'k', storage })
    );
    expect(store.getState().count).toBe(7);
  });
});
