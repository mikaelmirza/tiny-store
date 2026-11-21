/**
 * tiny-store — a minimal, framework-agnostic reactive state container.
 *
 * @template {Record<string, unknown>} T
 * @typedef {(state: T, prevState: T) => void} Listener
 */

/**
 * @template {Record<string, unknown>} T
 * @typedef {Partial<T> | ((state: T) => Partial<T> | null | undefined | void)} Update
 */

/**
 * @template {Record<string, unknown>} T
 * @typedef {Object} Store
 * @property {() => T} getState Returns the current state snapshot.
 * @property {(update: Update<T>) => void} setState Shallow-merges a partial
 *   state (or the result of an updater function) into the current state.
 * @property {(listener: Listener<T>) => () => void} subscribe Registers a
 *   listener and returns a function that unsubscribes it.
 */

const isPlainObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

/**
 * Creates a new store.
 *
 * @template {Record<string, unknown>} T
 * @param {T} initialState A plain object holding the initial state.
 * @returns {Store<T>}
 */
export function createStore(initialState) {
  if (!isPlainObject(initialState)) {
    throw new TypeError('createStore: initialState must be a plain object');
  }

  /** @type {T} */
  let state = { ...initialState };

  // Each subscription gets its own record, so the same function can be
  // subscribed twice and each unsubscribe removes only its own entry.
  /** @type {Set<{ listener: Listener<T> }>} */
  const subscriptions = new Set();

  const getState = () => state;

  /** @param {Update<T>} update */
  const setState = (update) => {
    const patch = typeof update === 'function' ? update(state) : update;

    // An updater may return nothing to signal "no change".
    if (patch === undefined || patch === null) return;

    if (!isPlainObject(patch)) {
      throw new TypeError(
        'setState: expected a plain object or a function returning one'
      );
    }

    // Skip no-op updates so listeners only fire on real changes.
    const changed = Object.keys(patch).some(
      (key) => !Object.is(state[key], patch[key])
    );
    if (!changed) return;

    const prevState = state;
    state = { ...state, ...patch }; // never mutate: prevState stays accurate

    notify(state, prevState);
  };

  /**
   * @param {T} nextState
   * @param {T} prevState
   */
  const notify = (nextState, prevState) => {
    // Iterate over a snapshot so listeners can safely subscribe or
    // unsubscribe (themselves or others) while we're notifying.
    const snapshot = [...subscriptions];
    const errors = [];

    for (const sub of snapshot) {
      // A listener removed earlier in this same notification is skipped.
      if (!subscriptions.has(sub)) continue;
      try {
        sub.listener(nextState, prevState);
      } catch (error) {
        // Isolate failures: one bad listener must not block the rest.
        errors.push(error);
      }
    }

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, `${errors.length} store listeners threw`);
    }
  };

  /** @param {Listener<T>} listener */
  const subscribe = (listener) => {
    if (typeof listener !== 'function') {
      throw new TypeError('subscribe: listener must be a function');
    }
    const sub = { listener };
    subscriptions.add(sub);
    return () => {
      subscriptions.delete(sub); // idempotent: safe to call more than once
    };
  };

  return { getState, setState, subscribe };
}
