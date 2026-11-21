import { toInitializer } from './shared.js';

/**
 * Any synchronous key/value storage: `localStorage`, `sessionStorage`, or
 * your own adapter (e.g. an in-memory Map for tests or server rendering).
 *
 * @typedef {Object} StorageLike
 * @property {(key: string) => string | null} getItem
 * @property {(key: string, value: string) => void} setItem
 * @property {(key: string) => void} removeItem
 */

/**
 * @template {Record<string, unknown>} T
 * @typedef {Object} PersistOptions
 * @property {string} key The storage key to save under. Required.
 * @property {StorageLike | null} [storage] Where to save. Defaults to
 *   `localStorage` when it's available and usable; otherwise persistence is
 *   switched off and the store works in memory only.
 * @property {number} [version=0] Bump this when the saved shape changes.
 * @property {(persisted: any, fromVersion: number) => Partial<T>} [migrate]
 *   Upgrades state saved under an older version. Without it, saved state
 *   from another version is discarded.
 * @property {(state: T) => Partial<T>} [partialize] Picks what to save.
 *   Defaults to the whole state (functions are skipped automatically).
 * @property {(persisted: Partial<T>, current: T) => T} [merge] Combines the
 *   saved state with the initial state. Defaults to a shallow merge where
 *   saved values win.
 * @property {(error: unknown) => void} [onError] Called when reading,
 *   parsing, migrating or saving fails. Defaults to `console.warn`.
 */

const PROBE_KEY = '__tiny_store_probe__';

/** @returns {StorageLike | null} */
const getDefaultStorage = () => {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    // Some environments (Safari private mode, disabled cookies, sandboxed
    // iframes) expose localStorage but throw when you use it.
    storage.setItem(PROBE_KEY, PROBE_KEY);
    storage.removeItem(PROBE_KEY);
    return storage;
  } catch {
    return null;
  }
};

const isStorageLike = (value) =>
  value !== null &&
  typeof value === 'object' &&
  ['getItem', 'setItem', 'removeItem'].every(
    (method) => typeof value[method] === 'function'
  );

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const defaultOnError = (error) => console.warn('[tiny-store/persist]', error);

/**
 * Saves the store to storage after every change and restores it when the
 * store is created.
 *
 * ```js
 * const store = createStore(
 *   persist((set) => ({ theme: 'light', toggle: () => ... }), { key: 'settings' })
 * );
 * store.persist.clear(); // forget the saved copy
 * ```
 *
 * Saved data looks like `{"state": {...}, "version": 0}`.
 *
 * @template {Record<string, unknown>} T
 * @param {T | import('../index.js').Initializer<T>} init
 * @param {PersistOptions<T>} options
 * @returns {import('../index.js').Initializer<T>}
 */
export function persist(init, options) {
  if (!options || typeof options.key !== 'string' || options.key === '') {
    throw new TypeError('persist: options.key must be a non-empty string');
  }

  const {
    key,
    version = 0,
    migrate,
    partialize = (state) => state,
    merge = (persisted, current) => ({ ...current, ...persisted }),
    onError = defaultOnError,
  } = options;

  if (!Number.isInteger(version)) {
    throw new TypeError('persist: options.version must be an integer');
  }
  if (options.storage != null && !isStorageLike(options.storage)) {
    throw new TypeError(
      'persist: options.storage must have getItem, setItem and removeItem'
    );
  }

  const initializer = toInitializer(init);

  return (set, get, api) => {
    // Resolved per store, so each store probes the environment it runs in.
    const storage = options.storage === undefined ? getDefaultStorage() : options.storage;

    const save = () => {
      if (!storage) return;
      try {
        const data = { state: partialize(get()), version };
        storage.setItem(key, JSON.stringify(data));
      } catch (error) {
        onError(error); // e.g. quota exceeded or a value JSON can't handle
      }
    };

    /** @returns {Partial<T> | undefined} */
    const load = () => {
      if (!storage) return undefined;
      try {
        const raw = storage.getItem(key);
        if (raw === null) return undefined;

        const data = JSON.parse(raw);
        if (!isPlainObject(data) || !isPlainObject(data.state)) {
          throw new Error(`persist: saved data under "${key}" is malformed`);
        }

        const savedVersion = Number.isInteger(data.version) ? data.version : 0;
        if (savedVersion === version) return data.state;
        if (!migrate) return undefined; // incompatible and no way to upgrade

        const migrated = migrate(data.state, savedVersion);
        if (!isPlainObject(migrated)) {
          throw new Error('persist: migrate must return a plain object');
        }
        return migrated;
      } catch (error) {
        onError(error);
        return undefined; // fall back to the initial state
      }
    };

    const persistedSet = (update) => {
      const prevState = get();
      try {
        set(update);
      } finally {
        // Save even if a listener threw, because the state did change.
        if (get() !== prevState) save();
      }
    };

    api.setState = persistedSet;
    api.persist = {
      /** Removes the saved copy. The in-memory state is left unchanged. */
      clear: () => {
        try {
          storage?.removeItem(key);
        } catch (error) {
          onError(error);
        }
      },
      /** The storage in use, or `null` if persistence is switched off. */
      storage,
    };

    const initialState = initializer(persistedSet, get, api);
    const persisted = load();

    // Hydrating here, inside the initializer, means the restored state *is*
    // the initial state: no flash of defaults and no extra notification.
    return persisted === undefined ? initialState : merge(persisted, initialState);
  };
}
