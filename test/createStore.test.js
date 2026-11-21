import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../src/index.js';

describe('createStore', () => {
  describe('initialization', () => {
    it('returns the initial state', () => {
      const store = createStore({ count: 0 });
      expect(store.getState()).toEqual({ count: 0 });
    });

    it('does not share a reference with the initial object', () => {
      const initial = { count: 0 };
      const store = createStore(initial);
      store.setState({ count: 1 });
      expect(initial.count).toBe(0);
      expect(store.getState()).not.toBe(initial);
    });

    it.each([null, undefined, 42, 'str', [], new Date()])(
      'throws a TypeError for a non-plain-object initial state (%s)',
      (bad) => {
        expect(() => createStore(bad)).toThrow(TypeError);
      }
    );

    it('accepts objects with a null prototype', () => {
      const initial = Object.assign(Object.create(null), { a: 1 });
      expect(() => createStore(initial)).not.toThrow();
    });
  });

  describe('setState', () => {
    it('shallow-merges a partial object', () => {
      const store = createStore({ a: 1, b: 2 });
      store.setState({ b: 3 });
      expect(store.getState()).toEqual({ a: 1, b: 3 });
    });

    it('accepts an updater function that receives the current state', () => {
      const store = createStore({ count: 1 });
      store.setState((s) => ({ count: s.count + 1 }));
      expect(store.getState().count).toBe(2);
    });

    it('produces a new state object and never mutates the previous one', () => {
      const store = createStore({ count: 0 });
      const before = store.getState();
      store.setState({ count: 1 });
      expect(store.getState()).not.toBe(before);
      expect(before.count).toBe(0);
    });

    it('keeps the same reference when nothing changes', () => {
      const store = createStore({ count: 0 });
      const before = store.getState();
      store.setState({ count: 0 });
      expect(store.getState()).toBe(before);
    });

    it('treats an updater returning null/undefined as a no-op', () => {
      const store = createStore({ count: 0 });
      const listener = vi.fn();
      store.subscribe(listener);
      store.setState(() => undefined);
      store.setState(() => null);
      expect(listener).not.toHaveBeenCalled();
    });

    it('uses Object.is semantics for change detection (NaN, -0)', () => {
      const store = createStore({ n: NaN, z: 0 });
      const listener = vi.fn();
      store.subscribe(listener);

      store.setState({ n: NaN }); // NaN is NaN → no change
      expect(listener).not.toHaveBeenCalled();

      store.setState({ z: -0 }); // 0 and -0 differ under Object.is
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('can add new keys', () => {
      const store = createStore({ a: 1 });
      store.setState({ b: 2 });
      expect(store.getState()).toEqual({ a: 1, b: 2 });
    });

    it.each([42, 'str', [1], true])(
      'throws a TypeError for an invalid patch (%s)',
      (bad) => {
        const store = createStore({ a: 1 });
        expect(() => store.setState(bad)).toThrow(TypeError);
        expect(() => store.setState(() => bad)).toThrow(TypeError);
      }
    );
  });

  describe('subscribe', () => {
    it('calls listeners with (state, prevState) on change', () => {
      const store = createStore({ count: 0 });
      const listener = vi.fn();
      store.subscribe(listener);

      store.setState({ count: 1 });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ count: 1 }, { count: 0 });
    });

    it('does not call listeners for no-op updates', () => {
      const store = createStore({ count: 0 });
      const listener = vi.fn();
      store.subscribe(listener);
      store.setState({ count: 0 });
      expect(listener).not.toHaveBeenCalled();
    });

    it('stops calling a listener after it unsubscribes', () => {
      const store = createStore({ count: 0 });
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      unsubscribe();
      store.setState({ count: 1 });

      expect(listener).not.toHaveBeenCalled();
    });

    it('makes unsubscribe idempotent', () => {
      const store = createStore({ count: 0 });
      const unsubscribe = store.subscribe(() => {});
      expect(() => {
        unsubscribe();
        unsubscribe();
      }).not.toThrow();
    });

    it('treats duplicate subscriptions of one function independently', () => {
      const store = createStore({ count: 0 });
      const listener = vi.fn();
      const unsubA = store.subscribe(listener);
      store.subscribe(listener);

      store.setState({ count: 1 });
      expect(listener).toHaveBeenCalledTimes(2);

      unsubA();
      store.setState({ count: 2 });
      expect(listener).toHaveBeenCalledTimes(3); // the second one is still active
    });

    it('calls listeners in subscription order', () => {
      const store = createStore({ count: 0 });
      const calls = [];
      store.subscribe(() => calls.push('a'));
      store.subscribe(() => calls.push('b'));
      store.subscribe(() => calls.push('c'));

      store.setState({ count: 1 });

      expect(calls).toEqual(['a', 'b', 'c']);
    });

    it('throws a TypeError for a non-function listener', () => {
      const store = createStore({ count: 0 });
      expect(() => store.subscribe('nope')).toThrow(TypeError);
    });
  });

  describe('mutating subscriptions during notification', () => {
    it('lets a listener unsubscribe itself without skipping others', () => {
      const store = createStore({ count: 0 });
      const second = vi.fn();
      const unsubFirst = store.subscribe(() => unsubFirst());
      store.subscribe(second);

      store.setState({ count: 1 });
      store.setState({ count: 2 });

      expect(second).toHaveBeenCalledTimes(2);
    });

    it('skips a listener that was unsubscribed earlier in the same notification', () => {
      const store = createStore({ count: 0 });
      const victim = vi.fn();
      // The first listener runs before the victim and removes it.
      store.subscribe(() => unsubVictim());
      const unsubVictim = store.subscribe(victim);

      store.setState({ count: 1 });

      expect(victim).not.toHaveBeenCalled();
    });

    it('does not call a listener added during notification until the next update', () => {
      const store = createStore({ count: 0 });
      const late = vi.fn();
      let added = false;
      store.subscribe(() => {
        if (!added) {
          added = true;
          store.subscribe(late);
        }
      });

      store.setState({ count: 1 });
      expect(late).not.toHaveBeenCalled();

      store.setState({ count: 2 });
      expect(late).toHaveBeenCalledTimes(1);
    });
  });

  describe('error isolation', () => {
    it('runs every listener even if one throws, then rethrows the error', () => {
      const store = createStore({ count: 0 });
      const boom = new Error('boom');
      const after = vi.fn();
      store.subscribe(() => {
        throw boom;
      });
      store.subscribe(after);

      expect(() => store.setState({ count: 1 })).toThrow(boom);
      expect(after).toHaveBeenCalledTimes(1);
      expect(store.getState().count).toBe(1); // the update still applied
    });

    it('throws an AggregateError when several listeners throw', () => {
      const store = createStore({ count: 0 });
      store.subscribe(() => {
        throw new Error('one');
      });
      store.subscribe(() => {
        throw new Error('two');
      });

      try {
        store.setState({ count: 1 });
        expect.unreachable('setState should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AggregateError);
        expect(error.errors.map((e) => e.message)).toEqual(['one', 'two']);
      }
    });
  });

  describe('isolation between stores', () => {
    it('keeps separate stores fully independent', () => {
      const a = createStore({ count: 0 });
      const b = createStore({ count: 0 });
      const listenerB = vi.fn();
      b.subscribe(listenerB);

      a.setState({ count: 5 });

      expect(b.getState().count).toBe(0);
      expect(listenerB).not.toHaveBeenCalled();
    });
  });
});
