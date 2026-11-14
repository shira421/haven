// Local development: serves dist/ and runs the real friends server beside it.
//   npm run build && npm start   →  http://localhost:4173 (app) and http://localhost:8787 (friends)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve('dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

export function createStaticServer() {
  return createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = resolve(join(root, normalize(path === '/' ? '/index.html' : path)));
      if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end('Forbidden'); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(body);
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found'); }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 4173), host = process.env.HOST || '127.0.0.1';
  createStaticServer().listen(port, host, () => console.log(`Haven app      http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
  try {
    const { startHub } = await import('./tests/hub-server.mjs');
    const hub = await startHub({ port: 8787, testClock: false, persist: '.haven-dev' });
    console.log(`Friends server ${hub.url} (data in .haven-dev/)`);
    process.on('SIGINT', async () => { await hub.stop(); process.exit(0); });
  } catch (error) { console.log(`Friends server not started: ${error.message}`); }
}
