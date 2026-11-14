// Runs the real friends server (worker/worker.js) on the Workers runtime, locally, for tests and `npm start`.
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));

export async function bundleWorker() {
  const esbuild = require('esbuild');
  const out = await esbuild.build({ absWorkingDir: root, entryPoints: ['worker/worker.js'], bundle: true, format: 'esm', target: 'es2022', external: ['cloudflare:workers'], write: false, logLevel: 'warning' });
  return out.outputFiles[0].text;
}

/** Start the server. With `port`, it listens for real connections; without, use `call` and `socket`. */
export async function startHub({ port, testClock = true, persist = false } = {}) {
  const { Miniflare } = require('miniflare');
  const toml = await readFile(root + 'worker/wrangler.toml', 'utf8');
  const mf = new Miniflare({
    modules: [{ type: 'ESModule', path: 'worker.js', contents: await bundleWorker() }],
    compatibilityDate: toml.match(/compatibility_date\s*=\s*"([^"]+)"/)[1],
    durableObjects: { HUB: { className: 'HubObject', useSQLite: true } },
    bindings: testClock ? { TEST_CLOCK: '1' } : {},
    ...(port ? { port, host: '127.0.0.1' } : {}),
    ...(persist ? { durableObjectsPersist: persist } : {}),
  });
  const url = (await mf.ready).toString().replace(/\/$/, '');
  /** One API call: returns {status, body}. */
  async function call(method, path, { token, body, now, ip } = {}) {
    const res = await mf.dispatchFetch('http://hub' + path, {
      method,
      headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(now ? { 'x-haven-now': String(now) } : {}), ...(ip ? { 'CF-Connecting-IP': ip } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  }
  /** A live connection for a signed-in person. `messages` fills as the server pushes. */
  async function socket(token, now) {
    const ticket = (await call('POST', '/api/live/ticket', { token, now })).body.ticket;
    const res = await mf.dispatchFetch(`http://hub/api/live?ticket=${ticket}`, { headers: { Upgrade: 'websocket', ...(now ? { 'x-haven-now': String(now) } : {}) } });
    if (!res.webSocket) throw new Error('No live connection: HTTP ' + res.status);
    const ws = res.webSocket, messages = [], waiting = [];
    ws.accept();
    ws.addEventListener('message', event => {
      if (event.data === 'pong') { messages.push('pong'); } else messages.push(JSON.parse(event.data));
      for (const w of [...waiting]) { const hit = messages.find(w.test); if (hit) { waiting.splice(waiting.indexOf(w), 1); w.resolve(hit); } }
    });
    /** Wait for a pushed message that passes `test`. */
    const next = (test, ms = 3000) => new Promise((resolve, reject) => {
      const hit = messages.find(test);
      if (hit) return resolve(hit);
      const w = { test, resolve };
      waiting.push(w);
      setTimeout(() => { if (waiting.includes(w)) { waiting.splice(waiting.indexOf(w), 1); reject(new Error('No such message within ' + ms + ' ms. Got: ' + JSON.stringify(messages))); } }, ms);
    });
    return { ws, messages, next, clear: () => { messages.length = 0; }, close: () => ws.close(1000, 'bye') };
  }
  return { mf, url, call, socket, stop: () => mf.dispose() };
}
