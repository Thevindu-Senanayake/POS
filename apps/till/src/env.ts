import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Minimal `.env` file loader for the *packaged* till. In dev, dotenv-cli injects
 * the repo-root .env; a shipped installer has neither dotenv-cli nor that file,
 * so the technician drops a `till.env` beside the executable (or in the app's
 * userData folder) to point the till at the API and hand it the print token.
 *
 * Deliberately dependency-free — a shipped till carries zero runtime deps, so
 * the asar can't silently miss one. Real environment variables always win: a key
 * already present in process.env is never overwritten by the file.
 */

const ENV_FILE = 'till.env';

/** Parse KEY=VALUE lines, ignoring blanks and #comments, stripping matched quotes. */
function parse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key === '') continue;
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Apply one file's KEY=VALUE pairs to process.env (never overriding). Returns true if it existed. */
function applyFile(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    for (const [key, value] of Object.entries(parse(readFileSync(path, 'utf8')))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Load `till.env` from the executable's folder first, then the app's userData
 * folder, mutating process.env in place. Both are searched so a shared value set
 * beside the exe and a per-machine override in userData can combine; because
 * applyFile never overwrites, the exe-adjacent file wins on any key they share.
 * Returns the paths that were applied, for startup logging.
 */
export function loadEnvFiles(exeDir: string, userDataDir: string): string[] {
  const applied: string[] = [];
  for (const path of [join(exeDir, ENV_FILE), join(userDataDir, ENV_FILE)]) {
    if (applyFile(path)) applied.push(path);
  }
  return applied;
}
