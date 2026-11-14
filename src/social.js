// The app's side of friends: the profile on this device, calls to the friends server, and the live
// connection that brings requests, presence, rooms, cheers and gifts as they happen.
import { startOfDay, startOfWeek, startOfMonth } from './core.js';

export const SITE = 'https://shira421.github.io/haven/';
const ACCOUNT_KEY = 'haven-account';

export class SocialError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** Where the friends server is: a saved override, the address built in, a local one, or what the website says. */
export async function discoverApi({ storage, build, location, fetchImpl = fetch }) {
  const clean = v => (typeof v === 'string' && /^https?:\/\//.test(v) ? v.replace(/\/+$/, '') : null);
  const saved = clean(storage?.getItem('haven-api'));
  if (saved) return saved;
  if (clean(build)) return clean(build);
  if (['localhost', '127.0.0.1'].includes(location?.hostname)) return `http://${location.hostname}:8787`;
  try {
    // A copy of the app built before the server existed asks the website where it is.
    const res = await fetchImpl(SITE + 'config.json', { cache: 'no-store' });
    const found = clean((await res.json()).api);
    if (found) { storage?.setItem('haven-api-found', found); return found; }
  } catch { /* offline, or no website yet */ }
  return clean(storage?.getItem('haven-api-found'));
}

export const inviteLink = code => `${SITE}#add=${code}`;
export const prettyCode = code => (code && code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code || '');

export class Social {
  constructor({ store, storage, base = null, now = () => Date.now(), fetchImpl = (...a) => fetch(...a), WebSocketImpl = globalThis.WebSocket }) {
    this.store = store; this.storage = storage; this.base = base; this.now = now; this.fetch = fetchImpl; this.WS = WebSocketImpl;
    this.listeners = new Set();
    this.account = null;
    try { const a = JSON.parse(storage.getItem(ACCOUNT_KEY) || 'null'); if (a?.id && a?.token) this.account = a; } catch { /* no profile */ }
    this.status = this.account ? 'connecting' : 'signed-out'; // signed-out | connecting | live | offline
    this.offset = 0; // server clock minus this device's clock, in ms
    this.ws = null; this.attempt = 0; this.retryTimer = null; this.pingTimer = null; this.pongTimer = null;
    this.handled = new Set(); // inbox items already shown
    this.cardTimer = null; this.backupTimer = null;
    this.reset();
  }

  reset() { this.data = { friends: [], incoming: [], outgoing: [], inbox: [], room: null, today: 0, backupAt: null, feed: null, loaded: false }; }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, payload) { for (const fn of this.listeners) fn(type, payload); }
  setStatus(status) { if (this.status !== status) { this.status = status; this.emit('status', status); } }
  get signedIn() { return Boolean(this.account); }
  /** The server's idea of now, for anything timed together with friends. */
  serverNow() { return this.now() + this.offset; }

  // ——— Calls ———

  async api(method, path, body) {
    if (!this.base) throw new SocialError('no-server', 'Friends are not switched on for this copy of Haven yet.');
    let res;
    try {
      res = await this.fetch(this.base + path, {
        method,
        headers: { ...(this.account ? { Authorization: 'Bearer ' + this.account.token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new SocialError('offline', 'Cannot reach the friends server. Check your connection and try again.');
    }
    let json = {};
    try { json = await res.json(); } catch { /* not JSON */ }
    if (res.status === 401 && this.account && path !== '/api/logout') { this.forget(); }
    if (!res.ok) throw new SocialError(res.status, json.error || 'Something went wrong. Try again.');
    if (typeof json.now === 'number') this.offset = json.now - this.now();
    return json;
  }

  // ——— Profile ———

  saveAccount(user, token) {
    this.account = { id: user.id, name: user.name, handle: user.handle, code: user.code, avatar: user.avatar, token: token || this.account?.token };
    this.storage.setItem(ACCOUNT_KEY, JSON.stringify(this.account));
  }
  forget() {
    this.account = null;
    try { this.storage.removeItem(ACCOUNT_KEY); } catch { /* storage closed */ }
    this.disconnect();
    this.reset();
    this.setStatus('signed-out');
    this.emit('change');
  }
  async register(name, handle, avatar) {
    const r = await this.api('POST', '/api/register', { name, handle, avatar });
    this.saveAccount(r.user, r.token);
    this.setStatus('connecting');
    this.pushCard(0);
    await this.connect();
    return r.user;
  }
  /** Sign this device in to a profile that exists on another one, and bring its haven over. */
  async claim(code) {
    const r = await this.api('POST', '/api/link/claim', { code });
    this.saveAccount(r.user, r.token);
    this.setStatus('connecting');
    await this.restore().catch(() => {});
    await this.connect();
    return r.user;
  }
  async rename(name, avatar) {
    const r = await this.api('POST', '/api/profile', { name, avatar });
    this.saveAccount(r.me);
    this.emit('change');
  }
  async signOut() { try { await this.api('POST', '/api/logout'); } catch { /* signing out locally anyway */ } this.forget(); }
  async deleteAccount() { await this.api('POST', '/api/account/delete'); this.forget(); }
  linkCode() { return this.api('POST', '/api/link'); }

  /** Send the public card (level, totals, haven layout) soon after it changes. */
  pushCard(delay = 4000) {
    if (!this.account || !this.base) return;
    clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(() => { this.api('POST', '/api/profile', { card: this.store.publicCard() }).catch(() => {}); }, delay);
  }
  /** Keep a copy of the haven on the server so another device, or a reinstall, can get it back. */
  scheduleBackup(delay = 20000) {
    if (!this.account || !this.base) return;
    clearTimeout(this.backupTimer);
    this.backupTimer = setTimeout(() => { this.backup().catch(() => {}); }, delay);
  }
  async backup() {
    const r = await this.api('PUT', '/api/state', { state: this.store.exportState() });
    this.data.backupAt = r.at;
    this.emit('change');
    return r.at;
  }
  async restore() {
    const r = await this.api('GET', '/api/state');
    if (!r.state) return false;
    return this.store.importState(r.state, { merge: true }).ok;
  }

  // ——— Live connection ———

  async refresh() {
    const r = await this.api('GET', `/api/me?since=${startOfDay(this.now())}`);
    this.saveAccount(r.me);
    this.data = { ...this.data, friends: r.friends, incoming: r.incoming, outgoing: r.outgoing, inbox: r.inbox, room: r.room, today: r.me.today, backupAt: r.me.backupAt, loaded: true };
    this.emit('friends-count', r.friends.length);
    this.emit('change');
    for (const item of r.inbox) this.deliver(item);
    if (r.room) this.emit('room', { room: r.room });
    return r;
  }
  deliver(item) {
    if (this.handled.has(item.id)) return;
    this.handled.add(item.id);
    this.emit('inbox', item);
  }
  ack(ids) {
    this.data.inbox = this.data.inbox.filter(i => !ids.includes(i.id));
    this.emit('change');
    return this.api('POST', '/api/inbox/ack', { ids }).catch(() => {});
  }

  async connect() {
    if (!this.account || !this.base) return;
    clearTimeout(this.retryTimer);
    this.closeSocket();
    try {
      await this.refresh();
      const { ticket } = await this.api('POST', '/api/live/ticket');
      if (!this.account) return;
      const ws = new this.WS(this.base.replace(/^http/, 'ws') + '/api/live?ticket=' + ticket);
      this.ws = ws;
      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.attempt = 0;
        this.setStatus('live');
        this.pingTimer = setInterval(() => this.ping(), 25000);
        this.syncSessions().catch(() => {});
      };
      ws.onmessage = event => { if (this.ws === ws) this.onMessage(event.data); };
      ws.onclose = () => { if (this.ws === ws) { this.closeSocket(); if (this.account) { this.setStatus('offline'); this.retry(); } } };
      ws.onerror = () => { try { ws.close(); } catch { /* closed */ } };
    } catch (error) {
      if (!this.account) return;
      this.setStatus('offline');
      this.retry();
    }
  }
  ping() {
    if (!this.ws || this.ws.readyState !== 1) return;
    try { this.ws.send('ping'); } catch { /* closing */ }
    clearTimeout(this.pongTimer);
    this.pongTimer = setTimeout(() => { try { this.ws?.close(); } catch { /* closed */ } }, 8000);
  }
  retry() {
    clearTimeout(this.retryTimer);
    const delay = Math.min(30000, 1000 * 2 ** this.attempt++) + Math.random() * 500;
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }
  /** Try again now: the phone came back online or the app came back to the front. */
  wake() { if (this.account && this.base && this.status !== 'live') { this.attempt = 0; this.connect(); } }
  closeSocket() {
    clearInterval(this.pingTimer); clearTimeout(this.pongTimer);
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onclose = null; try { ws.close(); } catch { /* closed */ } }
  }
  disconnect() { clearTimeout(this.retryTimer); this.closeSocket(); }

  onMessage(text) {
    if (text === 'pong') { clearTimeout(this.pongTimer); return; }
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (m.t === 'hello') { this.offset = m.now - this.now(); return; }
    if (m.t === 'presence') {
      const friend = this.data.friends.find(f => f.id === m.id);
      if (!friend) return;
      const wasFocusing = Boolean(friend.focusing);
      if ('online' in m) friend.online = m.online;
      if ('focusing' in m) friend.focusing = m.focusing;
      if (m.last) friend.last = m.last;
      if (m.add && m.start >= startOfDay(this.now())) friend.today += m.add;
      this.emit('change');
      if (!wasFocusing && friend.focusing) this.emit('friend-focus', friend);
      return;
    }
    if (m.t === 'friends') { this.refresh().catch(() => {}); return; }
    if (m.t === 'request') { this.refresh().catch(() => {}); this.emit('toast', `${m.from.name} wants to be friends.`); return; }
    if (m.t === 'accepted') { this.refresh().catch(() => {}); this.emit('toast', `${m.by.name} accepted your request.`); return; }
    if (m.t === 'inbox') { this.data.inbox.push(m.item); this.deliver(m.item); return; }
    if (m.t === 'room') { this.data.room = m.room && ['lobby', 'running'].includes(m.room.state) ? m.room : null; this.emit('room', { room: m.room, by: m.by || null }); this.emit('change'); return; }
    if (m.t === 'feed') { if (this.data.feed) this.data.feed.unshift(m.item); this.emit('change'); }
  }

  // ——— Friends ———

  find(q) { return this.api('GET', '/api/find?q=' + encodeURIComponent(q)); }
  async request(id) { const r = await this.api('POST', '/api/friends/request', { id }); await this.refresh().catch(() => {}); return r; }
  async respond(id, accept) { const r = await this.api('POST', '/api/friends/respond', { id, accept }); await this.refresh().catch(() => {}); return r; }
  async cancel(id) { await this.api('POST', '/api/friends/cancel', { id }); await this.refresh().catch(() => {}); }
  async remove(id) { await this.api('POST', '/api/friends/remove', { id }); await this.refresh().catch(() => {}); }
  async block(id) { await this.api('POST', '/api/friends/block', { id }); await this.refresh().catch(() => {}); }
  friendPage(id) { const now = this.now(); return this.api('GET', `/api/friends/${id}?since=${startOfDay(now)}&week=${startOfWeek(now)}`); }
  async board(period) {
    const now = this.now();
    const since = { today: startOfDay(now), week: startOfWeek(now), month: startOfMonth(now), all: 0 }[period] ?? 0;
    return (await this.api('GET', '/api/board?since=' + since)).board;
  }
  async feed() { this.data.feed = (await this.api('GET', '/api/feed')).feed; this.emit('change'); return this.data.feed; }
  cheer(to, kind = 'cheer') { return this.api('POST', '/api/cheer', { to, kind }); }
  gift(to, species) { return this.api('POST', '/api/gift', { to, species }); }

  // ——— Sessions ———

  /** Tell friends a session has begun. The server's clock then vouches for it when it ends. */
  async sessionStarted(active) {
    if (!this.account || !this.base || active.room) return false;
    try { await this.api('POST', '/api/session/start', { id: active.id, planned: active.planned, species: active.species }); return true; } catch { return false; }
  }
  /** Report the end of a session. Resolves the server's answer, or null when it could not be reached. */
  async sessionEnded(id, status) {
    if (!this.account || !this.base) return null;
    try { return await this.api('POST', '/api/session/end', { id, status }); } catch (error) { return error.code === 'offline' ? null : { status: 'refused', code: error.code }; }
  }
  /** Send sessions the server has not counted yet: ones finished offline or before signing in. */
  async syncSessions() {
    if (!this.account || !this.base) return;
    const cutoff = this.now() - 6.5 * 86400000;
    const waiting = this.store.state.sessions.filter(s => s.status === 'done' && !s.synced && s.start > cutoff);
    const done = [];
    for (const s of waiting) {
      try { await this.api('POST', '/api/session/log', { id: s.id, start: s.start + this.offset, minutes: s.minutes, species: s.species }); done.push(s.id); }
      catch (error) { if (error.code === 'offline' || error.code === 429) break; if (error.code === 409 || error.code === 400) done.push(s.id); }
    }
    if (done.length) { this.store.markSynced(done); this.pushCard(); }
  }

  // ——— Focusing together ———

  async roomCreate(minutes, rule, species) { const r = await this.api('POST', '/api/rooms', { minutes, rule, species }); this.setRoom(r.room); return r.room; }
  async roomJoin(code, species) { const r = await this.api('POST', '/api/rooms/join', { code, species }); this.setRoom(r.room); return r.room; }
  async roomLeave() { const room = this.data.room; if (!room) return; this.setRoom(null); await this.api('POST', '/api/rooms/leave', { code: room.code }).catch(() => {}); }
  roomInvite(to) { return this.api('POST', '/api/rooms/invite', { code: this.data.room.code, to }); }
  async roomStart() { const r = await this.api('POST', '/api/rooms/start', { code: this.data.room.code }); this.setRoom(r.room); return r.room; }
  roomSpecies(species) { return this.data.room ? this.api('POST', '/api/rooms/species', { code: this.data.room.code, species }).catch(() => {}) : Promise.resolve(); }
  setRoom(room) { this.data.room = room && ['lobby', 'running'].includes(room.state) ? room : null; this.emit('change'); }
  /** The id the server gave my session in a room. */
  roomSessionId(room) { return room.code.toLowerCase() + this.account.id; }
}
