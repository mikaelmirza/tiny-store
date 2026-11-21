// Checks that the *built* package works the way people will install it:
// through its own package name and exports map, with both `import` and
// `require`. Run after `npm run build`.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const pkg = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8')
);
const require = createRequire(import.meta.url);

// Node lets a package import itself by name, which goes through "exports"
// exactly like it would for a user who installed it.
const load = {
  esm: (subpath) => import(`${pkg.name}${subpath}`),
  cjs: async (subpath) => require(`${pkg.name}${subpath}`),
};

for (const [format, importEntry] of Object.entries(load)) {
  const core = await importEntry('');
  const middleware = await importEntry('/middleware');
  const react = await importEntry('/react');

  assert.equal(typeof core.createStore, 'function', `${format}: createStore`);
  assert.equal(typeof core.shallowEqual, 'function', `${format}: shallowEqual`);
  assert.equal(typeof middleware.logger, 'function', `${format}: logger`);
  assert.equal(typeof middleware.persist, 'function', `${format}: persist`);
  assert.equal(typeof react.useStore, 'function', `${format}: useStore`);
  assert.equal(typeof react.createStoreHook, 'function', `${format}: createStoreHook`);

  // A quick end-to-end run through the built code.
  const seen = [];
  const store = core.createStore(
    middleware.persist(
      middleware.logger(
        (set) => ({ count: 0, increment: () => set((s) => ({ count: s.count + 1 })) }),
        { log: (entry) => seen.push(entry.changedKeys) }
      ),
      { key: 'smoke', storage: null }
    )
  );
  store.subscribe(
    (s) => s.count,
    (count) => seen.push(count)
  );
  store.getState().increment();

  assert.equal(store.getState().count, 1, `${format}: state updated`);
  assert.deepEqual(seen, [1, ['count']], `${format}: listener and logger ran`);
  assert.equal(store.persist.storage, null, `${format}: persist API present`);

  console.log(`✓ ${format.toUpperCase()} build works`);
}
