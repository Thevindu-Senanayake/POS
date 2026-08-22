import { createServer, type Server } from 'node:http';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { log, warn } from './log';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

export interface LocalServerHandle {
  server: Server;
  url: string;
  port: number;
}

/**
 * Starts an internal, zero-dependency Node HTTP static server on 127.0.0.1
 * on a random available port assigned by the OS. This allows the Electron
 * Till App to run as a 100% self-contained desktop app (like VS Code)
 * without depending on an external web server on port 3000.
 */
export function startLocalPosServer(distUiDir: string): Promise<LocalServerHandle> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const reqUrl = req.url || '/';
      const cleanPath = reqUrl.split('?')[0];

      // Resolve the request against the Next.js static export on disk
      // (next.config `output: 'export'`, default trailingSlash: false):
      //   /          -> index.html
      //   /pos       -> pos.html      (NOT pos/index.html)
      //   /pos/order -> pos/order.html
      //   /pos.txt   -> pos.txt       (RSC payload, an exact file)
      //   /_next/…   -> the asset itself
      //
      // A route such as /pos emits BOTH a `pos.html` file AND a `pos/` directory
      // (which only holds the nested /pos/order route — it has no index.html).
      // The `.html` sibling MUST take priority over that directory: resolving the
      // directory first rewrites /pos to pos/index.html, which doesn't exist, and
      // then falls back to the root index.html (the landing page). The landing
      // page immediately redirects back to /pos, so a hard navigation to /pos,
      // /rooms or /admin gets stuck on the "Opening your workspace…" spinner
      // forever. Same trap for /rooms and /admin.
      let filePath = join(distUiDir, cleanPath);

      if (existsSync(`${filePath}.html`)) {
        // Route page: /pos -> pos.html, /login -> login.html, /pos/order -> pos/order.html
        filePath = `${filePath}.html`;
      } else if (existsSync(filePath) && statSync(filePath).isDirectory()) {
        // A real directory carrying its own index.html (e.g. the site root '/')
        filePath = join(filePath, 'index.html');
      }

      // SPA fallback for anything still unresolved (unknown / client-only routes).
      if (!existsSync(filePath)) {
        filePath = join(distUiDir, 'index.html');
      }

      if (!existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }

      const ext = extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      });
      createReadStream(filePath).pipe(res);
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address !== null) {
        const port = address.port;
        const url = `http://127.0.0.1:${port}`;
        log(`local POS UI server running on ${url} (root: ${distUiDir})`);
        resolve({ server, url, port });
      } else {
        const err = new Error('Failed to retrieve local server address');
        warn(err.message);
        reject(err);
      }
    });

    server.on('error', (err) => {
      warn(`local POS UI server error: ${err.message}`);
      reject(err);
    });
  });
}
