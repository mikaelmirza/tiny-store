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
 * @property {SubscribeFn<T>} subscribe Registers a listener (optionally for
 *   a selected slice of state) and returns a function that unsubscribes it.
 */

/**
 * @template S
 * @typedef {Object} SelectorOptions
 * @property {(a: S, b: S) => boolean} [equalityFn] Decides whether the
 *   selected slice changed. Defaults to `Object.is`; pass `shallowEqual`
 *   for selectors that return new objects or arrays.
 * @property {boolean} [fireImmediately] Call the listener once right away
 *   with the current slice. Defaults to `false`.
 */

/**
 * @template {Record<string, unknown>} T
 * @typedef {{
 *   (listener: Listener<T>): () => void;
 *   <S>(
 *     selector: (state: T) => S,
 *     listener: (slice: S, prevSlice: S) => void,
 *     options?: SelectorOptions<S>
 *   ): () => void;
 * }} SubscribeFn
 */

export { shallowEqual } from './utils.js';

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

  /** @type {SubscribeFn<T>} */
  const subscribe = (selectorOrListener, maybeListener, options = {}) => {
    // subscribe(listener) → listen to every change.
    if (maybeListener === undefined) {
      return addSubscription(selectorOrListener);
    }

    // subscribe(selector, listener, options) → listen to one slice.
    const selector = selectorOrListener;
    const listener = maybeListener;
    if (typeof selector !== 'function') {
      throw new TypeError('subscribe: selector must be a function');
    }
    if (typeof listener !== 'function') {
      throw new TypeError('subscribe: listener must be a function');
    }
    const { equalityFn = Object.is, fireImmediately = false } = options;
    if (typeof equalityFn !== 'function') {
      throw new TypeError('subscribe: equalityFn must be a function');
    }

    let currentSlice = selector(state);

    const unsubscribe = addSubscription((nextState) => {
      const nextSlice = selector(nextState);
      if (equalityFn(currentSlice, nextSlice)) return;
      const prevSlice = currentSlice;
      // Update before calling the listener, so a listener that calls
      // setState sees (and compares against) the latest slice.
      currentSlice = nextSlice;
      listener(nextSlice, prevSlice);
    });

    if (fireImmediately) {
      try {
        listener(currentSlice, currentSlice);
      } catch (error) {
        // The caller never receives `unsubscribe` if we throw, so clean up
        // here instead of leaking a subscription they can't remove.
        unsubscribe();
        throw error;
      }
    }

    return unsubscribe;
  };

  /** @param {Listener<T>} listener */
  const addSubscription = (listener) => {
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
