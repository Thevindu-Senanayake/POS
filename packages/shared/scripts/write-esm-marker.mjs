// Marks the ESM build output as ES modules so bundlers/Node treat dist/esm/*.js
// as ESM (the CJS build in dist/ stays governed by the package's own
// "type": "commonjs"). Run after `tsc -p tsconfig.esm.json`.
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('dist/esm', { recursive: true });
writeFileSync('dist/esm/package.json', `${JSON.stringify({ type: 'module' }, null, 2)}\n`);
