// The app's side of accounts and friends: who is signed in on this device, calls to the friends server, and the live
// connection that brings requests, presence, rooms, cheers and gifts as they happen.
import { startOfDay, startOfWeek, startOfMonth } from './core.js';
import { mergeStates } from './store.js';
import { threeWay, comparable } from './sync.js';

export const SITE = 'https://shira421.github.io/haven/';
const ACCOUNT_KEY = 'haven-account';
const OWNER_KEY = 'haven-owner'; // whose haven is on this device, kept after signing out
const VERIFIER_KEY = 'haven-google-secret'; // kept between leaving for Google and coming back
const SYNC_KEY = 'haven-sync'; // {user, rev, base}: the last copy of the haven this device agreed on with the server

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
    const res = await fetchImpl(SITE + 'config.json', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
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
    this.features = { google: false }; // what the server offers, asked at start
    this.reset();
  }

  reset() { this.data = { friends: [], incoming: [], outgoing: [], inbox: [], room: null, today: 0, backupAt: null, feed: null, loaded: false, sanctuaries: null }; }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, payload) { for (const fn of this.listeners) fn(type, payload); }
  setStatus(status) { if (this.status !== status) { this.status = status; this.emit('status', status); } }
  get signedIn() { return Boolean(this.account); }
  /** The server's idea of now, for anything timed together with friends. */
  serverNow() { return this.now() + this.offset; }

  // ——— Calls ———

  async api(method, path, body) {
    if (!this.base) throw new SocialError('no-server', 'This copy of Haven has no server to sign in to yet.');
    let res;
    try {
      res = await this.fetch(this.base + path, {
        method,
        headers: { ...(this.account ? { Authorization: 'Bearer ' + this.account.token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new SocialError('offline', 'Cannot reach Haven. Check your connection and try again.');
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
    // `hasPassword` is unknown (undefined) for an account saved by Haven before 1.4, until the server says.
    this.account = { id: user.id, name: user.name, handle: user.handle, code: user.code, avatar: user.avatar, hasPassword: user.hasPassword ?? this.account?.hasPassword, google: user.google ?? this.account?.google ?? false, token: token || this.account?.token };
    try { this.storage.setItem(ACCOUNT_KEY, JSON.stringify(this.account)); this.storage.setItem(OWNER_KEY, user.id); } catch { /* storage closed */ }
  }
  /** An account made before passwords, which must choose one before going on. */
  get needsPassword() { return Boolean(this.account && this.account.hasPassword === false && !this.account.google); }
  /** Ask the server what it offers. Quietly keeps the last answer when it cannot be reached. */
  async discoverFeatures() {
    if (!this.base) return this.features;
    try { const r = await this.fetch(this.base + '/health', { signal: AbortSignal.timeout(6000) }); const j = await r.json(); this.features = { google: Boolean(j.google) }; } catch { /* offline */ }
    return this.features;
  }
  forget() {
    this.account = null;
    // The last copy agreed with the server is kept: signing in again as the same person then joins
    // what changed meanwhile instead of starting over. It is ignored for anyone else.
    try { this.storage.removeItem(ACCOUNT_KEY); } catch { /* storage closed */ }
    this.disconnect();
    this.reset();
    this.setStatus('signed-out');
    this.emit('change');
  }
  /**
   * This device now belongs to `user`. If someone else's haven is still on it (they were signed
   * out without their changes being saved), it is put aside so the two are never joined.
   */
  enter(user, token) {
    let owner = null;
    try { owner = this.storage.getItem(OWNER_KEY); } catch { /* storage closed */ }
    if (owner && owner !== user.id) this.store.reset();
    this.saveAccount(user, token);
    this.setStatus('connecting');
  }
  async register(name, handle, password, avatar) {
    const r = await this.api('POST', '/api/register', { name, handle, password, avatar });
    this.enter(r.user, r.token);
    this.pushCard(0);
    await this.connect();
    return r.user;
  }
  /** Sign in with the username and password, and bring the account's haven to this device. */
  async login(handle, password) {
    const r = await this.api('POST', '/api/login', { handle, password });
    this.enter(r.user, r.token);
    await this.sync().catch(() => {});
    await this.connect();
    return r.user;
  }
  /** Set the password of an account that has none, or change it (which signs other devices out). */
  async setPassword(password, current) {
    const r = await this.api('POST', '/api/password', { password, ...(current === undefined ? {} : { current }) });
    this.saveAccount(r.me);
    this.emit('change');
  }
  /**
   * The address that starts signing in with Google. `back` is where Google returns to. A secret is
   * kept on this device and only its hash is sent, so the one-time code that comes back is of no
   * use to anything else that might see it.
   */
  async googleUrl(back, link = null) {
    let challenge = '';
    try {
      const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))), b => b.toString(16).padStart(2, '0')).join('');
      this.storage.setItem(VERIFIER_KEY, secret);
      challenge = '&challenge=' + hash;
    } catch { try { this.storage.removeItem(VERIFIER_KEY); } catch { /* storage closed */ } }
    return `${this.base}/auth/google/start?return=${encodeURIComponent(back)}${link ? `&link=${link}` : ''}${challenge}`;
  }
  /** Finish signing in with Google. Resolves the user, or {needsProfile, name} for someone new who must pick a username. */
  async googleClaim(code, profile = null) {
    let verifier;
    try { verifier = this.storage.getItem(VERIFIER_KEY) || undefined; } catch { /* storage closed */ }
    const r = await this.api('POST', '/api/google/claim', { code, verifier, ...(profile || {}) });
    if (r.needsProfile) return r;
    try { this.storage.removeItem(VERIFIER_KEY); } catch { /* storage closed */ }
    this.enter(r.user, r.token);
    if (profile) this.pushCard(0);
    await this.sync().catch(() => {});
    await this.connect();
    return r.user;
  }
  async googleLinkCode() { return (await this.api('POST', '/api/google/link')).code; }
  async googleUnlink() { const r = await this.api('POST', '/api/google/unlink'); this.saveAccount(r.me); this.emit('change'); }
  async rename(name, avatar) {
    const r = await this.api('POST', '/api/profile', { name, avatar });
    this.saveAccount(r.me);
    this.emit('change');
  }
  /** Sign out. The haven on this device is cleared: it lives in the account. */
  async signOut() {
    try { await this.api('POST', '/api/logout'); } catch { /* signing out locally anyway */ }
    this.forget();
    this.leave();
  }
  async deleteAccount() { await this.api('POST', '/api/account/delete'); this.forget(); this.leave(); }
  leave() { try { this.storage.removeItem(OWNER_KEY); this.storage.removeItem(SYNC_KEY); } catch { /* storage closed */ } this.store.reset(); }

  /** Send the public card (level, totals, haven layout) soon after it changes. */
  pushCard(delay = 4000) {
    if (!this.account || !this.base) return;
    clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(() => { this.api('POST', '/api/profile', { card: this.store.publicCard() }).catch(() => {}); }, delay);
  }
  /** Share a change with the account's other devices soon after it is made. */
  scheduleBackup(delay = 3000) {
    if (!this.account || !this.base || this.adopting) return;
    clearTimeout(this.backupTimer);
    this.backupTimer = setTimeout(() => { this.sync().catch(() => {}); }, delay);
  }
  backup() { return this.sync(); }

  loadSync() {
    try { const v = JSON.parse(this.storage.getItem(SYNC_KEY) || 'null'); return v && v.user === this.account?.id && Number.isInteger(v.rev) ? v : null; } catch { return null; }
  }
  saveSync(rev, base) {
    try { this.storage.setItem(SYNC_KEY, JSON.stringify({ user: this.account.id, rev, base })); } catch { /* full: the next sync falls back to joining everything */ }
  }

  /**
   * Bring this device and the server to the same haven. Resolves when the server holds it.
   * Only one runs at a time; a call made meanwhile runs once more afterwards.
   */
  sync() {
    if (!this.account || !this.base) return Promise.resolve(null);
    if (this.syncing) { this.syncAgain = true; return this.syncing; }
    this.syncing = (async () => {
      try { let at; do { this.syncAgain = false; at = await this.syncOnce(); } while (this.syncAgain && this.account); return at; }
      finally { this.syncing = null; }
    })();
    return this.syncing;
  }
  async syncOnce() {
    for (let attempt = 0; attempt < 4; attempt++) {
      const remote = await this.api('GET', '/api/state');
      if (!this.account) return null;
      const saved = this.loadSync(), rev = Number.isInteger(remote.rev) ? remote.rev : 0;
      const local = this.store.exportState();
      let next = local;
      // A copy saved by Haven before 1.3 (revision 0) may be an old backup: a device that already
      // has a haven keeps its own rather than bringing back things let go since. A new device takes it.
      const oldBackup = !saved && rev === 0 && (local.items.length || local.sessions.length);
      if (remote.state && !(saved && saved.rev === rev) && !oldBackup) next = saved ? threeWay(saved.base, local, remote.state, this.now()) : mergeStates(local, remote.state, this.now());
      if (comparable(next) !== comparable(local)) {
        this.adopting = true;
        try { this.store.adopt(next); } finally { this.adopting = false; }
        this.emit('synced');
      }
      const mine = this.store.exportState();
      if (remote.state && comparable(mine) === comparable(remote.state)) { this.saveSync(rev, mine); this.data.backupAt = remote.at; return remote.at; }
      try {
        const r = await this.api('PUT', '/api/state', { state: mine, base: rev });
        this.saveSync(r.rev, mine);
        this.data.backupAt = r.at;
        this.emit('change');
        return r.at;
      } catch (error) { if (error.code !== 409) throw error; }
    }
    throw new SocialError('busy', 'Another device is saving at the same time. Try again in a moment.');
  }

  // ——— Live connection ———

  async refresh() {
    const r = await this.api('GET', `/api/me?since=${startOfDay(this.now())}`);
    this.saveAccount(r.me);
    this.data = { ...this.data, friends: r.friends, incoming: r.incoming, outgoing: r.outgoing, inbox: r.inbox, room: this.keepRoom(r.room), today: r.me.today, backupAt: r.me.backupAt, loaded: true };
    this.emit('friends-count', r.friends.length);
    this.emit('change');
    for (const item of r.inbox) this.deliver(item);
    if (this.data.room) this.emit('room', { room: this.data.room });
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
      this.sync().catch(() => {});
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
  wake() {
    if (!this.account || !this.base) return;
    if (this.status !== 'live') { this.attempt = 0; this.connect(); } else this.sync().catch(() => {});
  }
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
    if (m.t === 'friends' || m.t === 'account') { this.refresh().catch(() => {}); return; }
    if (m.t === 'state') { if (m.rev !== this.loadSync()?.rev) this.sync().catch(() => {}); return; }
    if (m.t === 'request') { this.refresh().catch(() => {}); this.emit('news', { kind: 'request', from: m.from }); return; }
    // The acceptance also arrives in the inbox, which is where it is announced.
    if (m.t === 'accepted') { this.refresh().catch(() => {}); return; }
    if (m.t === 'inbox') { this.data.inbox.push(m.item); this.deliver(m.item); return; }
    if (m.t === 'room') { this.data.room = this.keepRoom(m.room); this.emit('room', { room: m.room, by: m.by || null }); this.emit('change'); return; }
    if (m.t === 'feed') { if (this.data.feed) this.data.feed.unshift(m.item); this.emit('change'); return; }
    if (m.t === 'sanctuary') { this.loadSanctuaries().catch(() => {}); this.emit('sanctuary', { id: m.id }); return; }
    if (m.t === 'haven') this.emit('sanctuary', { member: m.id });
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

  // ——— Sanctuaries ———

  async loadSanctuaries() { this.data.sanctuaries = (await this.api('GET', '/api/sanctuaries')).sanctuaries; this.emit('change'); return this.data.sanctuaries; }
  sanctuary(id) { return this.api('GET', `/api/sanctuaries/${id}`).then(r => r.sanctuary); }
  async sanctuaryCreate(name) { const r = await this.api('POST', '/api/sanctuaries', { name }); await this.loadSanctuaries().catch(() => {}); return r.sanctuary; }
  async sanctuaryJoin(code) { const r = await this.api('POST', '/api/sanctuaries/join', { code }); await this.loadSanctuaries().catch(() => {}); return r.sanctuary; }
  sanctuaryInvite(id, to) { return this.api('POST', '/api/sanctuaries/invite', { id, to }); }
  async sanctuaryLeave(id) { await this.api('POST', '/api/sanctuaries/leave', { id }); await this.loadSanctuaries().catch(() => {}); }
  /** Light a campfire for everyone in the sanctuary. */
  async sanctuaryCampfire(id, minutes, rule, species) { const r = await this.api('POST', '/api/sanctuaries/campfire', { id, minutes, rule, species }); this.data.room = r.room; this.emit('change'); return r.room; }
  /** A treat or a pat for an animal in someone else's haven in the sanctuary. */
  sanctuaryCare(id, to, item, species, kind) { return this.api('POST', '/api/sanctuaries/care', { id, to, item, species, kind }); }
  /** Two animals from different havens met: they are friends now. Keys are "owner:item:species". */
  sanctuaryPal(id, a, b) { return this.api('POST', '/api/sanctuaries/pal', { id, a, b }); }
  /** Report someone to whoever runs the server. */
  report(id, reason, place) { return this.api('POST', '/api/report', { id, reason, place }); }
  async sanctuaryEdit(id, patch) { const r = await this.api('POST', '/api/sanctuaries/edit', { id, ...patch }); await this.loadSanctuaries().catch(() => {}); return r.sanctuary; }

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
  setRoom(room) { this.data.room = this.keepRoom(room); this.emit('change'); }
  /** A campfire stays with you while it is open or burning, and once over until you leave it. */
  keepRoom(room) {
    if (!room || !['lobby', 'running', 'done', 'failed'].includes(room.state)) return null;
    return room.members?.find(m => m.id === this.account?.id)?.gone ? null : room;
  }
  /** Open, or burning with you still focusing round it: you cannot start or join another. */
  roomLive() {
    const room = this.data.room, mine = room?.members?.find(m => m.id === this.account?.id);
    return Boolean(room && (room.state === 'lobby' || (room.state === 'running' && mine?.status === 'focusing')));
  }
  /** The id the server gave my session in a room. */
  roomSessionId(room) { return room.code.toLowerCase() + this.account.id; }
}
