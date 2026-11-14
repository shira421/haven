// The rules of Haven's friends server: profiles, friends, live presence, focusing together, cheers and gifts.
// This file knows nothing about Cloudflare. It is given a SQL function, a way to push a message to a
// person's open connections, and a way to ask whether someone is connected; worker.js supplies those.
import { speciesById } from '../src/catalog.js';

export const VERSION = '1.2.0';
const MIN = 60000;
export const RULES = {
  maxFriends: 200,
  maxPending: 50,
  maxRoom: 8,
  maxMinutes: 180,
  minMinutes: 5,
  stopwatchMin: 10,
  early: 30000, // a session may be reported finished this much before the server's clock agrees
  countdown: 5000, // rooms start this long after the host presses Start
  lobbyLife: 2 * 60 * MIN,
  linkLife: 10 * MIN,
  ticketLife: 30000,
  logWindow: 7 * 24 * 60 * MIN, // offline sessions can be reported this long afterwards
  stateBytes: 600000,
  cardBytes: 8000,
};

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = message => new ApiError(400, message);
const gone = message => new ApiError(404, message);

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, handle TEXT NOT NULL UNIQUE, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, avatar TEXT NOT NULL DEFAULT 'rabbit', card TEXT NOT NULL DEFAULT '{}', created INTEGER NOT NULL, seen INTEGER NOT NULL, state TEXT, state_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS tokens(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS tokens_user ON tokens(user_id)`,
  `CREATE TABLE IF NOT EXISTS friends(a TEXT NOT NULL, b TEXT NOT NULL, since INTEGER NOT NULL, PRIMARY KEY(a,b))`,
  `CREATE INDEX IF NOT EXISTS friends_b ON friends(b)`,
  `CREATE TABLE IF NOT EXISTS requests(from_id TEXT NOT NULL, to_id TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(from_id,to_id))`,
  `CREATE INDEX IF NOT EXISTS requests_to ON requests(to_id)`,
  `CREATE TABLE IF NOT EXISTS blocks(user_id TEXT NOT NULL, blocked_id TEXT NOT NULL, PRIMARY KEY(user_id,blocked_id))`,
  `CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, start INTEGER NOT NULL, planned INTEGER NOT NULL, minutes INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, species TEXT NOT NULL, room TEXT, ended INTEGER)`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id, start)`,
  `CREATE INDEX IF NOT EXISTS sessions_status ON sessions(status)`,
  `CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY, host TEXT NOT NULL, minutes INTEGER NOT NULL, rule TEXT NOT NULL, state TEXT NOT NULL, start INTEGER, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS members(room TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL, joined INTEGER NOT NULL, species TEXT NOT NULL DEFAULT 'clover', PRIMARY KEY(room,user_id))`,
  `CREATE INDEX IF NOT EXISTS members_user ON members(user_id)`,
  `CREATE TABLE IF NOT EXISTS inbox(id INTEGER PRIMARY KEY AUTOINCREMENT, to_id TEXT NOT NULL, from_id TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', created INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS inbox_to ON inbox(to_id)`,
  `CREATE TABLE IF NOT EXISTS links(code TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS tickets(ticket TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY, exp INTEGER NOT NULL, n INTEGER NOT NULL)`,
];

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0 or 1
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const RESERVED = new Set(['haven', 'admin', 'support', 'system', 'null', 'undefined', 'anonymous', 'everyone']);

export function randomString(length, alphabet) {
  const out = [];
  const limit = 256 - (256 % alphabet.length); // reject the tail so every character is equally likely
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) if (b < limit && out.length < length) out.push(alphabet[b % alphabet.length]);
  }
  return out.join('');
}
export async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export const cleanCode = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function cleanName(v) {
  // Control characters and invisible direction marks are removed; runs of spaces become one.
  const invisible = /[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g;
  const name = String(v ?? '').replace(invisible, '').replace(/\s+/g, ' ').trim();
  if (!name) throw bad('Enter a name.');
  if ([...name].length > 24) throw bad('Keep the name to 24 characters or fewer.');
  return name;
}
export function cleanHandle(v) {
  const handle = String(v ?? '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(handle)) throw bad('A username is 3 to 20 letters, numbers or underscores.');
  if (RESERVED.has(handle)) throw bad('That username is not available.');
  return handle;
}
const int = (v, lo, hi, message) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw bad(message);
  return n;
};
const pair = (x, y) => (x < y ? [x, y] : [y, x]);
const publicUser = u => ({ id: u.id, name: u.name, handle: u.handle, avatar: u.avatar });
const parse = (text, fallback) => { try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : fallback; } catch { return fallback; } };

export class Hub {
  /**
   * @param {object} io
   * @param {(query: string, ...params: any[]) => any[]} io.sql
   * @param {(userId: string, message: object) => void} io.push
   * @param {(userId: string) => boolean} io.online
   * @param {(fn: () => any) => any} [io.tx]
   */
  constructor({ sql, push, online, tx = fn => fn() }) {
    this.sql = sql;
    this.push = push;
    this.online = online;
    this.tx = tx; // runs a function as one database transaction
    for (const statement of SCHEMA) sql(statement);
  }

  one(query, ...params) { return this.sql(query, ...params)[0] || null; }

  // ——— Small helpers ———

  /** Allow `max` uses of `key` in the `seconds` after its first use. */
  limit(key, max, seconds, now, message = 'Too many tries. Wait a little and try again.') {
    const row = this.one('SELECT exp, n FROM limits WHERE key=?', key);
    if (!row || row.exp <= now) { this.sql('INSERT INTO limits(key,exp,n) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET exp=excluded.exp, n=1', key, now + seconds * 1000); return; }
    if (row.n >= max) throw new ApiError(429, message);
    this.sql('UPDATE limits SET n=n+1 WHERE key=?', key);
  }
  user(id) { return typeof id === 'string' ? this.one('SELECT * FROM users WHERE id=?', id) : null; }
  areFriends(x, y) { const [a, b] = pair(x, y); return Boolean(this.one('SELECT 1 AS ok FROM friends WHERE a=? AND b=?', a, b)); }
  blockedEitherWay(x, y) { return Boolean(this.one('SELECT 1 AS ok FROM blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)', x, y, y, x)); }
  friendIds(id) { return this.sql('SELECT CASE WHEN a=? THEN b ELSE a END AS id FROM friends WHERE a=? OR b=?', id, id, id).map(r => r.id); }
  requireFriend(me, id, action) {
    const other = this.user(id);
    if (!other || !this.areFriends(me.id, other.id)) throw new ApiError(403, `You can only ${action} a friend.`);
    return other;
  }
  pushFriends(id, message) { for (const friend of this.friendIds(id)) this.push(friend, message); }

  /** What a session row means for presence right now. */
  focusing(row, now) {
    if (!row || row.status !== 'active') return null;
    const until = row.planned ? row.start + row.planned * MIN : null;
    const stale = row.planned ? now > until + 2 * MIN : now > row.start + (RULES.maxMinutes + 2) * MIN;
    if (stale) return null;
    return { start: row.start, until, minutes: row.planned, species: row.species, room: row.room || null };
  }
  activeSession(userId) { return this.one("SELECT * FROM sessions WHERE user_id=? AND status='active' ORDER BY start DESC LIMIT 1", userId); }

  friendList(me, since, now) {
    const rows = this.sql(
      `SELECT u.id, u.name, u.handle, u.avatar, u.seen, u.card,
        (SELECT COALESCE(SUM(minutes),0) FROM sessions s WHERE s.user_id=u.id AND s.status='done' AND s.start>=?) AS today,
        (SELECT MAX(ended) FROM sessions s WHERE s.user_id=u.id AND s.status='done') AS last
       FROM friends f JOIN users u ON u.id = CASE WHEN f.a=? THEN f.b ELSE f.a END
       WHERE f.a=? OR f.b=?`, since, me.id, me.id, me.id);
    const active = new Map(this.sql(
      `SELECT * FROM sessions WHERE status='active' AND user_id IN (SELECT CASE WHEN a=? THEN b ELSE a END FROM friends WHERE a=? OR b=?) ORDER BY start`, me.id, me.id, me.id).map(s => [s.user_id, s]));
    return rows.map(u => {
      const card = parse(u.card, {});
      return { ...publicUser(u), online: this.online(u.id), focusing: this.focusing(active.get(u.id), now), today: u.today, last: u.last || null, level: Number(card.level) || 1, streak: Number(card.streak) || 0 };
    }).sort((x, y) => (y.focusing ? 2 : y.online ? 1 : 0) - (x.focusing ? 2 : x.online ? 1 : 0) || y.today - x.today || x.name.localeCompare(y.name));
  }

  inboxFor(me) {
    return this.sql('SELECT i.id, i.kind, i.data, i.created, u.id AS uid, u.name, u.handle, u.avatar FROM inbox i JOIN users u ON u.id=i.from_id WHERE i.to_id=? ORDER BY i.id LIMIT 50', me.id)
      .map(r => ({ id: r.id, kind: r.kind, data: parse(r.data, {}), created: r.created, from: { id: r.uid, name: r.name, handle: r.handle, avatar: r.avatar } }));
  }
  deliver(to, from, kind, data, now) {
    const row = this.one('INSERT INTO inbox(to_id,from_id,kind,data,created) VALUES(?,?,?,?,?) RETURNING id', to.id, from.id, kind, JSON.stringify(data), now);
    this.push(to.id, { t: 'inbox', item: { id: row.id, kind, data, created: now, from: publicUser(from) } });
  }

  // ——— Rooms ———

  roomView(code, now) {
    const room = this.one('SELECT * FROM rooms WHERE code=?', code);
    if (!room) return null;
    if (room.state === 'lobby' && now - room.created > RULES.lobbyLife) { this.sql("UPDATE rooms SET state='closed' WHERE code=?", code); room.state = 'closed'; }
    const members = this.sql('SELECT m.status, m.joined, m.species, u.id, u.name, u.handle, u.avatar FROM members m JOIN users u ON u.id=m.user_id WHERE m.room=? ORDER BY m.joined, m.rowid', code)
      .map(m => ({ id: m.id, name: m.name, handle: m.handle, avatar: m.avatar, status: m.status, species: m.species }));
    return { code: room.code, host: room.host, minutes: room.minutes, rule: room.rule, state: room.state, start: room.start, members, now };
  }
  pushRoom(code, now, extra = {}) {
    const room = this.roomView(code, now);
    if (room) for (const m of room.members) this.push(m.id, { t: 'room', room, ...extra });
    return room;
  }
  /** The room this person is in, if it is still open or running. */
  currentRoom(userId, now) {
    const row = this.one("SELECT r.code FROM members m JOIN rooms r ON r.code=m.room WHERE m.user_id=? AND r.state IN ('lobby','running') AND m.status IN ('joined','focusing') ORDER BY m.joined DESC LIMIT 1", userId);
    if (!row) return null;
    const room = this.roomView(row.code, now);
    if (room.state === 'running' && now > room.start + (room.minutes + 5) * MIN) { this.settleRoom(room.code, now); return null; }
    return room.state === 'lobby' || room.state === 'running' ? room : null;
  }
  /** Close a running room once nobody is still focusing in it, or its time is long past. */
  settleRoom(code, now) {
    const room = this.one('SELECT * FROM rooms WHERE code=?', code);
    if (!room || room.state !== 'running') return;
    const left = this.one("SELECT COUNT(*) AS n FROM members WHERE room=? AND status='focusing'", code).n;
    if (left === 0 || now > room.start + (room.minutes + 5) * MIN) this.sql("UPDATE rooms SET state='done' WHERE code=?", code);
  }
  leaveLobbies(me, now, except = null) {
    for (const row of this.sql("SELECT r.code, r.host FROM members m JOIN rooms r ON r.code=m.room WHERE m.user_id=? AND r.state='lobby'", me.id)) {
      if (row.code === except) continue;
      this.sql('DELETE FROM members WHERE room=? AND user_id=?', row.code, me.id);
      if (row.host === me.id) this.sql("UPDATE rooms SET state='closed' WHERE code=?", row.code);
      this.pushRoom(row.code, now);
      if (row.host === me.id) this.sql('DELETE FROM members WHERE room=?', row.code);
    }
  }

  // ——— Sessions ———

  /** Mark a session finished or failed, tell friends, and return what it earned. */
  closeSession(me, row, status, minutes, now) {
    this.sql('UPDATE sessions SET status=?, minutes=?, ended=? WHERE id=?', status, minutes, now, row.id);
    this.pushFriends(me.id, { t: 'presence', id: me.id, focusing: null, ...(status === 'done' ? { last: now, add: minutes, start: row.start } : {}) });
    if (status === 'done') this.pushFriends(me.id, { t: 'feed', item: { id: row.id, user: publicUser(me), species: row.species, minutes, start: row.start, room: row.room || null } });
  }

  // ——— Routes ———

  /** Create a profile. No password and no email: the device keeps a secret token. */
  register(body, ctx) {
    this.limit('reg:' + ctx.ip, 5, 3600, ctx.now, 'Too many new profiles from this network. Try again in an hour.');
    const name = cleanName(body.name), handle = cleanHandle(body.handle);
    if (this.one('SELECT 1 AS ok FROM users WHERE handle=?', handle)) throw new ApiError(409, 'That username is taken. Try another.');
    const avatar = speciesById(body.avatar) ? body.avatar : 'rabbit';
    let id, code;
    do { id = randomString(12, ID_ALPHABET); } while (this.user(id));
    do { code = randomString(8, CODE_ALPHABET); } while (this.one('SELECT 1 AS ok FROM users WHERE code=?', code));
    this.sql('INSERT INTO users(id,handle,name,code,avatar,created,seen) VALUES(?,?,?,?,?,?,?)', id, handle, name, code, avatar, ctx.now, ctx.now);
    this.sql('INSERT INTO tokens(hash,user_id,created) VALUES(?,?,?)', ctx.newTokenHash, id, ctx.now);
    return { user: { id, name, handle, code, avatar }, token: ctx.newToken };
  }

  me(me, query, ctx) {
    const since = Number(query.since) || 0;
    const incoming = this.sql('SELECT u.id,u.name,u.handle,u.avatar,r.created FROM requests r JOIN users u ON u.id=r.from_id WHERE r.to_id=? ORDER BY r.created DESC', me.id).map(u => ({ ...publicUser(u), created: u.created }));
    const outgoing = this.sql('SELECT u.id,u.name,u.handle,u.avatar,r.created FROM requests r JOIN users u ON u.id=r.to_id WHERE r.from_id=? ORDER BY r.created DESC', me.id).map(u => ({ ...publicUser(u), created: u.created }));
    const mine = this.one("SELECT COALESCE(SUM(minutes),0) AS today FROM sessions WHERE user_id=? AND status='done' AND start>=?", me.id, since);
    return {
      me: { id: me.id, name: me.name, handle: me.handle, code: me.code, avatar: me.avatar, today: mine.today, backupAt: me.state_at || null },
      friends: this.friendList(me, since, ctx.now), incoming, outgoing, inbox: this.inboxFor(me), room: this.currentRoom(me.id, ctx.now), now: ctx.now,
    };
  }

  profile(me, body, ctx) {
    const name = body.name === undefined ? me.name : cleanName(body.name);
    const avatar = body.avatar === undefined ? me.avatar : speciesById(body.avatar) ? body.avatar : me.avatar;
    let card = me.card;
    if (body.card !== undefined) {
      if (!body.card || typeof body.card !== 'object' || Array.isArray(body.card)) throw bad('The haven could not be saved.');
      card = JSON.stringify(body.card);
      if (card.length > RULES.cardBytes) throw bad('The haven is too large to share.');
    }
    this.sql('UPDATE users SET name=?, avatar=?, card=? WHERE id=?', name, avatar, card, me.id);
    if (name !== me.name || avatar !== me.avatar) this.pushFriends(me.id, { t: 'friends' });
    return { me: { id: me.id, name, handle: me.handle, code: me.code, avatar } };
  }

  /** Look someone up by friend code or exact username. There is no directory to browse. */
  find(me, query, ctx) {
    this.limit('find:' + me.id, 60, 3600, ctx.now);
    const q = String(query.q || '').trim();
    if (!q) throw bad('Enter a friend code or a username.');
    const code = cleanCode(q);
    let other = code.length === 8 ? this.one('SELECT * FROM users WHERE code=?', code) : null;
    if (!other && /^@?[A-Za-z0-9_]{3,20}$/.test(q)) other = this.one('SELECT * FROM users WHERE handle=?', q.replace(/^@/, '').toLowerCase());
    if (!other || this.blockedEitherWay(me.id, other.id)) throw gone('No one has that code or username. Check it and try again.');
    const relation = other.id === me.id ? 'self' : this.areFriends(me.id, other.id) ? 'friend'
      : this.one('SELECT 1 AS ok FROM requests WHERE from_id=? AND to_id=?', me.id, other.id) ? 'outgoing'
      : this.one('SELECT 1 AS ok FROM requests WHERE from_id=? AND to_id=?', other.id, me.id) ? 'incoming' : 'none';
    return { user: publicUser(other), relation };
  }

  befriend(x, y, now) {
    const [a, b] = pair(x.id, y.id);
    this.sql('INSERT OR IGNORE INTO friends(a,b,since) VALUES(?,?,?)', a, b, now);
    this.sql('DELETE FROM requests WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)', x.id, y.id, y.id, x.id);
  }

  friendRequest(me, body, ctx) {
    this.limit('req:' + me.id, 30, 3600, ctx.now, 'You have sent a lot of requests. Try again in an hour.');
    const other = this.user(body.id);
    if (!other || this.blockedEitherWay(me.id, other.id)) throw gone('That person could not be found.');
    if (other.id === me.id) throw bad('That is your own code.');
    if (this.areFriends(me.id, other.id)) return { status: 'friends', user: publicUser(other) };
    const count = id => this.friendIds(id).length;
    if (count(me.id) >= RULES.maxFriends) throw bad(`You can have up to ${RULES.maxFriends} friends.`);
    if (this.one('SELECT 1 AS ok FROM requests WHERE from_id=? AND to_id=?', other.id, me.id)) {
      // They already asked: this is an acceptance.
      if (count(other.id) >= RULES.maxFriends) throw bad(`${other.name} has the most friends Haven allows.`);
      this.befriend(me, other, ctx.now);
      this.push(other.id, { t: 'accepted', by: publicUser(me) });
      this.push(me.id, { t: 'friends' });
      return { status: 'friends', user: publicUser(other) };
    }
    if (this.one('SELECT COUNT(*) AS n FROM requests WHERE from_id=?', me.id).n >= RULES.maxPending) throw bad('You have too many requests waiting. Cancel some first.');
    const fresh = this.sql('INSERT OR IGNORE INTO requests(from_id,to_id,created) VALUES(?,?,?) RETURNING created', me.id, other.id, ctx.now).length > 0;
    if (fresh) this.push(other.id, { t: 'request', from: publicUser(me) });
    return { status: 'requested', user: publicUser(other) };
  }

  friendRespond(me, body, ctx) {
    const other = this.user(body.id);
    if (!other || !this.one('SELECT 1 AS ok FROM requests WHERE from_id=? AND to_id=?', other.id, me.id)) throw gone('That request is no longer there.');
    if (body.accept) {
      if (this.friendIds(me.id).length >= RULES.maxFriends) throw bad(`You can have up to ${RULES.maxFriends} friends.`);
      this.befriend(me, other, ctx.now);
      this.push(other.id, { t: 'accepted', by: publicUser(me) });
    } else {
      this.sql('DELETE FROM requests WHERE from_id=? AND to_id=?', other.id, me.id);
    }
    this.push(me.id, { t: 'friends' });
    return { status: body.accept ? 'friends' : 'declined' };
  }

  friendCancel(me, body) {
    this.sql('DELETE FROM requests WHERE from_id=? AND to_id=?', me.id, String(body.id));
    this.push(String(body.id), { t: 'friends' });
    return { status: 'cancelled' };
  }

  friendRemove(me, body) {
    const [a, b] = pair(me.id, String(body.id));
    this.sql('DELETE FROM friends WHERE a=? AND b=?', a, b);
    this.push(String(body.id), { t: 'friends' });
    return { status: 'removed' };
  }

  block(me, body) {
    const other = this.user(body.id);
    if (!other || other.id === me.id) throw gone('That person could not be found.');
    const [a, b] = pair(me.id, other.id);
    this.sql('INSERT OR IGNORE INTO blocks(user_id,blocked_id) VALUES(?,?)', me.id, other.id);
    this.sql('DELETE FROM friends WHERE a=? AND b=?', a, b);
    this.sql('DELETE FROM requests WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)', me.id, other.id, other.id, me.id);
    this.sql('DELETE FROM inbox WHERE to_id=? AND from_id=?', me.id, other.id);
    this.push(other.id, { t: 'friends' });
    return { status: 'blocked' };
  }
  unblock(me, body) { this.sql('DELETE FROM blocks WHERE user_id=? AND blocked_id=?', me.id, String(body.id)); return { status: 'unblocked' }; }
  blocks(me) { return { blocked: this.sql('SELECT u.id,u.name,u.handle,u.avatar FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.user_id=?', me.id).map(publicUser) }; }

  /** A friend's page: their haven and their numbers. */
  friendPage(me, id, query, ctx) {
    const other = id === me.id ? me : this.requireFriend(me, id, 'visit');
    const since = Number(query.since) || 0, week = Number(query.week) || 0;
    const sum = from => this.one("SELECT COALESCE(SUM(minutes),0) AS m, COUNT(*) AS n FROM sessions WHERE user_id=? AND status='done' AND start>=?", other.id, from);
    const all = sum(0);
    const recent = this.sql("SELECT species, minutes, start FROM sessions WHERE user_id=? AND status='done' ORDER BY start DESC LIMIT 8", other.id);
    return {
      user: publicUser(other), card: parse(other.card, {}), online: this.online(other.id), focusing: this.focusing(this.activeSession(other.id), ctx.now),
      stats: { today: sum(since).m, week: sum(week).m, total: all.m, sessions: all.n }, recent, friendsSince: other.id === me.id ? null : this.one('SELECT since FROM friends WHERE a=? AND b=?', ...pair(me.id, other.id))?.since || null,
    };
  }

  board(me, query) {
    const since = Number(query.since) || 0;
    const ids = [me.id, ...this.friendIds(me.id)];
    const rows = this.sql(
      `SELECT u.id,u.name,u.handle,u.avatar, COALESCE(SUM(s.minutes),0) AS minutes, COUNT(s.id) AS sessions
       FROM users u LEFT JOIN sessions s ON s.user_id=u.id AND s.status='done' AND s.start>=?
       WHERE u.id IN (${ids.map(() => '?').join(',')}) GROUP BY u.id ORDER BY minutes DESC, u.name`, since, ...ids);
    return { board: rows.map(r => ({ ...publicUser(r), minutes: r.minutes, sessions: r.sessions, me: r.id === me.id })) };
  }

  feed(me, query, ctx) {
    const ids = [me.id, ...this.friendIds(me.id)];
    const rows = this.sql(
      `SELECT s.id, s.species, s.minutes, s.start, s.room, u.id AS uid, u.name, u.handle, u.avatar FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.status='done' AND s.start>=? AND s.user_id IN (${ids.map(() => '?').join(',')}) ORDER BY s.start DESC LIMIT 40`, ctx.now - 14 * 24 * 60 * MIN, ...ids);
    return { feed: rows.map(r => ({ id: r.id, user: { id: r.uid, name: r.name, handle: r.handle, avatar: r.avatar }, species: r.species, minutes: r.minutes, start: r.start, room: r.room || null })) };
  }

  sessionStart(me, body, ctx) {
    this.limit('start:' + me.id, 120, 3600, ctx.now);
    const id = String(body.id || '');
    if (!/^[a-z0-9]{6,40}$/.test(id)) throw bad('The session could not be started.');
    const planned = body.planned ? int(body.planned, 1, RULES.maxMinutes, 'Choose a length up to 180 min.') : 0;
    const species = speciesById(body.species) ? body.species : 'clover';
    this.sql("UPDATE sessions SET status='abandoned', ended=? WHERE user_id=? AND status='active' AND room IS NULL", ctx.now, me.id);
    if (this.one('SELECT 1 AS ok FROM sessions WHERE id=?', id)) throw new ApiError(409, 'That session already exists.');
    this.sql("INSERT INTO sessions(id,user_id,start,planned,status,species) VALUES(?,?,?,?,'active',?)", id, me.id, ctx.now, planned, species);
    const focusing = this.focusing({ status: 'active', start: ctx.now, planned, species }, ctx.now);
    this.pushFriends(me.id, { t: 'presence', id: me.id, focusing });
    return { start: ctx.now, now: ctx.now };
  }

  /** Finish or give up the running session. The server's own clock decides whether the time was served. */
  sessionEnd(me, body, ctx) {
    const row = this.one('SELECT * FROM sessions WHERE id=? AND user_id=?', String(body.id || ''), me.id);
    if (!row) throw gone('That session is not on the server.');
    if (row.status !== 'active') return { status: row.status, minutes: row.minutes, others: 0 };
    const want = body.status === 'done' ? 'done' : 'failed';
    const elapsed = ctx.now - row.start;
    let status = want, minutes = 0, others = 0;
    const room = row.room ? this.one('SELECT * FROM rooms WHERE code=?', row.room) : null;
    if (want === 'done') {
      if (room && room.state === 'failed') status = 'failed';
      else if (row.planned) { if (elapsed < row.planned * MIN - RULES.early) throw bad('That session has not finished yet.'); minutes = row.planned; }
      else { minutes = Math.min(RULES.maxMinutes, Math.floor(elapsed / MIN)); if (minutes < RULES.stopwatchMin) status = 'short'; }
    }
    if (status === 'short') { this.sql("UPDATE sessions SET status='short', ended=? WHERE id=?", ctx.now, row.id); this.pushFriends(me.id, { t: 'presence', id: me.id, focusing: null }); return { status, minutes: 0, others: 0 }; }
    this.closeSession(me, row, status, minutes, ctx.now);
    if (room) {
      this.sql('UPDATE members SET status=? WHERE room=? AND user_id=?', status === 'done' ? 'done' : 'left', room.code, me.id);
      if (status === 'done') others = this.one("SELECT COUNT(*) AS n FROM members WHERE room=? AND user_id<>? AND status IN ('done','focusing')", room.code, me.id).n;
      else if (room.state === 'running') this.failRoom(room, me, ctx.now);
      this.settleRoom(room.code, ctx.now);
      this.pushRoom(room.code, ctx.now);
    }
    return { status, minutes, others };
  }

  /** In a "together" room one person leaving ends it for everyone. */
  failRoom(room, who, now) {
    if (room.rule !== 'together') return;
    this.sql("UPDATE rooms SET state='failed' WHERE code=?", room.code);
    for (const row of this.sql("SELECT * FROM sessions WHERE room=? AND status='active'", room.code)) {
      this.sql("UPDATE sessions SET status='failed', ended=? WHERE id=?", now, row.id);
      this.sql("UPDATE members SET status='left' WHERE room=? AND user_id=? AND status='focusing'", room.code, row.user_id);
      this.pushFriends(row.user_id, { t: 'presence', id: row.user_id, focusing: null });
    }
    this.pushRoom(room.code, now, { by: publicUser(who) });
  }

  /** Report a session that ran while the phone was offline. */
  sessionLog(me, body, ctx) {
    this.limit('log:' + me.id, 60, 86400, ctx.now);
    const id = String(body.id || '');
    if (!/^[a-z0-9]{6,40}$/.test(id)) throw bad('That session could not be saved.');
    const existing = this.one('SELECT * FROM sessions WHERE id=?', id);
    if (existing) {
      if (existing.user_id !== me.id) throw bad('That session could not be saved.');
      if (existing.status === 'active') return this.sessionEnd(me, { id, status: 'done' }, ctx);
      return { status: existing.status, minutes: existing.minutes };
    }
    const minutes = int(body.minutes, 1, RULES.maxMinutes, 'That session could not be saved.');
    const start = Number(body.start);
    if (!Number.isFinite(start) || start < ctx.now - RULES.logWindow) throw bad('That session is too old to add.');
    if (start + minutes * MIN > ctx.now + MIN) throw bad('That session has not finished yet.');
    const overlap = this.one("SELECT 1 AS ok FROM sessions WHERE user_id=? AND status='done' AND start < ? AND start + minutes*60000 > ?", me.id, start + minutes * MIN, start);
    if (overlap) throw new ApiError(409, 'That time is already covered by another session.');
    const species = speciesById(body.species) ? body.species : 'clover';
    this.sql("INSERT INTO sessions(id,user_id,start,planned,minutes,status,species,ended) VALUES(?,?,?,?,?,'done',?,?)", id, me.id, start, minutes, minutes, species, start + minutes * MIN);
    this.pushFriends(me.id, { t: 'friends' });
    return { status: 'done', minutes };
  }

  cheer(me, body, ctx) {
    const other = this.requireFriend(me, body.to, 'cheer');
    const kind = body.kind === 'nudge' ? 'nudge' : 'cheer';
    this.limit(`cheer:${me.id}:${other.id}:${kind}`, 1, 60, ctx.now, `You just sent ${other.name} one. Give it a minute.`);
    this.limit('cheers:' + me.id, 60, 3600, ctx.now);
    this.deliver(other, me, kind, {}, ctx.now);
    return { status: 'sent' };
  }

  gift(me, body, ctx) {
    const other = this.requireFriend(me, body.to, 'send a gift to');
    const species = speciesById(body.species);
    if (!species) throw bad('Choose a plant or an animal to send.');
    this.limit('gift:' + me.id, 20, 86400, ctx.now, 'You have sent the most gifts allowed in a day.');
    this.deliver(other, me, 'gift', { species: species.id }, ctx.now);
    return { status: 'sent' };
  }

  inboxAck(me, body) {
    const ids = (Array.isArray(body.ids) ? body.ids : []).filter(Number.isInteger).slice(0, 100);
    for (const id of ids) this.sql('DELETE FROM inbox WHERE id=? AND to_id=?', id, me.id);
    return { status: 'ok' };
  }

  roomCreate(me, body, ctx) {
    this.limit('room:' + me.id, 30, 3600, ctx.now);
    const minutes = int(body.minutes, RULES.minMinutes, RULES.maxMinutes, 'Choose a length from 5 to 180 min.');
    const rule = body.rule === 'gentle' ? 'gentle' : 'together';
    if (this.focusing(this.activeSession(me.id), ctx.now)) throw bad('Finish your current session first.');
    this.leaveLobbies(me, ctx.now);
    let code;
    do { code = randomString(6, CODE_ALPHABET); } while (this.one('SELECT 1 AS ok FROM rooms WHERE code=?', code));
    this.sql("INSERT INTO rooms(code,host,minutes,rule,state,created) VALUES(?,?,?,?,'lobby',?)", code, me.id, minutes, rule, ctx.now);
    this.sql("INSERT INTO members(room,user_id,status,joined,species) VALUES(?,?,'joined',?,?)", code, me.id, ctx.now, speciesById(body.species) ? body.species : 'clover');
    return { room: this.roomView(code, ctx.now) };
  }

  roomJoin(me, body, ctx) {
    this.limit('join:' + me.id, 60, 3600, ctx.now);
    const code = cleanCode(body.code);
    const room = this.roomView(code, ctx.now);
    if (!room || room.state === 'closed' || this.blockedEitherWay(me.id, room.host)) throw gone('No room has that code. Check it and try again.');
    if (room.members.some(m => m.id === me.id)) return { room };
    if (room.state !== 'lobby') throw bad('That room has already started.');
    if (room.members.length >= RULES.maxRoom) throw bad(`That room is full. A room holds ${RULES.maxRoom} people.`);
    if (this.focusing(this.activeSession(me.id), ctx.now)) throw bad('Finish your current session first.');
    this.leaveLobbies(me, ctx.now, code);
    this.sql("INSERT INTO members(room,user_id,status,joined,species) VALUES(?,?,'joined',?,?)", code, me.id, ctx.now, speciesById(body.species) ? body.species : 'clover');
    this.sql("DELETE FROM inbox WHERE to_id=? AND kind='invite' AND data LIKE ?", me.id, `%"${code}"%`);
    return { room: this.pushRoom(code, ctx.now) };
  }

  roomLeave(me, body, ctx) {
    const code = cleanCode(body.code);
    const room = this.one('SELECT * FROM rooms WHERE code=?', code);
    if (!room || !this.one('SELECT 1 AS ok FROM members WHERE room=? AND user_id=?', code, me.id)) return { status: 'left' };
    if (room.state === 'lobby') {
      if (room.host === me.id) {
        this.sql("UPDATE rooms SET state='closed' WHERE code=?", code);
        this.pushRoom(code, ctx.now);
        this.sql('DELETE FROM members WHERE room=?', code);
      } else {
        this.sql('DELETE FROM members WHERE room=? AND user_id=?', code, me.id);
        this.pushRoom(code, ctx.now);
        this.push(me.id, { t: 'room', room: null });
      }
    } else if (room.state === 'running') {
      const row = this.one("SELECT * FROM sessions WHERE room=? AND user_id=? AND status='active'", code, me.id);
      if (row) this.sessionEnd(me, { id: row.id, status: 'failed' }, ctx);
    }
    return { status: 'left' };
  }

  roomInvite(me, body, ctx) {
    const code = cleanCode(body.code);
    const room = this.roomView(code, ctx.now);
    if (!room || room.state !== 'lobby' || !room.members.some(m => m.id === me.id)) throw gone('That room is no longer open.');
    const other = this.requireFriend(me, body.to, 'invite');
    if (room.members.some(m => m.id === other.id)) return { status: 'joined' };
    this.limit(`invite:${me.id}:${other.id}`, 3, 600, ctx.now, `You have already invited ${other.name}.`);
    this.sql("DELETE FROM inbox WHERE to_id=? AND from_id=? AND kind='invite'", other.id, me.id);
    this.deliver(other, me, 'invite', { code, minutes: room.minutes, rule: room.rule }, ctx.now);
    return { status: 'invited' };
  }

  roomStart(me, body, ctx) {
    const code = cleanCode(body.code);
    const room = this.roomView(code, ctx.now);
    if (!room || room.state !== 'lobby') throw gone('That room is no longer open.');
    if (room.host !== me.id) throw new ApiError(403, 'Only the person who opened the room can start it.');
    const start = ctx.now + RULES.countdown;
    this.sql("UPDATE rooms SET state='running', start=? WHERE code=?", start, code);
    this.sql("UPDATE members SET status='focusing' WHERE room=?", code);
    for (const m of room.members) {
      this.sql("UPDATE sessions SET status='abandoned', ended=? WHERE user_id=? AND status='active'", ctx.now, m.id);
      const species = m.species;
      this.sql("INSERT OR REPLACE INTO sessions(id,user_id,start,planned,status,species,room) VALUES(?,?,?,?,'active',?,?)", `${code.toLowerCase()}${m.id}`, m.id, start, room.minutes, species, code);
      this.pushFriends(m.id, { t: 'presence', id: m.id, focusing: { start, until: start + room.minutes * MIN, minutes: room.minutes, species, room: code } });
    }
    return { room: this.pushRoom(code, ctx.now) };
  }

  /** Tell the room which plant or animal you are growing. */
  roomSpecies(me, body, ctx) {
    const code = cleanCode(body.code);
    if (!speciesById(body.species)) throw bad('Choose a plant or an animal.');
    const changed = this.sql('UPDATE members SET species=? WHERE room=? AND user_id=? RETURNING room', body.species, code, me.id).length;
    if (!changed) throw gone('That room is no longer open.');
    this.sql("UPDATE sessions SET species=? WHERE room=? AND user_id=? AND status='active'", body.species, code, me.id);
    return { room: this.pushRoom(code, ctx.now) };
  }

  roomGet(me, code, ctx) {
    const room = this.roomView(cleanCode(code), ctx.now);
    if (!room || !room.members.some(m => m.id === me.id)) throw gone('That room is no longer open.');
    return { room };
  }

  linkCreate(me, body, ctx) {
    this.limit('link:' + me.id, 10, 3600, ctx.now);
    this.sql('DELETE FROM links WHERE user_id=? OR expires<?', me.id, ctx.now);
    const code = randomString(8, CODE_ALPHABET);
    this.sql('INSERT INTO links(code,user_id,expires) VALUES(?,?,?)', code, me.id, ctx.now + RULES.linkLife);
    return { code, expires: ctx.now + RULES.linkLife };
  }

  /** A second device proves it holds the code shown on the first, and gets its own token. */
  linkClaim(body, ctx) {
    this.limit('claim:' + ctx.ip, 10, 3600, ctx.now, 'Too many tries. Wait an hour and try again.');
    const code = cleanCode(body.code);
    const row = this.one('SELECT * FROM links WHERE code=?', code);
    if (!row || row.expires < ctx.now) throw gone('That code is wrong or has run out. Make a new one on your other device.');
    this.sql('DELETE FROM links WHERE code=?', code);
    const me = this.user(row.user_id);
    if (!me) throw gone('That profile no longer exists.');
    this.sql('INSERT INTO tokens(hash,user_id,created) VALUES(?,?,?)', ctx.newTokenHash, me.id, ctx.now);
    return { user: { id: me.id, name: me.name, handle: me.handle, code: me.code, avatar: me.avatar }, token: ctx.newToken };
  }

  statePut(me, body, ctx) {
    this.limit('state:' + me.id, 120, 3600, ctx.now);
    if (!body.state || typeof body.state !== 'object') throw bad('The backup is empty.');
    const text = JSON.stringify(body.state);
    if (text.length > RULES.stateBytes) throw new ApiError(413, 'The backup is too large for the server. Your haven is still safe on this device.');
    this.sql('UPDATE users SET state=?, state_at=? WHERE id=?', text, ctx.now, me.id);
    return { at: ctx.now };
  }
  stateGet(me) { return { state: me.state ? parse(me.state, null) : null, at: me.state_at || null }; }

  logout(me, body, ctx) { this.sql('DELETE FROM tokens WHERE hash=?', ctx.tokenHash); return { status: 'signed-out' }; }

  deleteAccount(me, body, ctx) {
    const friends = this.friendIds(me.id);
    for (const row of this.sql("SELECT r.code FROM members m JOIN rooms r ON r.code=m.room WHERE m.user_id=? AND r.state IN ('lobby','running')", me.id)) this.roomLeave(me, { code: row.code }, ctx);
    for (const q of ['DELETE FROM tokens WHERE user_id=?', 'DELETE FROM sessions WHERE user_id=?', 'DELETE FROM members WHERE user_id=?', 'DELETE FROM links WHERE user_id=?', 'DELETE FROM tickets WHERE user_id=?', 'DELETE FROM users WHERE id=?']) this.sql(q, me.id);
    for (const q of ['DELETE FROM friends WHERE a=? OR b=?', 'DELETE FROM requests WHERE from_id=? OR to_id=?', 'DELETE FROM blocks WHERE user_id=? OR blocked_id=?', 'DELETE FROM inbox WHERE to_id=? OR from_id=?']) this.sql(q, me.id, me.id);
    for (const id of friends) this.push(id, { t: 'friends' });
    return { status: 'deleted' };
  }

  liveTicket(me, body, ctx) {
    this.limit('ticket:' + me.id, 120, 3600, ctx.now);
    this.sql('DELETE FROM tickets WHERE expires<?', ctx.now);
    const ticket = randomString(32, ID_ALPHABET);
    this.sql('INSERT INTO tickets(ticket,user_id,expires) VALUES(?,?,?)', ticket, me.id, ctx.now + RULES.ticketLife);
    return { ticket };
  }
  /** Exchange a one-time ticket for the id of the person opening a live connection. */
  redeemTicket(ticket, now) {
    const row = this.one('DELETE FROM tickets WHERE ticket=? RETURNING user_id, expires', String(ticket || ''));
    return row && row.expires >= now && this.user(row.user_id) ? row.user_id : null;
  }
  /** Called by worker.js when someone's first connection opens or last one closes. */
  presence(userId, online, now) {
    if (!online) this.sql('UPDATE users SET seen=? WHERE id=?', now, userId);
    this.pushFriends(userId, { t: 'presence', id: userId, online });
  }

  /** Old rows that nothing reads any more. Runs at most once an hour. */
  clean(now) {
    const row = this.one("SELECT exp FROM limits WHERE key='clean'");
    if (row && row.exp > now) return;
    this.sql("INSERT INTO limits(key,exp,n) VALUES('clean',?,0) ON CONFLICT(key) DO UPDATE SET exp=excluded.exp", now + 60 * MIN);
    const day = 24 * 60 * MIN;
    this.sql("DELETE FROM limits WHERE key<>'clean' AND exp < ?", now);
    this.sql("DELETE FROM members WHERE room IN (SELECT code FROM rooms WHERE created < ?)", now - 2 * day);
    this.sql('DELETE FROM rooms WHERE created < ?', now - 2 * day);
    this.sql('DELETE FROM inbox WHERE created < ?', now - 30 * day);
    this.sql('DELETE FROM links WHERE expires < ?', now);
    this.sql('DELETE FROM tickets WHERE expires < ?', now);
    this.sql("DELETE FROM sessions WHERE status IN ('abandoned','short','failed') AND start < ?", now - 30 * day);
    this.sql("UPDATE sessions SET status='abandoned', ended=? WHERE status='active' AND start < ?", now, now - (RULES.maxMinutes + 30) * MIN);
  }

  // ——— Entry point ———

  /**
   * Answer one API call.
   * @param {{method: string, path: string, query: object, body: object, token: string|null, ip: string, now: number}} call
   * @returns {Promise<{status: number, body: object}>}
   */
  async handle(call) {
    const ctx = { now: call.now, ip: call.ip || 'unknown', tokenHash: null };
    const route = `${call.method} ${call.path}`;
    // Everything that awaits happens here, before the database is touched, so a check and the write
    // that depends on it can never be separated by another request.
    const open = route === 'POST /api/register' || route === 'POST /api/link/claim';
    if (open) { ctx.newToken = randomString(48, ID_ALPHABET); ctx.newTokenHash = await sha256(ctx.newToken); }
    else if (call.token) ctx.tokenHash = await sha256(call.token);
    try {
      return { status: 200, body: this.tx(() => this.answer(route, call, ctx)) };
    } catch (error) {
      if (error instanceof ApiError) return { status: error.status, body: { error: error.message } };
      throw error;
    }
  }

  answer(route, call, ctx) {
    this.clean(ctx.now);
    if (route === 'GET /health') return { ok: true, service: 'haven-hub', version: VERSION, now: ctx.now };
    if (route === 'POST /api/register') return this.register(call.body, ctx);
    if (route === 'POST /api/link/claim') return this.linkClaim(call.body, ctx);
    if (!ctx.tokenHash) throw new ApiError(401, 'Sign in to use friends.');
    const me = this.one('SELECT u.* FROM tokens t JOIN users u ON u.id=t.user_id WHERE t.hash=?', ctx.tokenHash);
    if (!me) throw new ApiError(401, 'This device is signed out. Sign in again.');
    if (ctx.now - me.seen > 5 * MIN) this.sql('UPDATE users SET seen=? WHERE id=?', ctx.now, me.id);
    const { body, query } = call;
    switch (route) {
      case 'GET /api/me': return this.me(me, query, ctx);
      case 'POST /api/profile': return this.profile(me, body, ctx);
      case 'GET /api/find': return this.find(me, query, ctx);
      case 'POST /api/friends/request': return this.friendRequest(me, body, ctx);
      case 'POST /api/friends/respond': return this.friendRespond(me, body, ctx);
      case 'POST /api/friends/cancel': return this.friendCancel(me, body, ctx);
      case 'POST /api/friends/remove': return this.friendRemove(me, body, ctx);
      case 'POST /api/friends/block': return this.block(me, body, ctx);
      case 'POST /api/friends/unblock': return this.unblock(me, body, ctx);
      case 'GET /api/blocks': return this.blocks(me);
      case 'GET /api/board': return this.board(me, query, ctx);
      case 'GET /api/feed': return this.feed(me, query, ctx);
      case 'POST /api/session/start': return this.sessionStart(me, body, ctx);
      case 'POST /api/session/end': return this.sessionEnd(me, body, ctx);
      case 'POST /api/session/log': return this.sessionLog(me, body, ctx);
      case 'POST /api/cheer': return this.cheer(me, body, ctx);
      case 'POST /api/gift': return this.gift(me, body, ctx);
      case 'POST /api/inbox/ack': return this.inboxAck(me, body, ctx);
      case 'POST /api/rooms': return this.roomCreate(me, body, ctx);
      case 'POST /api/rooms/join': return this.roomJoin(me, body, ctx);
      case 'POST /api/rooms/leave': return this.roomLeave(me, body, ctx);
      case 'POST /api/rooms/invite': return this.roomInvite(me, body, ctx);
      case 'POST /api/rooms/start': return this.roomStart(me, body, ctx);
      case 'POST /api/rooms/species': return this.roomSpecies(me, body, ctx);
      case 'POST /api/link': return this.linkCreate(me, body, ctx);
      case 'PUT /api/state': return this.statePut(me, body, ctx);
      case 'GET /api/state': return this.stateGet(me);
      case 'POST /api/logout': return this.logout(me, body, ctx);
      case 'POST /api/account/delete': return this.deleteAccount(me, body, ctx);
      case 'POST /api/live/ticket': return this.liveTicket(me, body, ctx);
      default:
    }
    let m;
    if (call.method === 'GET' && (m = call.path.match(/^\/api\/friends\/([a-z0-9]{12})$/))) return this.friendPage(me, m[1], query, ctx);
    if (call.method === 'GET' && (m = call.path.match(/^\/api\/rooms\/([A-Za-z0-9]{6})$/))) return this.roomGet(me, m[1], ctx);
    throw new ApiError(404, 'Not found.');
  }
}
