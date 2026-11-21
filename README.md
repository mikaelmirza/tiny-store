# tiny-store

A tiny, framework-agnostic reactive state container with zero dependencies.

> 🚧 Work in progress: the core store is done. Selectors, actions, middleware and a React adapter are coming next.

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

## Design decisions

- **Immutable updates.** Every change produces a new state object, so `prevState` is always an accurate snapshot.
- **No-op updates are skipped.** Listeners only fire when something really changed.
- **Safe to subscribe or unsubscribe mid-notification.** Listeners are notified from a snapshot. A listener removed during a notification is skipped. A listener added during one first runs on the next update.
- **Error isolation.** If a listener throws, the remaining listeners still run. The error is rethrown afterwards (as an `AggregateError` if several threw), and the state update is kept.
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
