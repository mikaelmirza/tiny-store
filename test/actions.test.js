import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../src/index.js';

const makeCounter = () =>
  createStore((set, get) => ({
    count: 0,
    step: 1,
    increment: () => set((s) => ({ count: s.count + s.step })),
    decrement: () => set((s) => ({ count: s.count - s.step })),
    setStep: (step) => set({ step }),
    reset: () => set({ count: 0, step: 1 }),
    double: () => set({ count: get().count * 2 }),
  }));

describe('createStore with an initializer (actions)', () => {
  describe('initialization', () => {
    it('uses the returned object as the initial state', () => {
      const store = makeCounter();
      expect(store.getState().count).toBe(0);
      expect(store.getState().step).toBe(1);
      expect(typeof store.getState().increment).toBe('function');
    });

    it('calls the initializer exactly once with (set, get, api)', () => {
      const init = vi.fn(() => ({ count: 0 }));
      const store = createStore(init);

      expect(init).toHaveBeenCalledTimes(1);
      const [set, get, api] = init.mock.calls[0];
      expect(set).toBe(store.setState);
      expect(get).toBe(store.getState);
      expect(api).toBe(store);
    });

    it('copies the returned object rather than keeping a reference to it', () => {
      const initial = { count: 0 };
      const store = createStore(() => initial);
      store.setState({ count: 1 });
      expect(initial.count).toBe(0);
    });

    it.each([null, undefined, 42, [], new Date()])(
      'throws a TypeError if the initializer returns a non-plain-object (%s)',
      (bad) => {
        expect(() => createStore(() => bad)).toThrow(TypeError);
      }
    );

    it('propagates errors thrown by the initializer', () => {
      expect(() =>
        createStore(() => {
          throw new Error('init failed');
        })
      ).toThrow('init failed');
    });

    it.each([
      ['set', (set) => set({ count: 1 })],
      ['get', (_set, get) => get()],
      ['subscribe', (_set, _get, api) => api.subscribe(() => {})],
    ])('throws a clear error when %s is called during initialization', (_, misuse) => {
      expect(() =>
        createStore((set, get, api) => {
          misuse(set, get, api);
          return { count: 0 };
        })
      ).toThrow(/while the store is initializing/);
    });

    it('allows get and set once initialization has finished', () => {
      let capturedSet;
      const store = createStore((set) => {
        capturedSet = set;
        return { count: 0 };
      });

      capturedSet({ count: 5 });
      expect(store.getState().count).toBe(5);
    });
  });

  describe('calling actions', () => {
    it('updates state through set with an updater', () => {
      const store = makeCounter();
      store.getState().increment();
      store.getState().increment();
      expect(store.getState().count).toBe(2);
    });

    it('reads the latest state through get', () => {
      const store = makeCounter();
      store.getState().increment();
      store.getState().increment();
      store.getState().double();
      expect(store.getState().count).toBe(4);
    });

    it('supports actions with arguments', () => {
      const store = makeCounter();
      store.getState().setStep(5);
      store.getState().increment();
      expect(store.getState().count).toBe(5);
    });

    it('keeps actions after updates, since set merges', () => {
      const store = makeCounter();
      const { increment } = store.getState();
      store.getState().reset();
      expect(store.getState().increment).toBe(increment);
    });

    it('works when an action is destructured and called on its own', () => {
      const store = makeCounter();
      const { increment, decrement } = store.getState();
      increment();
      increment();
      decrement();
      expect(store.getState().count).toBe(1);
    });

    it('supports async actions', async () => {
      const fetchUser = vi.fn(async (id) => ({ id, name: 'Ada' }));
      const store = createStore((set) => ({
        user: null,
        status: 'idle',
        loadUser: async (id) => {
          set({ status: 'loading' });
          try {
            const user = await fetchUser(id);
            set({ user, status: 'done' });
          } catch {
            set({ status: 'error' });
          }
        },
      }));
      const statuses = [];
      store.subscribe(
        (s) => s.status,
        (status) => statuses.push(status)
      );

      await store.getState().loadUser(7);

      expect(statuses).toEqual(['loading', 'done']);
      expect(store.getState().user).toEqual({ id: 7, name: 'Ada' });
    });

    it('lets actions call other actions', () => {
      const store = createStore((set, get) => ({
        count: 0,
        add: (n) => set((s) => ({ count: s.count + n })),
        addTwice: (n) => {
          get().add(n);
          get().add(n);
        },
      }));

      store.getState().addTwice(3);

      expect(store.getState().count).toBe(6);
    });
  });

  describe('interaction with subscriptions', () => {
    it('notifies listeners when an action changes state', () => {
      const store = makeCounter();
      const listener = vi.fn();
      store.subscribe((s) => s.count, listener);

      store.getState().increment();

      expect(listener).toHaveBeenCalledWith(1, 0);
    });

    it('does not notify when an action makes no real change', () => {
      const store = makeCounter();
      const listener = vi.fn();
      store.subscribe(listener);

      store.getState().reset(); // already { count: 0, step: 1 }

      expect(listener).not.toHaveBeenCalled();
    });

    it('notifies once per set call inside an action', () => {
      const store = createStore((set) => ({
        a: 0,
        b: 0,
        bumpBoth: () => {
          set({ a: 1 });
          set({ b: 1 });
        },
      }));
      const listener = vi.fn();
      store.subscribe(listener);

      store.getState().bumpBoth();

      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('isolation', () => {
    it('gives each store created from the same initializer its own state', () => {
      const a = makeCounter();
      const b = makeCounter();

      a.getState().increment();

      expect(a.getState().count).toBe(1);
      expect(b.getState().count).toBe(0);
      expect(a.getState().increment).not.toBe(b.getState().increment);
    });
  });
});
