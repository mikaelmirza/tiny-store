/**
 * Lets middleware accept either an initializer function or a plain
 * initial-state object, like `createStore` itself does.
 *
 * @template T
 * @param {T | ((set: any, get: any, api: any) => T)} init
 * @returns {(set: any, get: any, api: any) => T}
 */
export const toInitializer = (init) => (typeof init === 'function' ? init : () => init);
