import { toInitializer } from './shared.js';

/**
 * @typedef {Object} LogEntry
 * @property {string} name The store name passed in the options.
 * @property {Record<string, unknown>} prevState State before the update.
 * @property {Record<string, unknown>} nextState State after the update.
 * @property {string[]} changedKeys Top-level keys whose values changed.
 * @property {number} durationMs Time the update took, including listeners.
 * @property {unknown} [error] Set if a listener threw during the update.
 */

/**
 * @typedef {Object} LoggerOptions
 * @property {string} [name='store'] Label shown in each log line.
 * @property {boolean} [enabled=true] Turn logging off (e.g. in production)
 *   without removing the middleware.
 * @property {(entry: LogEntry) => void} [log] Custom output. Defaults to
 *   a one-line `console.log` with the full entry attached.
 */

const now = () => globalThis.performance?.now?.() ?? Date.now();

const changedKeysOf = (prev, next) => {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  return [...keys].filter((key) => !Object.is(prev[key], next[key]));
};

/** @param {LogEntry} entry */
const defaultLog = (entry) => {
  const { name, changedKeys, durationMs, error } = entry;
  const summary =
    `[${name}] changed ${changedKeys.join(', ')} ` +
    `in ${durationMs.toFixed(2)}ms${error ? ' (a listener threw)' : ''}`;
  console.log(summary, entry);
};

/**
 * Logs every state change: what changed, the before/after state, and how
 * long the update took.
 *
 * ```js
 * const store = createStore(logger((set) => ({ ... }), { name: 'cart' }));
 * ```
 *
 * @template {Record<string, unknown>} T
 * @param {T | import('../index.js').Initializer<T>} init
 * @param {LoggerOptions} [options]
 * @returns {import('../index.js').Initializer<T>}
 */
export function logger(init, options = {}) {
  const { name = 'store', enabled = true, log = defaultLog } = options;
  if (typeof log !== 'function') {
    throw new TypeError('logger: options.log must be a function');
  }
  const initializer = toInitializer(init);

  return (set, get, api) => {
    const loggedSet = (update) => {
      if (!enabled) return set(update);

      const prevState = get();
      const start = now();
      let error;
      try {
        set(update);
      } catch (err) {
        error = err; // a listener threw; the update itself still happened
        throw err;
      } finally {
        const nextState = get();
        // No-op updates keep the same state reference: nothing to log.
        if (nextState !== prevState) {
          log({
            name,
            prevState,
            nextState,
            changedKeys: changedKeysOf(prevState, nextState),
            durationMs: now() - start,
            ...(error !== undefined && { error }),
          });
        }
      }
    };

    // Route updates made from outside actions (store.setState) through the
    // logger too.
    api.setState = loggedSet;
    return initializer(loggedSet, get, api);
  };
}
