/**
 * Compares two values one level deep.
 *
 * - Identical values (by `Object.is`) are equal.
 * - Arrays are equal when they have the same length and each item is `Object.is`-equal.
 * - Maps are equal when they have the same keys mapped to `Object.is`-equal values.
 * - Sets are equal when they contain the same members.
 * - Other objects are equal when they have the same own enumerable keys
 *   with `Object.is`-equal values.
 *
 * Nested objects are compared by reference, not recursively.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function shallowEqual(a, b) {
  if (Object.is(a, b)) return true;

  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }

  // An array and an object with keys "0", "1"... are not considered equal.
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  if (Array.isArray(a)) {
    return a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  }

  if (a instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key) || !Object.is(value, b.get(key))) return false;
    }
    return true;
  }

  if (a instanceof Set) {
    if (a.size !== b.size) return false;
    for (const member of a) {
      if (!b.has(member)) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;

  return keysA.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && Object.is(a[key], b[key])
  );
}
