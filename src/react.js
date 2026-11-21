import { useCallback, useDebugValue, useMemo, useSyncExternalStore } from 'react';

const identity = (state) => state;

const assertStore = (store) => {
  if (
    !store ||
    typeof store.getState !== 'function' ||
    typeof store.subscribe !== 'function'
  ) {
    throw new TypeError('useStore: expected a store created with createStore');
  }
};

/**
 * Returns a `getSnapshot` function for `useSyncExternalStore`.
 *
 * `useSyncExternalStore` requires `getSnapshot` to return the *same* value
 * until something really changes, or React re-renders forever. So the
 * getter remembers the last state and slice, and keeps the old slice
 * whenever `equalityFn` says the new one is equivalent.
 *
 * This lives outside the hook on purpose: the cache is private mutable
 * state that belongs to one getter, not to React's render.
 */
const createSelectionGetter = (store, selector, equalityFn) => {
  let hasMemo = false;
  let memoState;
  let memoSlice;

  return () => {
    const state = store.getState();
    if (hasMemo && Object.is(memoState, state)) return memoSlice;

    const nextSlice = selector(state);
    memoState = state;
    if (hasMemo && equalityFn(memoSlice, nextSlice)) return memoSlice;

    hasMemo = true;
    memoSlice = nextSlice;
    return nextSlice;
  };
};

/**
 * Reads a store from a React component and re-renders when the selected
 * value changes.
 *
 * ```jsx
 * const count = useStore(counter, (s) => s.count);
 * const { increment } = useStore(counter, (s) => s.increment);
 * const view = useStore(counter, (s) => ({ a: s.a, b: s.b }), shallowEqual);
 * ```
 *
 * Built on `useSyncExternalStore`, so it never shows "torn" (mismatched)
 * state during concurrent rendering, and it works with server rendering.
 *
 * @template {Record<string, unknown>} T
 * @template [S=T]
 * @param {import('./index.js').Store<T>} store
 * @param {(state: T) => S} [selector] Picks what the component needs.
 *   Defaults to the whole state, which re-renders on every change.
 * @param {(a: S, b: S) => boolean} [equalityFn] Decides whether the
 *   selected value changed. Defaults to `Object.is`; pass `shallowEqual`
 *   for selectors that build a new object or array.
 * @returns {S}
 */
export function useStore(store, selector = identity, equalityFn = Object.is) {
  assertStore(store);

  // React calls this with a callback; our plain-listener subscribe form
  // fits exactly and returns the unsubscribe function React needs.
  const subscribe = useCallback(
    (onStoreChange) => store.subscribe(onStoreChange),
    [store]
  );

  const getSelection = useMemo(
    () => createSelectionGetter(store, selector, equalityFn),
    [store, selector, equalityFn]
  );

  // The same function serves as the server snapshot: on the server the
  // store simply holds whatever state it was created with.
  const slice = useSyncExternalStore(subscribe, getSelection, getSelection);
  useDebugValue(slice);
  return slice;
}

/**
 * Binds a store to a hook, so components don't need to import the store.
 *
 * ```js
 * export const useCounter = createStoreHook(counter);
 * // in a component:
 * const count = useCounter((s) => s.count);
 * ```
 *
 * The store itself is available as `useCounter.store`, for use outside
 * React (tests, event handlers, other modules).
 *
 * @template {Record<string, unknown>} T
 * @param {import('./index.js').Store<T>} store
 * @returns {(<S = T>(selector?: (state: T) => S, equalityFn?: (a: S, b: S) => boolean) => S) & { store: import('./index.js').Store<T> }}
 */
export function createStoreHook(store) {
  assertStore(store);
  const useBoundStore = (selector, equalityFn) => useStore(store, selector, equalityFn);
  useBoundStore.store = store;
  return useBoundStore;
}
