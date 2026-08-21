export type AppMode = 'admin' | 'pos';

/**
 * Determine the runtime mode of the web application.
 * - If `?mode=pos` is present in the URL search params (or configured via env), return 'pos'.
 * - Otherwise default to 'admin' mode (Web Management Portal).
 */
export function getAppMode(): AppMode {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get('mode');
    if (urlMode === 'pos') return 'pos';
    if (urlMode === 'admin') return 'admin';
  }
  const envMode = process.env.NEXT_PUBLIC_APP_MODE;
  if (envMode === 'pos') return 'pos';
  return 'admin';
}
