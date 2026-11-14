// Haven's friends server on Cloudflare Workers.
// One Durable Object holds every profile, friendship and room in its own SQLite database and keeps
// the live WebSocket connections, so a change made by one person reaches their friends at once.
// The rules are in hub.js; this file is the plumbing: HTTP, CORS, WebSockets, storage.
import { DurableObject } from 'cloudflare:workers';
import { Hub } from './hub.js';

// Every call carries its own bearer token and no cookies, so any page may call the API safely.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};
const MAX_BODY = 800000;
const OPEN = 1; // WebSocket.readyState of an open connection

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...CORS } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/') return json(200, { service: 'haven-hub', about: 'https://github.com/shira421/haven' });
    const testing = env.TEST_CLOCK === '1' && url.pathname === '/test/clock';
    if (url.pathname !== '/health' && !url.pathname.startsWith('/api/') && !testing) return json(404, { error: 'Not found.' });
    if (!['GET', 'POST', 'PUT'].includes(request.method)) return json(405, { error: 'Method not allowed.' });
    const length = Number(request.headers.get('Content-Length') || 0);
    if (length > MAX_BODY) return json(413, { error: 'That is too large to send.' });
    // All of Haven lives in one object, created near the first people to use it.
    const stub = env.HUB.get(env.HUB.idFromName('hub'), { locationHint: 'apac' });
    return stub.fetch(request);
  },
};

export class HubObject extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.hub = new Hub({
      sql: (query, ...params) => ctx.storage.sql.exec(query, ...params).toArray(),
      tx: fn => ctx.storage.transactionSync(fn),
      push: (userId, message) => {
        const text = JSON.stringify(message);
        for (const ws of ctx.getWebSockets(userId)) {
          try { if (ws.readyState === OPEN) ws.send(text); } catch { /* the connection is closing */ }
        }
      },
      online: userId => ctx.getWebSockets(userId).some(ws => ws.readyState === OPEN),
    });
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  /** The time of this request. Tests may set it; a deployed server never lets a caller do so. */
  clock(request) {
    if (this.env.TEST_CLOCK === '1') {
      const forced = Number(request.headers.get('x-haven-now'));
      if (forced) return forced;
      return Date.now() + (this.testOffset || 0);
    }
    return Date.now();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const now = this.clock(request);
    if (url.pathname === '/api/live') return this.connect(request, url, now);
    if (url.pathname === '/test/clock') {
      // Only reachable when TEST_CLOCK is set, which a deployed server never has.
      if (this.env.TEST_CLOCK !== '1') return json(404, { error: 'Not found.' });
      this.testOffset = Number((await request.json()).offset) || 0;
      return json(200, { offset: this.testOffset });
    }
    let body = {};
    if (request.method !== 'GET') {
      const text = await request.text();
      if (text.length > MAX_BODY) return json(413, { error: 'That is too large to send.' });
      if (text) {
        try { body = JSON.parse(text); } catch { return json(400, { error: 'The request could not be read.' }); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'The request could not be read.' });
      }
    }
    const auth = request.headers.get('Authorization') || '';
    const result = await this.hub.handle({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
      token: auth.startsWith('Bearer ') ? auth.slice(7).trim() : null,
      ip: request.headers.get('CF-Connecting-IP') || 'local',
      now,
    });
    return json(result.status, result.body);
  }

  /** Open a live connection for the person holding a fresh one-time ticket. */
  connect(request, url, now) {
    if (request.headers.get('Upgrade') !== 'websocket') return json(426, { error: 'This address is for live connections.' });
    const userId = this.hub.redeemTicket(url.searchParams.get('ticket'), now);
    if (!userId) return json(401, { error: 'The live connection could not be opened. Try again.' });
    const first = !this.ctx.getWebSockets(userId).some(ws => ws.readyState === OPEN);
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [userId]);
    server.serializeAttachment({ userId, connection: crypto.randomUUID() });
    server.send(JSON.stringify({ t: 'hello', now }));
    if (first) this.hub.presence(userId, true, now);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage() {
    // Clients only send "ping", which is answered automatically. Everything else goes over HTTP.
  }

  webSocketClose(ws, code, reason) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, reason); } catch { /* already closed */ }
    this.disconnected(ws);
  }

  webSocketError(ws) {
    this.disconnected(ws);
  }

  /** When someone's last connection closes, their friends see them go offline. */
  disconnected(ws) {
    const info = ws.deserializeAttachment();
    if (!info?.userId) return;
    const others = this.ctx.getWebSockets(info.userId).some(other => other.readyState === OPEN && other.deserializeAttachment()?.connection !== info.connection);
    if (!others) this.hub.presence(info.userId, false, Date.now());
  }
}
