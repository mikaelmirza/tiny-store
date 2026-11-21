// Type-level tests: checked by `npm run typecheck` (tsc), never executed.
import { expectTypeOf } from 'vitest';
import { createStore, shallowEqual, type Store } from '../types/index.js';
import { logger, persist, type PersistApi } from '../types/middleware.js';
import { useStore, createStoreHook } from '../types/react.js';

// --- createStore with a plain object -------------------------------------

const plain = createStore({ count: 0, label: 'x' });
expectTypeOf(plain.getState()).toEqualTypeOf<{ count: number; label: string }>();

plain.setState({ count: 1 });
plain.setState((s) => ({ count: s.count + 1 }));
plain.setState(() => undefined);
// @ts-expect-error: wrong value type
plain.setState({ count: 'one' });
// @ts-expect-error: updater must return a partial state
plain.setState((s) => s.count);

// Interfaces work as state types (no index signature needed).
interface Settings {
  theme: 'light' | 'dark';
  fontSize: number;
}
const settings = createStore<Settings>({ theme: 'light', fontSize: 14 });
// @ts-expect-error: not one of the allowed themes
settings.setState({ theme: 'blue' });

// --- subscribe ------------------------------------------------------------

plain.subscribe((state, prev) => {
  expectTypeOf(state).toEqualTypeOf<{ count: number; label: string }>();
  expectTypeOf(prev).toEqualTypeOf<{ count: number; label: string }>();
});

const unsubscribe = plain.subscribe(
  (s) => s.count,
  (count, prevCount) => {
    expectTypeOf(count).toEqualTypeOf<number>();
    expectTypeOf(prevCount).toEqualTypeOf<number>();
  },
  { equalityFn: (a, b) => Math.abs(a - b) < 1, fireImmediately: true }
);
expectTypeOf(unsubscribe).toEqualTypeOf<() => void>();

plain.subscribe(
  (s) => ({ count: s.count }),
  () => {},
  { equalityFn: shallowEqual }
);

// --- createStore with actions ---------------------------------------------

interface Counter {
  count: number;
  increment: () => void;
  add: (n: number) => void;
}

const counter = createStore<Counter>((set, get) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
  add: (n) => set({ count: get().count + n }),
}));
expectTypeOf(counter).toEqualTypeOf<Store<Counter>>();
counter.getState().add(2);
// @ts-expect-error: add needs a number
counter.getState().add('2');

// @ts-expect-error: the initializer must return the full state
createStore<Counter>(() => ({ count: 0 }));

// --- middleware -----------------------------------------------------------

const logged = createStore(
  logger<Counter>(
    (set) => ({
      count: 0,
      increment: () => set((s) => ({ count: s.count + 1 })),
      add: (n) => set((s) => ({ count: s.count + n })),
    }),
    {
      name: 'counter',
      log: (entry) => expectTypeOf(entry.nextState).toEqualTypeOf<Counter>(),
    }
  )
);
expectTypeOf(logged.getState()).toEqualTypeOf<Counter>();
// logger adds nothing to the store
// @ts-expect-error: no persist API without persist
logged.persist;

const persisted = createStore(
  persist<Settings>(
    { theme: 'light', fontSize: 14 },
    {
      key: 'settings',
      version: 2,
      partialize: (s) => ({ theme: s.theme }),
      migrate: (old: { dark: boolean }) => ({ theme: old.dark ? 'dark' : 'light' }),
    }
  )
);
expectTypeOf(persisted.persist).toEqualTypeOf<PersistApi>();
persisted.persist.clear();
expectTypeOf(persisted.getState()).toEqualTypeOf<Settings>();

// The persist API survives being wrapped by another middleware.
const both = createStore(
  logger(persist<Settings>({ theme: 'light', fontSize: 14 }, { key: 'k' }))
);
expectTypeOf(both.persist).toEqualTypeOf<PersistApi>();

// @ts-expect-error: key is required
persist<Settings>({ theme: 'light', fontSize: 14 }, {});

// --- React ----------------------------------------------------------------

expectTypeOf(useStore(counter)).toEqualTypeOf<Counter>();
expectTypeOf(useStore(counter, (s) => s.count)).toEqualTypeOf<number>();
expectTypeOf(useStore(counter, (s) => s.increment)).toEqualTypeOf<() => void>();
expectTypeOf(useStore(counter, (s) => ({ count: s.count }), shallowEqual)).toEqualTypeOf<{
  count: number;
}>();
// @ts-expect-error: no such field
useStore(counter, (s) => s.missing);

const useCounter = createStoreHook(counter);
expectTypeOf(useCounter()).toEqualTypeOf<Counter>();
expectTypeOf(useCounter((s) => s.count)).toEqualTypeOf<number>();
expectTypeOf(useCounter.store).toEqualTypeOf<Store<Counter>>();

const useSettings = createStoreHook(persisted);
expectTypeOf(useSettings((s) => s.theme)).toEqualTypeOf<'light' | 'dark'>();
expectTypeOf(useSettings.store.persist).toEqualTypeOf<PersistApi>();
