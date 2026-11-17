// The rules of Haven's server: accounts, friends, live presence, focusing together, cheers and gifts.
// This file knows nothing about Cloudflare. It is given a SQL function, a way to push a message to a
// person's open connections, and a way to ask whether someone is connected; worker.js supplies those.
import { speciesById } from '../src/catalog.js';

export const VERSION = '1.5.0';
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
  grantLife: 10 * MIN, // a Google sign-in must be finished within this
  maxTokens: 20, // devices signed in to one account; the oldest is signed out beyond this
  passMin: 8,
  passMax: 128,
  ticketLife: 30000,
  logWindow: 7 * 24 * 60 * MIN, // offline sessions can be reported this long afterwards
  stateBytes: 600000,
  maxKeepers: 8, // people in one sanctuary: with the great tree's clearing, a 3 × 3 square
  treePerKeeper: 120, // minutes a week each person brings toward the great tree's bloom
  treeLeast: 240,
  maxPals: 200, // animal friendships kept in one sanctuary
  maxSanctuaries: 5, // sanctuaries one person can belong to
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
  // Short-lived one-time codes for signing in with Google: 'state' while at Google, 'sign' on the way back, 'link' to connect an account.
  `CREATE TABLE IF NOT EXISTS grants(code TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', expires INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS tickets(ticket TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY, exp INTEGER NOT NULL, n INTEGER NOT NULL)`,
  // Sanctuaries: groups whose havens are joined into one land. A keeper is a member.
  `CREATE TABLE IF NOT EXISTS sanctuaries(id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, owner TEXT NOT NULL, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS keepers(sid TEXT NOT NULL, user_id TEXT NOT NULL, joined INTEGER NOT NULL, PRIMARY KEY(sid,user_id))`,
  `CREATE INDEX IF NOT EXISTS keepers_user ON keepers(user_id)`,
  // Animals from different havens that met in a sanctuary and became friends. a and b are "owner:item".
  `CREATE TABLE IF NOT EXISTS pals(sid TEXT NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL, since INTEGER NOT NULL, PRIMARY KEY(sid,a,b))`,
  // The weeks each sanctuary's great tree came into full bloom.
  `CREATE TABLE IF NOT EXISTS blooms(sid TEXT NOT NULL, week INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(sid,week))`,
  // Reports of people, for whoever runs the server to look at.
  `CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY AUTOINCREMENT, from_id TEXT NOT NULL, about_id TEXT NOT NULL, reason TEXT NOT NULL, place TEXT NOT NULL, about_name TEXT NOT NULL, about_handle TEXT NOT NULL, created INTEGER NOT NULL)`,
];

const ADDED_COLUMNS = [
  'ALTER TABLE users ADD COLUMN state_rev INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN pass TEXT', // "pbkdf2$<rounds>$<salt>$<hash>", or null for an account that signs in with Google only
  'ALTER TABLE users ADD COLUMN google TEXT', // Google's id for the person, when connected
  'ALTER TABLE rooms ADD COLUMN sid TEXT', // a campfire lit for a sanctuary
];
const AFTER_COLUMNS = [
  'CREATE UNIQUE INDEX IF NOT EXISTS users_google ON users(google) WHERE google IS NOT NULL',
  'DROP TABLE IF EXISTS links', // one-time codes for adding a device, replaced by signing in
];

/** Monday 00:00 UTC of the week holding `now`. */
export function weekStart(now) {
  const d = new Date(now), day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * 86400000;
}

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

// ——— Passwords ———
// Stored as PBKDF2-SHA-256 with a salt of their own. 100,000 rounds is the most the Workers runtime allows.
const PASS_ROUNDS = 100000;
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const unhex = text => new Uint8Array((text.match(/../g) || []).map(h => parseInt(h, 16)));
async function pbkdf2(password, salt, rounds) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, 256)));
}
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PASS_ROUNDS}$${hex(salt)}$${await pbkdf2(password, salt, PASS_ROUNDS)}`;
}
/** Whether the password matches. Takes the same time whether or not there is anything stored. */
export async function checkPassword(password, stored) {
  const [kind, rounds, salt, hash] = String(stored || '').split('$');
  const real = kind === 'pbkdf2' && hash;
  const got = await pbkdf2(String(password ?? ''), real ? unhex(salt) : new Uint8Array(16), real ? Number(rounds) : PASS_ROUNDS);
  if (!real || got.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}
export function cleanPassword(v, handle = '') {
  const password = typeof v === 'string' ? v : '';
  if ([...password].length < RULES.passMin) throw bad(`Use a password of at least ${RULES.passMin} characters.`);
  if (password.length > RULES.passMax) throw bad(`Keep the password to ${RULES.passMax} characters or fewer.`);
  if (handle && password.toLowerCase() === handle.toLowerCase()) throw bad('Choose a password that is not your username.');
  return password;
}

export const cleanCode = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// Control characters and invisible direction marks are removed from names.
const INVISIBLE = /[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g;
export function cleanName(v) {
  // Control characters and invisible direction marks are removed; runs of spaces become one.
  const name = String(v ?? '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
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
/** What an account's own devices are told about it. */
const account = u => ({ id: u.id, name: u.name, handle: u.handle, code: u.code, avatar: u.avatar, hasPassword: Boolean(u.pass), google: Boolean(u.google) });
const publicUser = u => ({ id: u.id, name: u.name, handle: u.handle, avatar: u.avatar });
const parse = (text, fallback) => { try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : fallback; } catch { return fallback; } };

const OPEN_ROUTES = new Set(['POST /api/register', 'POST /api/login', 'POST /api/google/claim']);

export class Hub {
  /**
   * @param {object} io
   * @param {(query: string, ...params: any[]) => any[]} io.sql
   * @param {(userId: string, message: object) => void} io.push
   * @param {(userId: string) => boolean} io.online
   * @param {(fn: () => any) => any} [io.tx]
   * @param {{google?: boolean, returns?: string[]}} [io.config] whether Google sign-in is set up, and the pages it may send people back to
   */
  constructor({ sql, push, online, tx = fn => fn(), config = {} }) {
    this.config = { google: false, returns: [], dev: false, ...config };
    this.sql = sql;
    this.push = push;
    this.online = online;
    this.tx = tx; // runs a function as one database transaction
    for (const statement of SCHEMA) sql(statement);
    // Columns added after the first release. Adding one that is already there fails harmlessly.
    for (const column of ADDED_COLUMNS) { try { sql(column); } catch { /* already added */ } }
    for (const statement of AFTER_COLUMNS) sql(statement);
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
  /** Like limit(), but answers whether it is allowed instead of refusing. */
  allowed(key, max, seconds, now) {
    try { this.limit(key, max, seconds, now); return true; } catch (error) { if (error instanceof ApiError && error.status === 429) return false; throw error; }
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
    const sanctuary = room.sid ? this.one('SELECT name FROM sanctuaries WHERE id=?', room.sid)?.name || null : null;
    return { code: room.code, host: room.host, minutes: room.minutes, rule: room.rule, state: room.state, start: room.start, members, now, ...(sanctuary ? { sid: room.sid, sanctuary } : {}) };
  }
  pushRoom(code, now, extra = {}) {
    const room = this.roomView(code, now);
    if (room) for (const m of room.members) this.push(m.id, { t: 'room', room, ...extra });
    const sid = this.one('SELECT sid FROM rooms WHERE code=?', code)?.sid;
    if (sid) this.pushSanctuary(sid);
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


  // ——— Sanctuaries ———

  /** A sanctuary as its members see it. With `cards`, each member's haven too. */
  sanctuaryView(id, now, cards = false) {
    const row = this.one('SELECT * FROM sanctuaries WHERE id=?', id);
    if (!row) return null;
    const members = this.sql('SELECT u.*, k.joined FROM keepers k JOIN users u ON u.id=k.user_id WHERE k.sid=? ORDER BY k.joined, k.rowid', id).map(u => ({
      ...publicUser(u), joined: u.joined, online: this.online(u.id), focusing: this.focusing(this.activeSession(u.id), now),
      ...(cards ? { card: parse(u.card, {}) } : { level: Number(parse(u.card, {}).level) || 1 }),
    }));
    const view = { id: row.id, code: row.code, name: row.name, owner: row.owner, created: row.created, members };
    if (cards) Object.assign(view, { tree: this.tree(id, now), campfire: this.sanctuaryFire(id, now), pals: this.palsOf(id) });
    return view;
  }

  /**
   * The great tree in the middle of a sanctuary: it grows through the week (Monday to Sunday, UTC)
   * with every minute its members focus, and comes into bloom at the week's goal.
   */
  tree(sid, now) {
    const week = weekStart(now), ids = this.sql('SELECT user_id FROM keepers WHERE sid=?', sid).map(r => r.user_id);
    const minutes = ids.length ? this.one(`SELECT COALESCE(SUM(minutes),0) AS n FROM sessions WHERE status='done' AND start>=? AND user_id IN (${ids.map(() => '?').join(',')})`, week, ...ids).n : 0;
    const goal = Math.max(RULES.treeLeast, RULES.treePerKeeper * ids.length), share = minutes / goal;
    const stage = share >= 1 ? 5 : share >= 0.8 ? 4 : share >= 0.55 ? 3 : share >= 0.3 ? 2 : share >= 0.1 ? 1 : 0;
    const blooms = this.one('SELECT COUNT(*) AS n FROM blooms WHERE sid=?', sid).n;
    return { week, minutes, goal, stage, blooms, top: this.treeTop(ids, week) };
  }
  /** Who brought the most minutes to the tree this week. */
  treeTop(ids, week) {
    if (!ids.length) return [];
    return this.sql(`SELECT user_id AS id, SUM(minutes) AS minutes FROM sessions WHERE status='done' AND start>=? AND user_id IN (${ids.map(() => '?').join(',')}) GROUP BY user_id ORDER BY minutes DESC LIMIT 3`, week, ...ids);
  }
  /** A session was finished: any sanctuary of this person whose tree has just reached its goal blooms. */
  checkBlooms(me, now) {
    for (const { sid } of this.sql('SELECT sid FROM keepers WHERE user_id=?', me.id)) {
      const t = this.tree(sid, now);
      if (t.minutes < t.goal || this.one('SELECT 1 AS ok FROM blooms WHERE sid=? AND week=?', sid, t.week)) continue;
      this.sql('INSERT INTO blooms(sid,week,at) VALUES(?,?,?)', sid, t.week, now);
      const name = this.one('SELECT name FROM sanctuaries WHERE id=?', sid)?.name;
      for (const k of this.sql('SELECT user_id FROM keepers WHERE sid=?', sid)) { const to = this.user(k.user_id); if (to) this.deliver(to, me, 'bloom', { sid, name }, now); }
      this.pushSanctuary(sid);
    }
  }
  /** The campfire lit for this sanctuary, while it is open or burning. */
  sanctuaryFire(sid, now) {
    const row = this.one("SELECT code FROM rooms WHERE sid=? AND state IN ('lobby','running') ORDER BY created DESC LIMIT 1", sid);
    const room = row && this.roomView(row.code, now);
    if (!room || !['lobby', 'running'].includes(room.state)) return null;
    if (room.state === 'running' && now > room.start + room.minutes * MIN) return null;
    return { code: room.code, host: room.host, minutes: room.minutes, rule: room.rule, state: room.state, start: room.start, members: room.members.map(m => ({ id: m.id, status: m.status })) };
  }
  palsOf(sid) {
    return this.sql('SELECT a, b, since FROM pals WHERE sid=? ORDER BY since DESC LIMIT 100', sid);
  }
  /** The sanctuary, if this person is in it. */
  requireKeeper(me, id) {
    if (typeof id !== 'string' || !this.one('SELECT 1 AS ok FROM keepers WHERE sid=? AND user_id=?', id, me.id)) throw gone('That sanctuary is not one of yours.');
  }
  pushSanctuary(id, message = null) {
    for (const k of this.sql('SELECT user_id FROM keepers WHERE sid=?', id)) this.push(k.user_id, message || { t: 'sanctuary', id });
  }
  /** Tell everyone who shares a sanctuary with this person that something of theirs changed. */
  pushKeepers(userId, message) {
    const ids = this.sql('SELECT DISTINCT k2.user_id AS id FROM keepers k1 JOIN keepers k2 ON k2.sid=k1.sid WHERE k1.user_id=? AND k2.user_id<>?', userId, userId).map(r => r.id);
    for (const id of ids) this.push(id, message);
  }
  cleanSanctuaryName(v) {
    const name = String(v ?? '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
    if (!name) throw bad('Give the sanctuary a name.');
    if ([...name].length > 30) throw bad('Keep the name to 30 characters or fewer.');
    return name;
  }
  countMine(me) { return this.one('SELECT COUNT(*) AS n FROM keepers WHERE user_id=?', me.id).n; }

  sanctuaries(me, query, ctx) {
    const ids = this.sql('SELECT sid FROM keepers WHERE user_id=? ORDER BY joined', me.id).map(r => r.sid);
    return { sanctuaries: ids.map(id => this.sanctuaryView(id, ctx.now)).filter(Boolean) };
  }
  sanctuaryGet(me, id, ctx) {
    this.requireKeeper(me, id);
    return { sanctuary: this.sanctuaryView(id, ctx.now, true) };
  }
  sanctuaryCreate(me, body, ctx) {
    this.limit('sanct:' + me.id, 10, 3600, ctx.now);
    const name = this.cleanSanctuaryName(body.name);
    if (this.countMine(me) >= RULES.maxSanctuaries) throw bad(`You can be in up to ${RULES.maxSanctuaries} sanctuaries. Leave one first.`);
    let id, code;
    do { id = randomString(12, ID_ALPHABET); } while (this.one('SELECT 1 AS ok FROM sanctuaries WHERE id=?', id));
    do { code = randomString(8, CODE_ALPHABET); } while (this.one('SELECT 1 AS ok FROM sanctuaries WHERE code=?', code));
    this.sql('INSERT INTO sanctuaries(id,code,name,owner,created) VALUES(?,?,?,?,?)', id, code, name, me.id, ctx.now);
    this.sql('INSERT INTO keepers(sid,user_id,joined) VALUES(?,?,?)', id, me.id, ctx.now);
    return { sanctuary: this.sanctuaryView(id, ctx.now) };
  }
  sanctuaryJoin(me, body, ctx) {
    this.limit('sjoin:' + me.id, 30, 3600, ctx.now);
    const row = this.one('SELECT * FROM sanctuaries WHERE code=?', cleanCode(body.code));
    if (!row || this.blockedEitherWay(me.id, row.owner)) throw gone('No sanctuary has that code. Check it and try again.');
    if (this.one('SELECT 1 AS ok FROM keepers WHERE sid=? AND user_id=?', row.id, me.id)) return { sanctuary: this.sanctuaryView(row.id, ctx.now) };
    if (this.one('SELECT COUNT(*) AS n FROM keepers WHERE sid=?', row.id).n >= RULES.maxKeepers) throw bad(`That sanctuary is full. A sanctuary holds ${RULES.maxKeepers} havens.`);
    if (this.countMine(me) >= RULES.maxSanctuaries) throw bad(`You can be in up to ${RULES.maxSanctuaries} sanctuaries. Leave one first.`);
    this.sql('INSERT INTO keepers(sid,user_id,joined) VALUES(?,?,?)', row.id, me.id, ctx.now);
    this.sql("DELETE FROM inbox WHERE to_id=? AND kind='sanctuary' AND data LIKE ?", me.id, `%"${row.code}"%`);
    this.pushSanctuary(row.id);
    return { sanctuary: this.sanctuaryView(row.id, ctx.now) };
  }
  /** Invite a friend. They see the invitation in Haven and join with one tap. */
  sanctuaryInvite(me, body, ctx) {
    this.requireKeeper(me, body.id);
    const other = this.requireFriend(me, body.to, 'invite');
    const row = this.one('SELECT * FROM sanctuaries WHERE id=?', body.id);
    if (this.one('SELECT 1 AS ok FROM keepers WHERE sid=? AND user_id=?', row.id, other.id)) return { status: 'joined' };
    this.limit(`sinvite:${me.id}:${other.id}`, 3, 3600, ctx.now, `You have already invited ${other.name}.`);
    this.sql("DELETE FROM inbox WHERE to_id=? AND from_id=? AND kind='sanctuary'", other.id, me.id);
    this.deliver(other, me, 'sanctuary', { code: row.code, name: row.name }, ctx.now);
    return { status: 'invited' };
  }
  /** Leave. The person who made it hands it to whoever joined next; an empty sanctuary is gone. */
  sanctuaryLeave(me, body, ctx) {
    this.requireKeeper(me, body.id);
    this.dropKeeper(body.id, me.id);
    return { status: 'left' };
  }
  dropKeeper(sid, userId) {
    this.sql('DELETE FROM keepers WHERE sid=? AND user_id=?', sid, userId);
    this.sql('DELETE FROM pals WHERE sid=? AND (a LIKE ? OR b LIKE ?)', sid, userId + ':%', userId + ':%');
    const next = this.one('SELECT user_id FROM keepers WHERE sid=? ORDER BY joined, rowid LIMIT 1', sid);
    if (!next) { for (const q of ['DELETE FROM sanctuaries WHERE id=?', 'DELETE FROM pals WHERE sid=?', 'DELETE FROM blooms WHERE sid=?']) this.sql(q, sid); return; }
    this.sql('UPDATE sanctuaries SET owner=? WHERE id=? AND owner=?', next.user_id, sid, userId);
    this.pushSanctuary(sid);
    this.push(userId, { t: 'sanctuary', id: sid });
  }
  /** The person who made the sanctuary can rename it and ask someone to leave. */
  sanctuaryEdit(me, body, ctx) {
    this.requireKeeper(me, body.id);
    const row = this.one('SELECT * FROM sanctuaries WHERE id=?', body.id);
    if (row.owner !== me.id) throw new ApiError(403, 'Only the person who looks after the sanctuary can change it.');
    if (body.name !== undefined) this.sql('UPDATE sanctuaries SET name=? WHERE id=?', this.cleanSanctuaryName(body.name), row.id);
    if (body.remove !== undefined) {
      if (body.remove === me.id) throw bad('To leave, choose Leave.');
      if (!this.one('SELECT 1 AS ok FROM keepers WHERE sid=? AND user_id=?', row.id, String(body.remove))) throw gone('That person is not in the sanctuary.');
      this.dropKeeper(row.id, String(body.remove));
    }
    this.pushSanctuary(row.id);
    return { sanctuary: this.sanctuaryView(row.id, ctx.now) };
  }

  // ——— Sessions ———

  /** Mark a session finished or failed, tell friends, and return what it earned. */
  /** Light a campfire for the sanctuary: everyone in it is invited at once. */
  sanctuaryCampfire(me, body, ctx) {
    this.requireKeeper(me, body.id);
    if (this.sanctuaryFire(body.id, ctx.now)) throw bad('A campfire is already lit here. Join it instead.');
    const { room } = this.roomCreate(me, body, ctx);
    this.sql('UPDATE rooms SET sid=? WHERE code=?', body.id, room.code);
    const s = this.one('SELECT name FROM sanctuaries WHERE id=?', body.id);
    for (const k of this.sql('SELECT user_id FROM keepers WHERE sid=? AND user_id<>?', body.id, me.id)) {
      const other = this.user(k.user_id);
      if (!other || this.blockedEitherWay(me.id, other.id)) continue;
      this.sql("DELETE FROM inbox WHERE to_id=? AND from_id=? AND kind='invite'", other.id, me.id);
      this.deliver(other, me, 'invite', { code: room.code, minutes: room.minutes, rule: room.rule, sanctuary: s.name }, ctx.now);
    }
    this.pushSanctuary(body.id);
    return { room: this.roomView(room.code, ctx.now) };
  }

  /** Another keeper of the sanctuary, checked: someone in it, not you, not blocked. */
  requireKeeperOther(me, sid, id) {
    this.requireKeeper(me, sid);
    const other = typeof id === 'string' && this.one('SELECT 1 AS ok FROM keepers WHERE sid=? AND user_id=?', sid, id) ? this.user(id) : null;
    if (!other || other.id === me.id || this.blockedEitherWay(me.id, other.id)) throw gone('That haven is no longer in the sanctuary.');
    return other;
  }
  /**
   * A treat or a pat for an animal in someone else's haven in the sanctuary. The treat came out of
   * the giver's own treats. Its owner hears about it; pats are told at most every half hour.
   */
  sanctuaryCare(me, body, ctx) {
    const other = this.requireKeeperOther(me, body.id, body.to);
    const kind = body.kind === 'treat' ? 'treat' : 'pet';
    const item = String(body.item || '').slice(0, 40), species = speciesById(body.species) ? body.species : null;
    if (!item || !species || speciesById(species).kind !== 'animal') throw bad('That animal is not there.');
    this.limit('care:' + me.id, 60, 3600, ctx.now, 'That is a lot of care for one hour. Give it a rest.');
    const name = this.one('SELECT name FROM sanctuaries WHERE id=?', body.id).name;
    if (kind === 'pet' && !this.allowed(`carepet:${me.id}:${other.id}`, 1, 1800, ctx.now)) return { status: 'ok' };
    this.deliver(other, me, 'care', { kind, item, species, sid: body.id, name }, ctx.now);
    return { status: 'ok' };
  }
  /** Two animals from different havens met and got on: they are friends from now on. */
  sanctuaryPal(me, body, ctx) {
    this.requireKeeper(me, body.id);
    const keys = [body.a, body.b].map(k => String(k || '')).sort();
    const parts = keys.map(k => /^([a-z0-9]{12}):([\w-]{1,40}):([a-z]+)$/.exec(k));
    if (parts.some(x => !x) || parts[0][1] === parts[1][1] || parts.some(x => speciesById(x[3])?.kind !== 'animal')) throw bad('Those animals cannot be friends.');
    for (const x of parts) if (!this.one('SELECT 1 AS ok FROM keepers WHERE sid=? AND user_id=?', body.id, x[1])) throw gone('That haven is no longer in the sanctuary.');
    this.limit('pal:' + me.id, 30, 3600, ctx.now);
    if (this.one('SELECT COUNT(*) AS n FROM pals WHERE sid=?', body.id).n >= RULES.maxPals) return { status: 'full' };
    const fresh = this.sql('INSERT OR IGNORE INTO pals(sid,a,b,since) VALUES(?,?,?,?) RETURNING since', body.id, keys[0], keys[1], ctx.now).length > 0;
    if (!fresh) return { status: 'known' };
    const name = this.one('SELECT name FROM sanctuaries WHERE id=?', body.id).name;
    const [x, y] = parts.map(p => this.user(p[1]));
    if (x && y) {
      this.deliver(x, y, 'pal', { sid: body.id, name, mine: parts[0][3], theirs: parts[1][3] }, ctx.now);
      this.deliver(y, x, 'pal', { sid: body.id, name, mine: parts[1][3], theirs: parts[0][3] }, ctx.now);
    }
    this.pushSanctuary(body.id);
    return { status: 'friends' };
  }

  /** Someone reported a person. It is kept for whoever runs the server; the person is not told. */
  report(me, body, ctx) {
    this.limit('report:' + me.id, 20, 86400, ctx.now, 'You have sent a lot of reports today. Try again tomorrow.');
    const other = this.user(String(body.id || ''));
    if (!other || other.id === me.id) throw gone('That person could not be found.');
    const reason = ['name', 'harassment', 'spam', 'other'].includes(body.reason) ? body.reason : 'other';
    const place = String(body.place || '').replace(INVISIBLE, '').slice(0, 60);
    if (this.one('SELECT 1 AS ok FROM reports WHERE from_id=? AND about_id=? AND created>?', me.id, other.id, ctx.now - 86400000)) return { status: 'reported' };
    this.sql('INSERT INTO reports(from_id,about_id,reason,place,about_name,about_handle,created) VALUES(?,?,?,?,?,?,?)', me.id, other.id, reason, place, other.name, other.handle, ctx.now);
    return { status: 'reported' };
  }

  closeSession(me, row, status, minutes, now) {
    this.sql('UPDATE sessions SET status=?, minutes=?, ended=? WHERE id=?', status, minutes, now, row.id);
    this.pushFriends(me.id, { t: 'presence', id: me.id, focusing: null, ...(status === 'done' ? { last: now, add: minutes, start: row.start } : {}) });
    if (status === 'done') this.pushFriends(me.id, { t: 'feed', item: { id: row.id, user: publicUser(me), species: row.species, minutes, start: row.start, room: row.room || null } });
    if (status === 'done') { this.checkBlooms(me, now); for (const k of this.sql('SELECT sid FROM keepers WHERE user_id=?', me.id)) this.pushSanctuary(k.sid); }
  }

  // ——— Routes ———

  /** A new device signed in: give it its own token, and sign the oldest out if there are too many. */
  issueToken(userId, ctx) {
    this.sql('INSERT INTO tokens(hash,user_id,created) VALUES(?,?,?)', ctx.newTokenHash, userId, ctx.now);
    this.sql('DELETE FROM tokens WHERE user_id=? AND hash NOT IN (SELECT hash FROM tokens WHERE user_id=? ORDER BY created DESC, rowid DESC LIMIT ?)', userId, userId, RULES.maxTokens);
    return ctx.newToken;
  }
  createUser({ name, handle, avatar, pass = null, google = null }, now) {
    if (this.one('SELECT 1 AS ok FROM users WHERE handle=?', handle)) throw new ApiError(409, 'That username is taken. Try another.');
    let id, code;
    do { id = randomString(12, ID_ALPHABET); } while (this.user(id));
    do { code = randomString(8, CODE_ALPHABET); } while (this.one('SELECT 1 AS ok FROM users WHERE code=?', code));
    this.sql('INSERT INTO users(id,handle,name,code,avatar,created,seen,pass,google) VALUES(?,?,?,?,?,?,?,?,?)', id, handle, name, code, speciesById(avatar) ? avatar : 'rabbit', now, now, pass, google);
    return this.user(id);
  }

  /** Create an account: a username and a password. The password was hashed before this runs. */
  register(body, ctx) {
    this.limit('reg:' + ctx.ip, 5, 3600, ctx.now, 'Too many new accounts from this network. Try again in an hour.');
    const handle = cleanHandle(body.handle), name = cleanName(body.name ?? body.handle);
    if (!ctx.passHash) throw bad('Update Haven to create an account: accounts now have a password.');
    const user = this.createUser({ name, handle, avatar: body.avatar, pass: ctx.passHash }, ctx.now);
    return { user: account(user), token: this.issueToken(user.id, ctx) };
  }

  /** Sign in on any device with the username and password. The password was checked before this runs. */
  login(body, ctx) {
    const user = this.one('SELECT * FROM users WHERE handle=?', ctx.handle);
    if (user && !user.pass && user.google) throw new ApiError(401, 'This account signs in with Google. Choose "Continue with Google".');
    if (user && !user.pass) throw new ApiError(401, 'This account has no password yet. Open Haven on the phone where you are signed in, and it will ask you to set one.');
    if (!user || !ctx.passOk) throw new ApiError(401, 'Wrong username or password.');
    return { user: account(user), token: this.issueToken(user.id, ctx) };
  }

  /** Set a password, or change it. Changing it signs every other device out. */
  password(me, body, ctx) {
    if (me.pass && !ctx.passOk) throw new ApiError(403, 'The current password is wrong.');
    this.sql('UPDATE users SET pass=? WHERE id=?', ctx.passHash, me.id);
    if (me.pass) this.sql('DELETE FROM tokens WHERE user_id=? AND hash<>?', me.id, ctx.tokenHash);
    return { me: account({ ...me, pass: ctx.passHash }) };
  }

  // ——— Signing in with Google ———
  // worker.js talks to Google; these keep the one-time codes that tie the steps together.

  grant(kind, data, now) {
    this.sql('DELETE FROM grants WHERE expires<?', now);
    const code = randomString(40, ID_ALPHABET);
    this.sql('INSERT INTO grants(code,kind,data,expires) VALUES(?,?,?,?)', code, kind, JSON.stringify(data), now + RULES.grantLife);
    return code;
  }
  /** The grant with this code, if it is of this kind and has not run out. `take` uses it up. */
  granted(code, kind, now, take = true) {
    const row = this.one('SELECT * FROM grants WHERE code=? AND kind=?', String(code || ''), kind);
    if (!row || row.expires < now) return null;
    if (take) this.sql('DELETE FROM grants WHERE code=?', row.code);
    return parse(row.data, null);
  }
  /** Where Google sign-in may send someone back to: the app itself, or a page this server was told about. */
  returnTo(v) {
    const to = String(v || '');
    if (to === 'haven://auth') return to;
    if (this.config.dev && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[\w./-]*$/.test(to)) return to;
    return this.config.returns.some(base => to === base || to.startsWith(base.endsWith('/') ? base : base + '/')) && !/[#?]/.test(to) ? to : null;
  }
  /** Someone is about to be sent to Google. Returns the `state` to send with them. */
  googleStart(query, now, ip = 'unknown') {
    if (!this.config.google) throw gone('Signing in with Google is not set up on this server.');
    this.limit('gstart:' + ip, 30, 3600, now);
    const to = this.returnTo(query.return);
    if (!to) throw bad('That is not a page Haven can return to.');
    let link = null;
    if (query.link) { link = this.granted(query.link, 'link', now)?.user || null; if (!link) throw bad('That link has run out. Try again from Settings.'); }
    // The app may send the hash of a secret it keeps. Only someone who can show the secret can then
    // finish the sign-in, so a one-time code is no use to another app that sees it on the way back.
    const challenge = /^[0-9a-f]{64}$/.test(String(query.challenge || '')) ? query.challenge : null;
    return this.grant('state', { to, link, challenge }, now);
  }
  /** Google sent them back. `who` is what Google says about them, or null if it did not work out. Returns where to send them. */
  googleBack(state, who, now) {
    const s = this.granted(state, 'state', now);
    if (!s) return null;
    const back = (key, value) => (s.to === 'haven://auth' ? `${s.to}?${key}=${encodeURIComponent(value)}` : `${s.to}#${key}=${encodeURIComponent(value)}`);
    if (!who?.sub) return back('google-error', 'cancelled');
    const owner = this.one('SELECT * FROM users WHERE google=?', who.sub);
    if (s.link) {
      const me = this.user(s.link);
      if (!me) return back('google-error', 'gone');
      if (owner && owner.id !== me.id) return back('google-error', 'taken');
      this.sql('UPDATE users SET google=? WHERE id=?', who.sub, me.id);
      this.push(me.id, { t: 'account' });
      return back('google', 'linked');
    }
    return back('google', this.grant('sign', { ...(owner ? { user: owner.id } : { sub: who.sub, name: String(who.name || '').slice(0, 24) }), challenge: s.challenge || null }, now));
  }
  /**
   * Finish signing in with Google. For someone new the first call says so, and the second,
   * with the username they chose, makes the account.
   */
  googleClaim(body, ctx) {
    this.limit('gclaim:' + ctx.ip, 30, 3600, ctx.now);
    const g = this.granted(body.code, 'sign', ctx.now, false);
    if (!g || (g.challenge && g.challenge !== ctx.verifierHash)) throw gone('That sign-in has run out. Choose "Continue with Google" again.');
    let user = g.user ? this.user(g.user) : this.one('SELECT * FROM users WHERE google=?', g.sub);
    if (!user) {
      if (g.user) throw gone('That account no longer exists.');
      if (body.handle === undefined) return { needsProfile: true, name: g.name || '' };
      this.limit('reg:' + ctx.ip, 5, 3600, ctx.now, 'Too many new accounts from this network. Try again in an hour.');
      const handle = cleanHandle(body.handle);
      user = this.createUser({ name: cleanName(body.name ?? g.name ?? handle), handle, avatar: body.avatar, google: g.sub }, ctx.now);
    }
    this.sql('DELETE FROM grants WHERE code=?', String(body.code));
    return { user: account(user), token: this.issueToken(user.id, ctx) };
  }
  /** A one-time code that lets this account be connected to Google from the browser. */
  googleLink(me, body, ctx) {
    if (!this.config.google) throw gone('Signing in with Google is not set up on this server.');
    this.limit('glink:' + me.id, 10, 3600, ctx.now);
    return { code: this.grant('link', { user: me.id }, ctx.now) };
  }
  googleUnlink(me) {
    if (!me.pass) throw bad('Set a password first, so you can still sign in.');
    this.sql('UPDATE users SET google=NULL WHERE id=?', me.id);
    return { me: account({ ...me, google: null }) };
  }

  me(me, query, ctx) {
    const since = Number(query.since) || 0;
    const incoming = this.sql('SELECT u.id,u.name,u.handle,u.avatar,r.created FROM requests r JOIN users u ON u.id=r.from_id WHERE r.to_id=? ORDER BY r.created DESC', me.id).map(u => ({ ...publicUser(u), created: u.created }));
    const outgoing = this.sql('SELECT u.id,u.name,u.handle,u.avatar,r.created FROM requests r JOIN users u ON u.id=r.to_id WHERE r.from_id=? ORDER BY r.created DESC', me.id).map(u => ({ ...publicUser(u), created: u.created }));
    const mine = this.one("SELECT COALESCE(SUM(minutes),0) AS today FROM sessions WHERE user_id=? AND status='done' AND start>=?", me.id, since);
    return {
      me: { ...account(me), today: mine.today, backupAt: me.state_at || null },
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
    if (card !== me.card || name !== me.name || avatar !== me.avatar) this.pushKeepers(me.id, { t: 'haven', id: me.id });
    return { me: account({ ...me, name, avatar }) };
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
      this.deliver(other, me, 'accepted', {}, ctx.now);
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
      this.deliver(other, me, 'accepted', {}, ctx.now);
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
    if (!room || room.state === 'closed' || this.blockedEitherWay(me.id, room.host)) throw gone('No campfire has that code. Check it and try again.');
    if (room.members.some(m => m.id === me.id)) return { room };
    if (room.state !== 'lobby') throw bad('That campfire has already started.');
    if (room.members.length >= RULES.maxRoom) throw bad(`That campfire is full. ${RULES.maxRoom} people fit round one.`);
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
    if (!room || room.state !== 'lobby' || !room.members.some(m => m.id === me.id)) throw gone('That campfire has gone out.');
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
    if (!room || room.state !== 'lobby') throw gone('That campfire has gone out.');
    if (room.host !== me.id) throw new ApiError(403, 'Only the person who lit the campfire can start it.');
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
    if (!changed) throw gone('That campfire has gone out.');
    this.sql("UPDATE sessions SET species=? WHERE room=? AND user_id=? AND status='active'", body.species, code, me.id);
    return { room: this.pushRoom(code, ctx.now) };
  }

  roomGet(me, code, ctx) {
    const room = this.roomView(cleanCode(code), ctx.now);
    if (!room || !room.members.some(m => m.id === me.id)) throw gone('That campfire has gone out.');
    return { room };
  }

  /**
   * Save the haven every device of this person shares. `base` is the revision the device last saw:
   * if another device has saved since, the save is refused and the device joins the two first.
   * Every other device that is open hears about the new revision at once.
   */
  statePut(me, body, ctx) {
    this.limit('state:' + me.id, 600, 3600, ctx.now);
    if (!body.state || typeof body.state !== 'object' || Array.isArray(body.state)) throw bad('The backup is empty.');
    const text = JSON.stringify(body.state);
    if (text.length > RULES.stateBytes) throw new ApiError(413, 'The backup is too large for the server. Your haven is still safe on this device.');
    const current = me.state_rev || 0;
    if (body.base !== undefined && body.base !== current) throw new ApiError(409, 'Another device saved first.');
    const rev = current + 1;
    this.sql('UPDATE users SET state=?, state_at=?, state_rev=? WHERE id=?', text, ctx.now, rev, me.id);
    this.push(me.id, { t: 'state', rev });
    return { at: ctx.now, rev };
  }
  stateGet(me) { return { state: me.state ? parse(me.state, null) : null, at: me.state_at || null, rev: me.state_rev || 0 }; }

  /**
   * What happened since a time, for a phone checking in while Haven is closed: friend requests and
   * everything in the inbox. Kept small; the app fetches the details when it opens.
   */
  news(me, query, ctx) {
    this.limit('news:' + me.id, 120, 3600, ctx.now);
    const since = Math.max(Number(query.since) || 0, ctx.now - 7 * 24 * 60 * MIN);
    const requests = this.sql('SELECT u.name, r.created FROM requests r JOIN users u ON u.id=r.from_id WHERE r.to_id=? AND r.created>? ORDER BY r.created LIMIT 20', me.id, since)
      .map(r => ({ kind: 'request', name: r.name, created: r.created }));
    const inbox = this.sql('SELECT i.kind, i.data, i.created, u.name FROM inbox i JOIN users u ON u.id=i.from_id WHERE i.to_id=? AND i.created>? ORDER BY i.id LIMIT 30', me.id, since)
      .map(r => ({ kind: r.kind, name: r.name, created: r.created, data: parse(r.data, {}) }));
    return { news: [...requests, ...inbox].sort((x, y) => x.created - y.created), now: ctx.now };
  }

  logout(me, body, ctx) { this.sql('DELETE FROM tokens WHERE hash=?', ctx.tokenHash); return { status: 'signed-out' }; }

  deleteAccount(me, body, ctx) {
    const friends = this.friendIds(me.id);
    for (const row of this.sql('SELECT sid FROM keepers WHERE user_id=?', me.id)) this.dropKeeper(row.sid, me.id);
    for (const row of this.sql("SELECT r.code FROM members m JOIN rooms r ON r.code=m.room WHERE m.user_id=? AND r.state IN ('lobby','running')", me.id)) this.roomLeave(me, { code: row.code }, ctx);
    for (const q of ['DELETE FROM tokens WHERE user_id=?', 'DELETE FROM sessions WHERE user_id=?', 'DELETE FROM members WHERE user_id=?', 'DELETE FROM tickets WHERE user_id=?', 'DELETE FROM users WHERE id=?']) this.sql(q, me.id);
    for (const q of ['DELETE FROM friends WHERE a=? OR b=?', 'DELETE FROM requests WHERE from_id=? OR to_id=?', 'DELETE FROM blocks WHERE user_id=? OR blocked_id=?', 'DELETE FROM inbox WHERE to_id=? OR from_id=?']) this.sql(q, me.id, me.id);
    // Reports someone made are theirs and go with them. Reports about them are kept for whoever runs the server, with the name and username as they were.
    this.sql('DELETE FROM reports WHERE from_id=?', me.id);
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
    this.sql('DELETE FROM grants WHERE expires < ?', now);
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
    const open = OPEN_ROUTES.has(route);
    if (open) { ctx.newToken = randomString(48, ID_ALPHABET); ctx.newTokenHash = await sha256(ctx.newToken); }
    else if (call.token) ctx.tokenHash = await sha256(call.token);
    try {
      // Passwords are hashed and checked here too. Tries are counted outside the transaction, so
      // a wrong password still counts.
      const body = call.body || {};
      if (route === 'POST /api/register' && body.password !== undefined) ctx.passHash = await hashPassword(cleanPassword(body.password, String(body.handle || '').trim().replace(/^@/, '')));
      if (route === 'POST /api/google/claim' && body.verifier !== undefined) ctx.verifierHash = await sha256(String(body.verifier));
      if (route === 'POST /api/login') {
        ctx.handle = String(body.handle ?? '').trim().replace(/^@/, '').toLowerCase();
        this.limit('login:' + ctx.ip, 40, 3600, ctx.now, 'Too many tries from this network. Wait an hour and try again.');
        // Ten tries per account from one network, so a stranger guessing cannot lock the owner out; fifty from everywhere.
        this.limit(`login@${ctx.handle}@${ctx.ip}`, 10, 900, ctx.now, 'Too many tries for this account. Wait 15 minutes and try again.');
        this.limit('login@' + ctx.handle, 50, 3600, ctx.now, 'Too many tries for this account. Wait an hour and try again.');
        ctx.passOk = await checkPassword(body.password, this.one('SELECT pass FROM users WHERE handle=?', ctx.handle)?.pass);
        if (ctx.passOk) this.sql('DELETE FROM limits WHERE key=?', `login@${ctx.handle}@${ctx.ip}`);
      }
      if (route === 'POST /api/password' && ctx.tokenHash) {
        const me = this.one('SELECT u.id, u.handle, u.pass FROM tokens t JOIN users u ON u.id=t.user_id WHERE t.hash=?', ctx.tokenHash);
        if (me) {
          if (me.pass) { this.limit('pass:' + me.id, 10, 900, ctx.now); ctx.passOk = await checkPassword(body.current, me.pass); }
          ctx.passHash = await hashPassword(cleanPassword(body.password, me.handle));
        }
      }
      return { status: 200, body: this.tx(() => this.answer(route, call, ctx)) };
    } catch (error) {
      if (error instanceof ApiError) return { status: error.status, body: { error: error.message } };
      throw error;
    }
  }

  answer(route, call, ctx) {
    this.clean(ctx.now);
    if (route === 'GET /health') return { ok: true, service: 'haven-hub', version: VERSION, google: Boolean(this.config.google), now: ctx.now };
    if (route === 'POST /api/register') return this.register(call.body, ctx);
    if (route === 'POST /api/login') return this.login(call.body, ctx);
    if (route === 'POST /api/google/claim') return this.googleClaim(call.body, ctx);
    if (route === 'POST /api/link' || route === 'POST /api/link/claim') throw new ApiError(410, 'Update Haven: you now sign in with your username and password.');
    if (!ctx.tokenHash) throw new ApiError(401, 'Sign in to use Haven with friends.');
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
      case 'POST /api/password': return this.password(me, body, ctx);
      case 'POST /api/google/link': return this.googleLink(me, body, ctx);
      case 'POST /api/google/unlink': return this.googleUnlink(me);
      case 'PUT /api/state': return this.statePut(me, body, ctx);
      case 'GET /api/state': return this.stateGet(me);
      case 'GET /api/news': return this.news(me, query, ctx);
      case 'GET /api/sanctuaries': return this.sanctuaries(me, query, ctx);
      case 'POST /api/sanctuaries': return this.sanctuaryCreate(me, body, ctx);
      case 'POST /api/sanctuaries/join': return this.sanctuaryJoin(me, body, ctx);
      case 'POST /api/sanctuaries/invite': return this.sanctuaryInvite(me, body, ctx);
      case 'POST /api/sanctuaries/leave': return this.sanctuaryLeave(me, body, ctx);
      case 'POST /api/sanctuaries/edit': return this.sanctuaryEdit(me, body, ctx);
      case 'POST /api/sanctuaries/campfire': return this.sanctuaryCampfire(me, body, ctx);
      case 'POST /api/sanctuaries/care': return this.sanctuaryCare(me, body, ctx);
      case 'POST /api/sanctuaries/pal': return this.sanctuaryPal(me, body, ctx);
      case 'POST /api/report': return this.report(me, body, ctx);
      case 'POST /api/logout': return this.logout(me, body, ctx);
      case 'POST /api/account/delete': return this.deleteAccount(me, body, ctx);
      case 'POST /api/live/ticket': return this.liveTicket(me, body, ctx);
      default:
    }
    let m;
    if (call.method === 'GET' && (m = call.path.match(/^\/api\/friends\/([a-z0-9]{12})$/))) return this.friendPage(me, m[1], query, ctx);
    if (call.method === 'GET' && (m = call.path.match(/^\/api\/rooms\/([A-Za-z0-9]{6})$/))) return this.roomGet(me, m[1], ctx);
    if (call.method === 'GET' && (m = call.path.match(/^\/api\/sanctuaries\/([a-z0-9]{12})$/))) return this.sanctuaryGet(me, m[1], ctx);
    throw new ApiError(404, 'Not found.');
  }
}
