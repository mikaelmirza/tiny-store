import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.js',
    middleware: 'src/middleware/index.js',
    react: 'src/react.js',
  },
  format: ['esm', 'cjs'], // → dist/*.js (ESM) and dist/*.cjs (CommonJS)
  target: 'es2020',
  platform: 'neutral', // runs in browsers, Node, Deno, Bun and workers
  external: ['react'],
  clean: true,
  treeshake: true,
  // Readable output: the bundle is tiny, and readable code is easier to
  // debug for people who install the library.
  minify: false,
  sourcemap: false,
  // Types are hand-written in types/ and copied by scripts/copy-types.js.
  dts: false,
});
