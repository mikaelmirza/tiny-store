/** A listener for every state change. */
export type Listener<T> = (state: T, prevState: T) => void;

/** What `setState` accepts: a partial state, or an updater function. */
export type Update<T> = Partial<T> | ((state: T) => Partial<T> | null | undefined | void);

export interface SelectorOptions<S> {
  /**
   * Decides whether the selected slice changed. Defaults to `Object.is`;
   * pass `shallowEqual` for selectors that return new objects or arrays.
   */
  equalityFn?: (a: S, b: S) => boolean;
  /** Call the listener once right away with the current slice. */
  fireImmediately?: boolean;
}

export interface Store<T extends object> {
  /** Returns the current state snapshot. */
  getState(): T;
  /** Shallow-merges a partial state, or an updater's result, into the state. */
  setState(update: Update<T>): void;
  /** Calls `listener(state, prevState)` after every real change. */
  subscribe(listener: Listener<T>): () => void;
  /** Calls `listener(slice, prevSlice)` when `selector(state)` changes. */
  subscribe<S>(
    selector: (state: T) => S,
    listener: (slice: S, prevSlice: S) => void,
    options?: SelectorOptions<S>
  ): () => void;
}

declare const storeExtensions: unique symbol;

/**
 * Builds the initial state, usually including actions.
 *
 * `E` describes extra properties that middleware adds to the store (for
 * example `persist` adds `store.persist`). It exists only at the type level.
 */
export type Initializer<T extends object, E = {}> = ((
  set: Store<T>['setState'],
  get: Store<T>['getState'],
  api: Store<T> & E
) => T) & { readonly [storeExtensions]?: E };

/**
 * Creates a store from an initializer function `(set, get, api) => state`.
 *
 * In TypeScript, pass the state type explicitly when the state includes
 * actions, because TypeScript can't infer it from code that uses `set`:
 *
 * ```ts
 * interface Counter { count: number; increment: () => void }
 * const counter = createStore<Counter>((set) => ({
 *   count: 0,
 *   increment: () => set((s) => ({ count: s.count + 1 })),
 * }));
 * ```
 */
export function createStore<T extends object, E = {}>(
  initializer: Initializer<T, E>
): Store<T> & E;
/** Creates a store from a plain initial-state object. */
export function createStore<T extends object>(initialState: T): Store<T>;

/**
 * Compares two values one level deep. Handles plain objects, arrays, `Map`
 * and `Set`; nested values are compared by reference.
 */
export function shallowEqual<T>(a: T, b: T): boolean;
