# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-21

First release.

### Added

- `createStore` with `getState`, `setState` (partial objects or updater functions) and
  `subscribe`.
- Selector subscriptions: `subscribe(selector, listener, { equalityFn, fireImmediately })`.
- `shallowEqual` for objects, arrays, `Map` and `Set`.
- Initializer form `createStore((set, get, api) => state)` for actions.
- `tiny-store/middleware`: `logger` and `persist` (versioning, migrations, `partialize`,
  custom storage, `store.persist.clear()`).
- `tiny-store/react`: `useStore` (built on `useSyncExternalStore`) and `createStoreHook`.
- TypeScript definitions for every entry point.
- ESM and CommonJS builds.
