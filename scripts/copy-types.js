// Copies the hand-written type definitions from types/ into dist/.
//
// Each file is written twice:
//   dist/<name>.d.ts   for ESM consumers (`import`)
//   dist/<name>.d.cts  for CommonJS consumers (`require`)
//
// TypeScript decides whether a .d.ts describes ESM or CommonJS from its
// extension, so CommonJS needs its own .d.cts copy whose relative imports
// point at the .cjs files.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';

const SRC = new URL('../types/', import.meta.url);
const OUT = new URL('../dist/', import.meta.url);

await mkdir(OUT, { recursive: true });

const files = (await readdir(SRC)).filter((file) => file.endsWith('.d.ts'));

for (const file of files) {
  const source = await readFile(new URL(file, SRC), 'utf8');
  const cjs = source.replace(/(from\s+['"]\.\/[^'"]+)\.js(['"])/g, '$1.cjs$2');

  await writeFile(new URL(file, OUT), source);
  await writeFile(new URL(file.replace(/\.d\.ts$/, '.d.cts'), OUT), cjs);
}

console.log(`Copied ${files.length} type definition files to dist/ (ESM + CJS).`);
