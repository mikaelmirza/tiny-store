# tiny-store

A tiny, framework-agnostic reactive state container with zero dependencies.

> 🚧 Work in progress: the core store and selectors are done. Actions, middleware and a React adapter are coming next.

## Install

```bash
npm install tiny-store
```

## Quick start

```js
import { createStore } from 'tiny-store';

const store = createStore({ count: 0 });

const unsubscribe = store.subscribe((state, prevState) => {
  console.log(`count: ${prevState.count} → ${state.count}`);
});

store.setState({ count: 1 });                   // count: 0 → 1
store.setState((s) => ({ count: s.count + 1 })); // count: 1 → 2

unsubscribe();
```

Listen to just one slice of state:

```js
import { createStore, shallowEqual } from 'tiny-store';

const store = createStore({ user: { name: 'Ada' }, theme: 'light', todos: [] });

// Fires only when the theme changes.
store.subscribe(
  (state) => state.theme,
  (theme, prevTheme) => document.body.classList.replace(prevTheme, theme)
);

// The selector builds a new object each time, so compare it shallowly.
store.subscribe(
  (state) => ({ name: state.user.name, theme: state.theme }),
  (view) => render(view),
  { equalityFn: shallowEqual, fireImmediately: true }
);
```

## API

### `createStore(initialState)`

Creates a store. `initialState` must be a plain object. It is copied, so later changes to the original object don't affect the store.

Returns `{ getState, setState, subscribe }`.

### `getState()`

Returns the current state. A new object is created on every real change, so you can compare snapshots by reference (`prev === next` means nothing changed).

### `setState(update)`

Shallow-merges `update` into the state. `update` can be:

- a partial object: `setState({ count: 1 })`
- an updater function: `setState((state) => ({ count: state.count + 1 }))`

If the updater returns `null` or `undefined`, nothing happens. If no value actually changes (compared with `Object.is`), listeners are **not** notified and the state reference is kept.

### `subscribe(listener)`

Registers `listener(state, prevState)`, which is called after every real change. Returns an `unsubscribe` function that is safe to call more than once.

### `subscribe(selector, listener, options?)`

Calls `listener(slice, prevSlice)` only when the value returned by `selector(state)` changes. Returns an `unsubscribe` function.

| Option | Default | Description |
| --- | --- | --- |
| `equalityFn` | `Object.is` | `(a, b) => boolean`. Decides whether the slice changed. Use `shallowEqual` when the selector returns a new object or array each time. |
| `fireImmediately` | `false` | Call the listener once right away with the current slice (as both arguments). |

The slice is compared with the last slice that triggered the listener, so a custom `equalityFn` with a threshold catches a series of small changes once they add up.

### `shallowEqual(a, b)`

Compares two values one level deep. It handles plain objects, arrays, `Map` and `Set`, and compares nested values by reference.

```js
shallowEqual({ a: 1, b: 2 }, { a: 1, b: 2 }); // true
shallowEqual([1, 2], [1, 2]);                 // true
shallowEqual({ a: { x: 1 } }, { a: { x: 1 } }); // false (nested objects differ)
```

## Design decisions

- **Immutable updates.** Every change produces a new state object, so `prevState` is always an accurate snapshot.
- **No-op updates are skipped.** Listeners only fire when something really changed.
- **Safe to subscribe or unsubscribe mid-notification.** Listeners are notified from a snapshot. A listener removed during a notification is skipped. A listener added during one first runs on the next update.
- **Error isolation.** If a listener throws, the remaining listeners still run. The error is rethrown afterwards (as an `AggregateError` if several threw), and the state update is kept.
- **Selectors are built on plain subscriptions.** A selector subscription is just a listener that computes its slice and compares it, so ordering, error isolation and safe unsubscribing all work the same way. A selector that throws is treated like a listener that throws.
- **No infinite loops from self-updates.** The stored slice is updated *before* the listener runs, so a listener that calls `setState` on its own slice compares against the latest value.
- **No leaked subscriptions.** If a `fireImmediately` listener throws, the subscription is removed, since the caller never received its `unsubscribe` function.
- **Independent subscriptions.** Subscribing the same function twice creates two subscriptions, and each `unsubscribe` removes only its own.

## Development

```bash
npm install
npm test          # run the test suite once
npm run test:watch
npm run coverage
```

## License

MIT
