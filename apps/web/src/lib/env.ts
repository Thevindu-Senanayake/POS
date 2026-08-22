/**
 * Public runtime config. `NEXT_PUBLIC_*` vars are inlined at build time; the repo
 * root `.env` is loaded via `dotenv -e ../../.env` in the package scripts. The
 * API mounts everything under the `/api` global prefix.
 */
const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

export const API_URL = stripTrailingSlash(process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000');
export const WS_URL = stripTrailingSlash(process.env.NEXT_PUBLIC_WS_URL ?? 'http://127.0.0.1:4000');
export const API_BASE = `${API_URL}/api`;
