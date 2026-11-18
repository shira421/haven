// Haven's server on Cloudflare Workers.
// One Durable Object holds every account, friendship and room in its own SQLite database and keeps
// the live WebSocket connections, so a change made by one person reaches their friends at once.
// The rules are in hub.js; this file is the plumbing: HTTP, CORS, WebSockets, storage.
import { DurableObject } from 'cloudflare:workers';
import { Hub, ApiError } from './hub.js';

// Every call carries its own bearer token and no cookies, so any page may call the API safely.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Haven-Version',
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
    const testing = env.TEST_CLOCK === '1' && url.pathname.startsWith('/test/');
    if (url.pathname !== '/health' && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/auth/google/') && !testing) return json(404, { error: 'Not found.' });
    if (!['GET', 'POST', 'PUT'].includes(request.method)) return json(405, { error: 'Method not allowed.' });
    const length = Number(request.headers.get('Content-Length') || 0);
    if (length > MAX_BODY) return json(413, { error: 'That is too large to send.' });
    // All of Haven lives in one object, created near the first people to use it.
    const stub = env.HUB.get(env.HUB.idFromName('hub'), { locationHint: 'apac' });
    return stub.fetch(request);
  },
};

// Signing in with Google is on when the server has been given a Google OAuth client:
// the secrets GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. HAVEN_SITE lists the pages people may
// be sent back to afterwards (comma-separated); the apps come back through haven://auth.
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const DEFAULT_SITE = 'https://shira421.github.io/haven/';
const page = (status, text) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Haven</title><body style="font:16px system-ui;margin:3rem auto;max-width:28rem;padding:0 1rem"><h1 style="font-size:1.25rem">Haven</h1><p>${text}</p>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } });
const redirect = to => new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'no-store' } });

/** What Google says about the person, from the ID token it returned over a direct TLS connection. */
function readIdToken(token) {
  try {
    const part = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part), c => c.charCodeAt(0))));
    return claims.sub ? { sub: String(claims.sub), name: claims.given_name || claims.name || '' } : null;
  } catch { return null; }
}

export class HubObject extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const testing = env.TEST_CLOCK === '1';
    this.google = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET } : null;
    this.hub = new Hub({
      config: {
        google: Boolean(this.google),
        returns: String(env.HAVEN_SITE || DEFAULT_SITE).split(',').map(v => v.trim()).filter(Boolean),
        dev: testing,
      },
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
    if (url.pathname.startsWith('/auth/google/')) return this.googleSignIn(request, url, now);
    if (url.pathname === '/test/clock') {
      // Only reachable when TEST_CLOCK is set, which a deployed server never has.
      if (this.env.TEST_CLOCK !== '1') return json(404, { error: 'Not found.' });
      this.testOffset = Number((await request.json()).offset) || 0;
      return json(200, { offset: this.testOffset });
    }
    if (url.pathname === '/test/sql') {
      // For tests only: put the database in a state an older version of Haven left it in.
      if (this.env.TEST_CLOCK !== '1') return json(404, { error: 'Not found.' });
      const { q, p = [] } = await request.json();
      return json(200, { rows: this.ctx.storage.sql.exec(q, ...p).toArray() });
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
      version: request.headers.get('X-Haven-Version'),
      now,
    });
    return json(result.status, result.body);
  }

  /**
   * Signing in with Google, in the browser: /start sends the person to Google, Google sends them
   * to /callback, and they go back to Haven carrying a one-time code the app exchanges for a token.
   */
  async googleSignIn(request, url, now) {
    if (request.method !== 'GET') return json(405, { error: 'Method not allowed.' });
    const q = Object.fromEntries(url.searchParams), callback = url.origin + '/auth/google/callback';
    try {
      if (url.pathname === '/auth/google/start') {
        const state = this.ctx.storage.transactionSync(() => this.hub.googleStart(q, now, request.headers.get('CF-Connecting-IP') || 'local'));
        // Tests stand in for Google: they come straight back with a made-up person.
        if (this.env.TEST_CLOCK === '1' && q.as) return redirect(`${callback}?state=${state}&code=${encodeURIComponent('test:' + q.as)}`);
        return redirect(`${GOOGLE_AUTH}?${new URLSearchParams({ client_id: this.google.id, redirect_uri: callback, response_type: 'code', scope: 'openid profile', state, prompt: 'select_account' })}`);
      }
      if (url.pathname === '/auth/google/callback') {
        let who = null;
        if (q.code && this.env.TEST_CLOCK === '1' && q.code.startsWith('test:')) { const [sub, name] = q.code.slice(5).split('|'); who = { sub, name: name || '' }; }
        else if (q.code && this.google) {
          const res = await fetch(GOOGLE_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: q.code, client_id: this.google.id, client_secret: this.google.secret, redirect_uri: callback, grant_type: 'authorization_code' }) });
          if (res.ok) who = readIdToken((await res.json()).id_token);
        }
        const to = this.ctx.storage.transactionSync(() => this.hub.googleBack(q.state, who, now));
        return to ? redirect(to) : page(400, 'That sign-in has run out. Go back to Haven and choose "Continue with Google" again.');
      }
    } catch (error) {
      if (error instanceof ApiError) return page(error.status, error.message);
      throw error;
    }
    return json(404, { error: 'Not found.' });
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
