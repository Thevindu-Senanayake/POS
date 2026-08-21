import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..', '..', '..');
const srcDir = resolve(rootDir, 'apps', 'web', 'out');
const destDir = resolve(rootDir, 'apps', 'till', 'dist-ui');

if (existsSync(srcDir)) {
  mkdirSync(destDir, { recursive: true });
  cpSync(srcDir, destDir, { recursive: true });
  console.log(`[till] copied POS UI static export from ${srcDir} to ${destDir}`);
} else {
  console.log(`[till] warning: ${srcDir} does not exist yet. Run 'pnpm --filter @pos/web build' first.`);
}
