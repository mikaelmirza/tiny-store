import { describe, it, expect, vi } from 'vitest';
import { createStore, shallowEqual } from '../src/index.js';

const makeStore = () =>
  createStore({
    user: { name: 'Ada', age: 36 },
    todos: [{ id: 1, done: false }],
    theme: 'light',
  });

describe('subscribe with a selector', () => {
  it('fires only when the selected slice changes', () => {
    const store = makeStore();
    const listener = vi.fn();
    store.subscribe((s) => s.theme, listener);

    store.setState({ user: { name: 'Grace', age: 45 } }); // theme untouched
    expect(listener).not.toHaveBeenCalled();

    store.setState({ theme: 'dark' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('passes (slice, prevSlice) to the listener', () => {
    const store = makeStore();
    const listener = vi.fn();
    store.subscribe((s) => s.theme, listener);

    store.setState({ theme: 'dark' });
    store.setState({ theme: 'sepia' });

    expect(listener).toHaveBeenNthCalledWith(1, 'dark', 'light');
    expect(listener).toHaveBeenNthCalledWith(2, 'sepia', 'dark');
  });

  it('works with derived values', () => {
    const store = makeStore();
    const listener = vi.fn();
    store.subscribe((s) => s.todos.filter((t) => !t.done).length, listener);

    // A new array, but the derived count stays 1 → no call.
    store.setState({ todos: [{ id: 2, done: false }] });
    expect(listener).not.toHaveBeenCalled();

    store.setState((s) => ({ todos: [...s.todos, { id: 3, done: false }] }));
    expect(listener).toHaveBeenCalledWith(2, 1);
  });

  it('stops firing after unsubscribe', () => {
    const store = makeStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe((s) => s.theme, listener);

    unsubscribe();
    store.setState({ theme: 'dark' });

    expect(listener).not.toHaveBeenCalled();
  });

  describe('equalityFn', () => {
    it('defaults to Object.is, so a selector returning a new object always fires', () => {
      const store = makeStore();
      const listener = vi.fn();
      store.subscribe((s) => ({ name: s.user.name }), listener);

      store.setState({ theme: 'dark' }); // unrelated change, new object from selector
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('with shallowEqual, ignores new objects with equal contents', () => {
      const store = makeStore();
      const listener = vi.fn();
      store.subscribe((s) => ({ name: s.user.name, theme: s.theme }), listener, {
        equalityFn: shallowEqual,
      });

      store.setState({ todos: [] }); // neither name nor theme changed
      expect(listener).not.toHaveBeenCalled();

      store.setState({ theme: 'dark' });
      expect(listener).toHaveBeenCalledWith(
        { name: 'Ada', theme: 'dark' },
        { name: 'Ada', theme: 'light' }
      );
    });

    it('accepts a custom comparison', () => {
      const store = createStore({ price: 10.0 });
      const listener = vi.fn();
      // Only care about changes of at least 1.
      store.subscribe((s) => s.price, listener, {
        equalityFn: (a, b) => Math.abs(a - b) < 1,
      });

      store.setState({ price: 10.5 });
      expect(listener).not.toHaveBeenCalled();

      store.setState({ price: 11.2 });
      expect(listener).toHaveBeenCalledWith(11.2, 10.0);
    });

    it('compares against the last slice that fired, not the last state', () => {
      const store = createStore({ price: 10.0 });
      const listener = vi.fn();
      store.subscribe((s) => s.price, listener, {
        equalityFn: (a, b) => Math.abs(a - b) < 1,
      });

      // Small steps that add up to a big change must eventually fire.
      store.setState({ price: 10.6 });
      store.setState({ price: 11.2 });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(11.2, 10.0);
    });
  });

  describe('fireImmediately', () => {
    it('calls the listener right away with the current slice', () => {
      const store = makeStore();
      const listener = vi.fn();
      store.subscribe((s) => s.theme, listener, { fireImmediately: true });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('light', 'light');
    });

    it('does not fire immediately by default', () => {
      const store = makeStore();
      const listener = vi.fn();
      store.subscribe((s) => s.theme, listener);
      expect(listener).not.toHaveBeenCalled();
    });

    it('removes the subscription if the immediate call throws', () => {
      const store = makeStore();
      let calls = 0;
      const listener = () => {
        calls += 1;
        throw new Error('boom');
      };

      expect(() =>
        store.subscribe((s) => s.theme, listener, { fireImmediately: true })
      ).toThrow('boom');

      store.setState({ theme: 'dark' }); // must not reach the leaked listener
      expect(calls).toBe(1);
    });
  });

  describe('re-entrancy', () => {
    it('does not loop when a listener updates the slice it watches', () => {
      const store = createStore({ count: 0 });
      const listener = vi.fn((count) => {
        if (count < 3) store.setState({ count: count + 1 });
      });
      store.subscribe((s) => s.count, listener);

      store.setState({ count: 1 });

      expect(store.getState().count).toBe(3);
      expect(listener.mock.calls.map(([slice]) => slice)).toEqual([1, 2, 3]);
    });
  });

  describe('errors', () => {
    it('isolates a throwing selector like a throwing listener', () => {
      const store = makeStore();
      const other = vi.fn();
      store.subscribe(
        (s) => {
          if (s.theme === 'dark') throw new Error('selector failed');
          return s.theme;
        },
        () => {}
      );
      store.subscribe(other);

      expect(() => store.setState({ theme: 'dark' })).toThrow('selector failed');
      expect(other).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['selector', ['nope', () => {}]],
      ['listener', [(s) => s, 'nope']],
      ['equalityFn', [(s) => s, () => {}, { equalityFn: 'nope' }]],
    ])('throws a TypeError for an invalid %s', (_, args) => {
      const store = makeStore();
      expect(() => store.subscribe(...args)).toThrow(TypeError);
    });
  });
});

describe('shallowEqual', () => {
  it.each([
    [1, 1],
    ['a', 'a'],
    [NaN, NaN],
    [null, null],
    [undefined, undefined],
  ])('treats identical primitives as equal (%s, %s)', (a, b) => {
    expect(shallowEqual(a, b)).toBe(true);
  });

  it.each([
    [1, 2],
    [0, -0],
    [null, undefined],
    [null, {}],
    [{}, null],
    [1, {}],
    ['a', ['a']],
  ])('treats different primitives / types as unequal (%s, %s)', (a, b) => {
    expect(shallowEqual(a, b)).toBe(false);
  });

  it('compares plain objects one level deep', () => {
    const nested = { x: 1 };
    expect(shallowEqual({ a: 1, b: nested }, { a: 1, b: nested })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(shallowEqual({ a: undefined }, { b: undefined })).toBe(false);
  });

  it('does not recurse into nested objects', () => {
    expect(shallowEqual({ a: { x: 1 } }, { a: { x: 1 } })).toBe(false);
  });

  it('compares arrays item by item', () => {
    expect(shallowEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(shallowEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(shallowEqual([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it('does not treat an array as equal to an array-like object', () => {
    expect(shallowEqual([1], { 0: 1 })).toBe(false);
    expect(shallowEqual({ 0: 1 }, [1])).toBe(false);
  });

  it('compares Maps by keys and values', () => {
    expect(shallowEqual(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(true);
    expect(shallowEqual(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false);
    expect(shallowEqual(new Map([['a', 1]]), new Map([['b', 1]]))).toBe(false);
    expect(shallowEqual(new Map(), new Map([['a', 1]]))).toBe(false);
  });

  it('compares Sets by members', () => {
    expect(shallowEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true);
    expect(shallowEqual(new Set([1, 2]), new Set([1, 3]))).toBe(false);
    expect(shallowEqual(new Set([1]), new Set([1, 2]))).toBe(false);
  });

  it('works with null-prototype objects', () => {
    const a = Object.assign(Object.create(null), { x: 1 });
    const b = Object.assign(Object.create(null), { x: 1 });
    expect(shallowEqual(a, b)).toBe(true);
  });
});
