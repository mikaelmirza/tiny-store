import type { Store } from './index.js';

/**
 * Reads a store from a React component and re-renders when the selected
 * value changes.
 */
export function useStore<T extends object>(store: Store<T>): T;
export function useStore<T extends object, S>(
  store: Store<T>,
  selector: (state: T) => S,
  equalityFn?: (a: S, b: S) => boolean
): S;

/** The state type held by a store. */
export type StateOf<Api extends Store<any>> = ReturnType<Api['getState']>;

/** A hook bound to one store. */
export interface BoundStoreHook<Api extends Store<any>> {
  (): StateOf<Api>;
  <S>(selector: (state: StateOf<Api>) => S, equalityFn?: (a: S, b: S) => boolean): S;
  /** The store itself (including any middleware extras), for use outside React. */
  readonly store: Api;
}

/** Binds a store to a hook, so components don't need to import the store. */
export function createStoreHook<Api extends Store<any>>(store: Api): BoundStoreHook<Api>;
