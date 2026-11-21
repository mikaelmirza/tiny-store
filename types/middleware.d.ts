import type { Initializer } from './index.js';

export interface LogEntry<T extends object = Record<string, unknown>> {
  /** The store name passed in the options. */
  name: string;
  /** State before the update. */
  prevState: T;
  /** State after the update. */
  nextState: T;
  /** Top-level keys whose values changed. */
  changedKeys: string[];
  /** Time the update took, including listeners. */
  durationMs: number;
  /** Set if a listener threw during the update. */
  error?: unknown;
}

export interface LoggerOptions<T extends object = Record<string, unknown>> {
  /** Label shown in each log line. Defaults to `'store'`. */
  name?: string;
  /** Set to `false` to turn logging off without removing the middleware. */
  enabled?: boolean;
  /** Custom output. Defaults to a one-line `console.log`. */
  log?: (entry: LogEntry<T>) => void;
}

/** Logs every state change: what changed, before/after state and duration. */
export function logger<T extends object, E = {}>(
  init: T | Initializer<T, E>,
  options?: LoggerOptions<T>
): Initializer<T, E>;

/** Any synchronous key/value storage, such as `localStorage`. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistOptions<T extends object> {
  /** The storage key to save under. */
  key: string;
  /**
   * Where to save. Defaults to `localStorage` when available and usable;
   * pass `null` to switch persistence off.
   */
  storage?: StorageLike | null;
  /** Bump this when the saved shape changes. Defaults to `0`. */
  version?: number;
  /** Upgrades state saved under an older version. */
  migrate?: (persisted: any, fromVersion: number) => Partial<T>;
  /** Picks what to save. Defaults to the whole state. */
  partialize?: (state: T) => Partial<T>;
  /** Combines saved and initial state. Defaults to a shallow merge. */
  merge?: (persisted: Partial<T>, current: T) => T;
  /** Called when reading, parsing, migrating or saving fails. */
  onError?: (error: unknown) => void;
}

/** Added to the store as `store.persist` by the `persist` middleware. */
export interface PersistApi {
  /** Removes the saved copy. The in-memory state is left unchanged. */
  clear(): void;
  /** The storage in use, or `null` if persistence is switched off. */
  readonly storage: StorageLike | null;
}

/**
 * Saves the store to storage after every change and restores it when the
 * store is created. Adds `store.persist`.
 */
export function persist<T extends object, E = {}>(
  init: T | Initializer<T, E>,
  options: PersistOptions<T>
): Initializer<T, E & { persist: PersistApi }>;
