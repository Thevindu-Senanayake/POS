export type AppMode = 'admin' | 'pos';

/**
 * Determine the runtime mode of the web application.
 * - If running inside Electron or embedded 127.0.0.1 local server -> 'pos'
 * - If `?mode=pos` in URL -> 'pos'
 * - Otherwise default to 'admin' mode (Web Management Portal).
 */
export function getAppMode(): AppMode {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get('mode');
    if (urlMode === 'pos') return 'pos';
    if (urlMode === 'admin') return 'admin';

    // Automatically detect Electron desktop shell or local embedded 127.0.0.1 server
    const isElectron = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
    const isLocalEmbeddedServer = window.location.hostname === '127.0.0.1';
    if (isElectron || isLocalEmbeddedServer) {
      return 'pos';
    }
  }
  const envMode = process.env.NEXT_PUBLIC_APP_MODE;
  if (envMode === 'pos') return 'pos';
  return 'admin';
}
