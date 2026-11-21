import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStore } from '../src/index.js';
import { logger } from '../src/middleware/index.js';

const counter = (set) => ({
  count: 0,
  label: 'a',
  increment: () => set((s) => ({ count: s.count + 1 })),
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logger', () => {
  it('logs updates made by actions', () => {
    const log = vi.fn();
    const store = createStore(logger(counter, { log }));

    store.getState().increment();

    expect(log).toHaveBeenCalledTimes(1);
    const entry = log.mock.calls[0][0];
    expect(entry.name).toBe('store');
    expect(entry.prevState.count).toBe(0);
    expect(entry.nextState.count).toBe(1);
    expect(entry.changedKeys).toEqual(['count']);
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    expect(entry).not.toHaveProperty('error');
  });

  it('logs updates made from outside through store.setState', () => {
    const log = vi.fn();
    const store = createStore(logger(counter, { log }));

    store.setState({ label: 'b', count: 5 });

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0].changedKeys).toEqual(['count', 'label']);
  });

  it('lists newly added keys as changed', () => {
    const log = vi.fn();
    const store = createStore(logger({ a: 1 }, { log }));

    store.setState({ b: 2 });

    expect(log.mock.calls[0][0].changedKeys).toEqual(['b']);
  });

  it('accepts a plain initial-state object', () => {
    const log = vi.fn();
    const store = createStore(logger({ count: 0 }, { log }));

    store.setState({ count: 1 });

    expect(log).toHaveBeenCalledTimes(1);
    expect(store.getState().count).toBe(1);
  });

  it('uses the name option in entries', () => {
    const log = vi.fn();
    const store = createStore(logger(counter, { name: 'cart', log }));
    store.getState().increment();
    expect(log.mock.calls[0][0].name).toBe('cart');
  });

  it('does not log no-op updates', () => {
    const log = vi.fn();
    const store = createStore(logger(counter, { log }));

    store.setState({ count: 0 });

    expect(log).not.toHaveBeenCalled();
  });

  it('does nothing when disabled, but still updates state', () => {
    const log = vi.fn();
    const store = createStore(logger(counter, { log, enabled: false }));

    store.getState().increment();

    expect(log).not.toHaveBeenCalled();
    expect(store.getState().count).toBe(1);
  });

  it('still logs (with the error) and rethrows when a listener throws', () => {
    const log = vi.fn();
    const store = createStore(logger(counter, { log }));
    const boom = new Error('boom');
    store.subscribe(() => {
      throw boom;
    });

    expect(() => store.getState().increment()).toThrow(boom);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0].error).toBe(boom);
    expect(log.mock.calls[0][0].nextState.count).toBe(1);
  });

  it('writes a readable line to console.log by default', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const store = createStore(logger(counter, { name: 'counter' }));

    store.getState().increment();

    expect(spy).toHaveBeenCalledTimes(1);
    const [summary, entry] = spy.mock.calls[0];
    expect(summary).toMatch(/^\[counter\] changed count in \d+\.\d{2}ms$/);
    expect(entry.nextState.count).toBe(1);
  });

  it('mentions a throwing listener in the default output', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const store = createStore(logger(counter));
    store.subscribe(() => {
      throw new Error('boom');
    });

    expect(() => store.getState().increment()).toThrow();
    expect(spy.mock.calls[0][0]).toMatch(/a listener threw/);
  });

  it('falls back to Date.now when performance is unavailable', () => {
    vi.stubGlobal('performance', undefined);
    try {
      const log = vi.fn();
      const store = createStore(logger(counter, { log }));
      store.getState().increment();
      expect(log.mock.calls[0][0].durationMs).toBeGreaterThanOrEqual(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('throws a TypeError for a non-function log option', () => {
    expect(() => logger(counter, { log: 'nope' })).toThrow(TypeError);
  });
});
