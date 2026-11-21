// @vitest-environment jsdom
import React, { StrictMode, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import { createStore, shallowEqual } from '../src/index.js';
import { persist } from '../src/middleware/index.js';
import { useStore, createStoreHook } from '../src/react.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const makeCounter = () =>
  createStore((set) => ({
    count: 0,
    label: 'clicks',
    increment: () => set((s) => ({ count: s.count + 1 })),
  }));

/** Renders `useStore` in a component that counts its own renders. */
const renderCounting = (useValue) => {
  const renders = { count: 0 };
  const results = [];
  const Probe = () => {
    renders.count += 1;
    const value = useValue();
    results.push(value);
    return <output>{JSON.stringify(value)}</output>;
  };
  render(<Probe />);
  return { renders, results };
};

describe('useStore', () => {
  describe('reading state', () => {
    it('returns the selected slice', () => {
      const store = makeCounter();
      const Count = () => <p>{useStore(store, (s) => s.count)}</p>;
      render(<Count />);
      expect(screen.getByText('0')).toBeTruthy();
    });

    it('returns the whole state without a selector', () => {
      const store = createStore({ a: 1, b: 2 });
      const { results } = renderCounting(() => useStore(store));
      expect(results.at(-1)).toBe(store.getState());
    });

    it('shows restored state from persist on the first render', () => {
      const storage = {
        getItem: () => JSON.stringify({ state: { count: 42 }, version: 0 }),
        setItem: () => {},
        removeItem: () => {},
      };
      const store = createStore(persist({ count: 0 }, { key: 'c', storage }));
      const { results } = renderCounting(() => useStore(store, (s) => s.count));
      expect(results).toEqual([42]); // never rendered the default 0
    });
  });

  describe('re-rendering', () => {
    it('re-renders when the selected slice changes', () => {
      const store = makeCounter();
      const Count = () => <p>{useStore(store, (s) => s.count)}</p>;
      render(<Count />);

      act(() => store.getState().increment());

      expect(screen.getByText('1')).toBeTruthy();
    });

    it('updates through actions called from event handlers', () => {
      const store = makeCounter();
      const Counter = () => {
        const count = useStore(store, (s) => s.count);
        const increment = useStore(store, (s) => s.increment);
        return <button onClick={increment}>count: {count}</button>;
      };
      render(<Counter />);

      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByRole('button').textContent).toBe('count: 2');
    });

    it('does not re-render when an unrelated part of state changes', () => {
      const store = makeCounter();
      const { renders } = renderCounting(() => useStore(store, (s) => s.label));
      expect(renders.count).toBe(1);

      act(() => store.getState().increment());
      act(() => store.getState().increment());

      expect(renders.count).toBe(1);
    });

    it('does not re-render for derived values that stay the same', () => {
      const store = createStore({ count: 0 });
      const { renders } = renderCounting(() =>
        useStore(store, (s) => s.count % 2 === 0)
      );

      act(() => store.setState({ count: 2 })); // still even

      expect(renders.count).toBe(1);
    });

    it('re-renders once per change, not per subscriber call', () => {
      const store = makeCounter();
      const { renders } = renderCounting(() => useStore(store, (s) => s.count));

      act(() => store.getState().increment());

      expect(renders.count).toBe(2);
    });

    it('batches several updates inside one act into one render', () => {
      const store = makeCounter();
      const { renders } = renderCounting(() => useStore(store, (s) => s.count));

      act(() => {
        store.getState().increment();
        store.getState().increment();
        store.getState().increment();
      });

      expect(renders.count).toBe(2);
      expect(store.getState().count).toBe(3);
    });
  });

  describe('selectors that build new objects', () => {
    it('with shallowEqual, returns the same object until a field changes', () => {
      const store = makeCounter();
      const { renders, results } = renderCounting(() =>
        useStore(store, (s) => ({ count: s.count }), shallowEqual)
      );

      act(() => store.setState({ label: 'taps' })); // unrelated
      expect(renders.count).toBe(1);

      act(() => store.getState().increment());
      expect(renders.count).toBe(2);
      expect(results.at(-1)).toEqual({ count: 1 });
    });

    it('does not loop forever even without shallowEqual', () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const store = makeCounter();

      const { renders } = renderCounting(() =>
        useStore(store, (s) => ({ count: s.count }))
      );
      act(() => store.getState().increment());

      expect(renders.count).toBe(2);
      // React warns about uncached snapshots or infinite loops via console.error.
      expect(errors).not.toHaveBeenCalled();
    });
  });

  describe('changing inputs', () => {
    it('uses the new selector when the selector changes', () => {
      const store = createStore({ a: 'A', b: 'B' });
      const Picker = () => {
        const [field, setField] = useState('a');
        const value = useStore(store, (s) => s[field]);
        return <button onClick={() => setField('b')}>{value}</button>;
      };
      render(<Picker />);
      expect(screen.getByRole('button').textContent).toBe('A');

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByRole('button').textContent).toBe('B');
    });

    it('switches to a new store when the store changes', () => {
      const first = createStore({ name: 'first' });
      const second = createStore({ name: 'second' });
      const Name = ({ store }) => <p>{useStore(store, (s) => s.name)}</p>;

      const { rerender } = render(<Name store={first} />);
      rerender(<Name store={second} />);
      expect(screen.getByText('second')).toBeTruthy();

      // Updates to the old store no longer matter.
      act(() => first.setState({ name: 'stale' }));
      expect(screen.getByText('second')).toBeTruthy();

      act(() => second.setState({ name: 'fresh' }));
      expect(screen.getByText('fresh')).toBeTruthy();
    });
  });

  describe('subscriptions', () => {
    it('unsubscribes when the component unmounts', () => {
      const store = makeCounter();
      // Track how many subscriptions are live at any moment.
      let live = 0;
      const original = store.subscribe;
      store.subscribe = (listener) => {
        live += 1;
        const unsubscribe = original(listener);
        return () => {
          live -= 1;
          unsubscribe();
        };
      };
      const Count = () => <p>{useStore(store, (s) => s.count)}</p>;
      const { unmount } = render(<Count />);
      expect(live).toBe(1);

      unmount();

      expect(live).toBe(0);
    });

    it('does not warn about updates after unmount', () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const store = makeCounter();
      const Count = () => <p>{useStore(store, (s) => s.count)}</p>;
      const { unmount } = render(<Count />);

      unmount();
      act(() => store.getState().increment());

      expect(errors).not.toHaveBeenCalled();
    });

    it('keeps several components in sync with one store', () => {
      const store = makeCounter();
      const Count = ({ id }) => (
        <p data-testid={id}>{useStore(store, (s) => s.count)}</p>
      );
      render(
        <>
          <Count id="a" />
          <Count id="b" />
        </>
      );

      act(() => store.getState().increment());

      expect(screen.getByTestId('a').textContent).toBe('1');
      expect(screen.getByTestId('b').textContent).toBe('1');
    });

    it('works under StrictMode (double-invoked effects and renders)', () => {
      const store = makeCounter();
      const Count = () => <p>{useStore(store, (s) => s.count)}</p>;
      render(
        <StrictMode>
          <Count />
        </StrictMode>
      );

      act(() => store.getState().increment());

      expect(screen.getByText('1')).toBeTruthy();
    });
  });

  describe('server rendering', () => {
    it('renders the current state with renderToString', () => {
      const store = makeCounter();
      store.getState().increment();
      const Count = () => <p>{useStore(store, (s) => s.count)}</p>;

      expect(renderToString(<Count />)).toBe('<p>1</p>');
    });
  });

  describe('validation', () => {
    it.each([undefined, null, {}, { getState() {} }])(
      'throws a TypeError for something that is not a store (%o)',
      (notAStore) => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const Bad = () => useStore(notAStore);
        expect(() => render(<Bad />)).toThrow(TypeError);
      }
    );
  });
});

describe('createStoreHook', () => {
  it('returns a hook bound to the store', () => {
    const useCounter = createStoreHook(makeCounter());
    const Counter = () => {
      const count = useCounter((s) => s.count);
      const increment = useCounter((s) => s.increment);
      return <button onClick={increment}>{count}</button>;
    };
    render(<Counter />);

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button').textContent).toBe('1');
  });

  it('passes equalityFn through', () => {
    const useCounter = createStoreHook(makeCounter());
    const { renders } = renderCounting(() =>
      useCounter((s) => ({ count: s.count }), shallowEqual)
    );

    act(() => useCounter.store.setState({ label: 'taps' }));

    expect(renders.count).toBe(1);
  });

  it('returns the whole state without a selector', () => {
    const store = createStore({ a: 1 });
    const useBound = createStoreHook(store);
    const { results } = renderCounting(() => useBound());
    expect(results.at(-1)).toBe(store.getState());
  });

  it('exposes the store for use outside React', () => {
    const store = makeCounter();
    expect(createStoreHook(store).store).toBe(store);
  });

  it('throws a TypeError for something that is not a store', () => {
    expect(() => createStoreHook({})).toThrow(TypeError);
  });
});
