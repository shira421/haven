// Everything Haven keeps on the device, and every change that can be made to it.
// The state is one JSON document. Each action checks its input, changes the state, saves, and tells listeners.
import { SPECIES, STARTERS, speciesById } from './catalog.js';
import { LIMITS, clamp, coinsFor, sizeFor, levelFor, landSide, levelReward, streaks, availability, newAchievements, doneSessions, progress, newId } from './core.js';

export const STATE_VERSION = 1;
export const TAG_COLOURS = ['#4f6bed', '#2f8f63', '#c2456b', '#d9822b', '#7a5af8', '#0e9aa7', '#b5651d', '#687089'];
export const DEFAULT_TAGS = [
  { id: 'study', name: 'Study', colour: TAG_COLOURS[0] },
  { id: 'work', name: 'Work', colour: TAG_COLOURS[1] },
  { id: 'reading', name: 'Reading', colour: TAG_COLOURS[4] },
  { id: 'other', name: 'Other', colour: TAG_COLOURS[7] },
];
export const DEFAULT_SETTINGS = {
  minutes: 25,
  mode: 'timer', // timer | stopwatch | pomodoro
  species: 'clover',
  tag: 'study',
  deep: true, // leaving Haven during a session withers the plant
  allowance: 15, // seconds away that are forgiven
  keepAwake: true,
  autoPlace: true,
  pomodoro: { focus: 25, short: 5, long: 15, rounds: 4, auto: true },
  sound: 'off',
  volume: 0.5,
  chime: true,
  haptics: true,
  reminder: { on: false, time: '19:00' },
  theme: 'system', // system | light | dark
};

export function freshState(now = Date.now()) {
  return {
    v: STATE_VERSION,
    created: now,
    updated: now,
    coins: 0,
    unlocked: [...STARTERS],
    items: [], // {id, s: species id, z: size 1-3, at, from?}
    haven: { tiles: {} }, // "row,col" → item id
    sessions: [], // finished and failed sessions, oldest first
    active: null, // the session in progress
    cycle: null, // a pomodoro run in progress: {round, rounds, breakUntil, breakKind}
    tags: DEFAULT_TAGS.map(t => ({ ...t })),
    achieved: {}, // achievement id → when
    level: 1,
    social: { friends: 0, giftsSent: 0 },
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);

/** Turn whatever was stored into a valid state. Unknown or broken parts fall back to defaults. */
export function migrate(raw, now = Date.now()) {
  const base = freshState(now);
  if (!isObj(raw)) return base;
  const state = { ...base };
  state.created = num(raw.created, now);
  state.updated = num(raw.updated, now);
  state.coins = Math.max(0, Math.floor(num(raw.coins, 0)));
  state.unlocked = [...new Set([...STARTERS, ...(Array.isArray(raw.unlocked) ? raw.unlocked : [])])].filter(id => speciesById(id));
  state.items = (Array.isArray(raw.items) ? raw.items : [])
    .filter(i => isObj(i) && typeof i.id === 'string' && speciesById(i.s))
    .map(i => ({ id: i.id, s: i.s, z: clamp(Math.round(num(i.z, 1)), 1, 3), at: num(i.at, now), ...(typeof i.from === 'string' ? { from: i.from.slice(0, 40) } : {}) }));
  const itemIds = new Set(state.items.map(i => i.id));
  state.haven = { tiles: {} };
  const seen = new Set();
  if (isObj(raw.haven) && isObj(raw.haven.tiles)) {
    for (const [key, id] of Object.entries(raw.haven.tiles)) {
      if (/^\d{1,2},\d{1,2}$/.test(key) && itemIds.has(id) && !seen.has(id)) { state.haven.tiles[key] = id; seen.add(id); }
    }
  }
  state.sessions = (Array.isArray(raw.sessions) ? raw.sessions : [])
    .filter(s => isObj(s) && typeof s.id === 'string' && Number.isFinite(s.start) && (s.status === 'done' || s.status === 'failed'))
    .map(s => ({
      id: s.id, start: s.start, end: num(s.end, s.start), planned: clamp(num(s.planned, 0), 0, LIMITS.maxMinutes),
      minutes: clamp(Math.floor(num(s.minutes, 0)), 0, LIMITS.maxMinutes), status: s.status,
      species: speciesById(s.species) ? s.species : 'clover', tag: typeof s.tag === 'string' ? s.tag : 'other',
      mode: ['timer', 'stopwatch', 'pomodoro'].includes(s.mode) ? s.mode : 'timer', coins: Math.max(0, Math.floor(num(s.coins, 0))),
      ...(s.others ? { others: clamp(Math.floor(num(s.others, 0)), 0, 7) } : {}), ...(typeof s.room === 'string' ? { room: s.room } : {}),
      ...(typeof s.note === 'string' && s.note ? { note: s.note.slice(0, 200) } : {}), ...(typeof s.reason === 'string' ? { reason: s.reason } : {}),
      ...(s.synced ? { synced: true } : {}),
    }))
    .sort((a, b) => a.start - b.start);
  state.active = isObj(raw.active) && typeof raw.active.id === 'string' && Number.isFinite(raw.active.start) && speciesById(raw.active.species) ? { ...raw.active } : null;
  const cy = raw.cycle;
  state.cycle = isObj(cy) && Number.isInteger(cy.round) && cy.round >= 1 && Number.isInteger(cy.rounds) && cy.rounds >= cy.round
    ? { round: cy.round, rounds: cy.rounds, breakUntil: Number.isFinite(cy.breakUntil) ? cy.breakUntil : null, breakKind: cy.breakKind === 'long' ? 'long' : 'short', ...(cy.done ? { done: true } : {}) } : null;
  const tags = (Array.isArray(raw.tags) ? raw.tags : []).filter(t => isObj(t) && typeof t.id === 'string' && typeof t.name === 'string' && t.name.trim())
    .map(t => ({ id: t.id, name: t.name.trim().slice(0, 24), colour: /^#[0-9a-f]{6}$/i.test(t.colour) ? t.colour : TAG_COLOURS[7] }));
  state.tags = tags.length ? tags : base.tags;
  state.achieved = isObj(raw.achieved) ? Object.fromEntries(Object.entries(raw.achieved).filter(([, t]) => Number.isFinite(t))) : {};
  state.social = { friends: Math.max(0, Math.floor(num(raw.social?.friends, 0))), giftsSent: Math.max(0, Math.floor(num(raw.social?.giftsSent, 0))) };
  const s = isObj(raw.settings) ? raw.settings : {};
  const d = DEFAULT_SETTINGS;
  state.settings = {
    minutes: clamp(Math.round(num(s.minutes, d.minutes) / LIMITS.step) * LIMITS.step, LIMITS.minMinutes, LIMITS.maxMinutes),
    mode: ['timer', 'stopwatch', 'pomodoro'].includes(s.mode) ? s.mode : d.mode,
    species: speciesById(s.species) && state.unlocked.includes(s.species) ? s.species : state.unlocked[0],
    tag: state.tags.some(t => t.id === s.tag) ? s.tag : state.tags[0].id,
    deep: typeof s.deep === 'boolean' ? s.deep : d.deep,
    allowance: clamp(Math.round(num(s.allowance, d.allowance)), LIMITS.minAllowance, LIMITS.maxAllowance),
    keepAwake: typeof s.keepAwake === 'boolean' ? s.keepAwake : d.keepAwake,
    autoPlace: typeof s.autoPlace === 'boolean' ? s.autoPlace : d.autoPlace,
    pomodoro: {
      focus: clamp(Math.round(num(s.pomodoro?.focus, d.pomodoro.focus)), 5, 120),
      short: clamp(Math.round(num(s.pomodoro?.short, d.pomodoro.short)), 1, 30),
      long: clamp(Math.round(num(s.pomodoro?.long, d.pomodoro.long)), 1, 60),
      rounds: clamp(Math.round(num(s.pomodoro?.rounds, d.pomodoro.rounds)), 2, 8),
      auto: typeof s.pomodoro?.auto === 'boolean' ? s.pomodoro.auto : d.pomodoro.auto,
    },
    sound: typeof s.sound === 'string' ? s.sound : d.sound,
    volume: clamp(num(s.volume, d.volume), 0, 1),
    chime: typeof s.chime === 'boolean' ? s.chime : d.chime,
    haptics: typeof s.haptics === 'boolean' ? s.haptics : d.haptics,
    reminder: { on: Boolean(s.reminder?.on), time: /^\d{2}:\d{2}$/.test(s.reminder?.time || '') ? s.reminder.time : d.reminder.time },
    theme: ['system', 'light', 'dark'].includes(s.theme) ? s.theme : d.theme,
  };
  state.level = levelFor(doneSessions(state.sessions).reduce((n, x) => n + x.minutes, 0)).level;
  return state;
}

/**
 * Join the state on this device with a backup from another one. Nothing earned is lost:
 * sessions, plants, animals, unlocks and achievements are combined; the newer copy decides the rest.
 */
export function mergeStates(local, remote, now = Date.now()) {
  const a = migrate(local, now), b = migrate(remote, now);
  const [newer, older] = a.updated >= b.updated ? [a, b] : [b, a];
  const out = structuredClone(newer);
  const sessions = new Map(older.sessions.map(s => [s.id, s]));
  for (const s of newer.sessions) sessions.set(s.id, s);
  out.sessions = [...sessions.values()].sort((x, y) => x.start - y.start);
  const items = new Map(older.items.map(i => [i.id, i]));
  for (const i of newer.items) items.set(i.id, i);
  out.items = [...items.values()].sort((x, y) => x.at - y.at);
  out.unlocked = [...new Set([...newer.unlocked, ...older.unlocked])];
  out.achieved = { ...older.achieved, ...newer.achieved };
  for (const [id, t] of Object.entries(older.achieved)) out.achieved[id] = Math.min(t, out.achieved[id] ?? t);
  out.social = { friends: Math.max(a.social.friends, b.social.friends), giftsSent: Math.max(a.social.giftsSent, b.social.giftsSent) };
  out.active = a.active; // a running session belongs to this device
  out.updated = now;
  return migrate(out, now);
}

const memoryStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

export class Store {
  constructor({ storage = null, key = 'haven-state', now = () => Date.now() } = {}) {
    this.storage = storage || memoryStorage();
    this.key = key;
    this.now = now;
    this.listeners = new Set();
    let raw = null;
    try { raw = JSON.parse(this.storage.getItem(key) || 'null'); } catch { raw = null; }
    this.state = migrate(raw, now());
    this.saveError = null;
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Save and tell listeners. `what` names the change so views can redraw only what they need. */
  commit(what = 'state') {
    this.state.updated = this.now();
    try { this.storage.setItem(this.key, JSON.stringify(this.state)); this.saveError = null; }
    catch (error) { this.saveError = error; }
    for (const fn of this.listeners) fn(what, this.state);
  }

  // ——— Lookups ———

  totalMinutes() { return doneSessions(this.state.sessions).reduce((n, s) => n + s.minutes, 0); }
  level() { return levelFor(this.totalMinutes()); }
  side() { return landSide(this.level().level); }
  streak() { return streaks(this.state.sessions, this.now()); }
  item(id) { return this.state.items.find(i => i.id === id) || null; }
  placedIds() { return new Set(Object.values(this.state.haven.tiles)); }
  /** Plants and animals that are owned but not standing in the haven. */
  stored() { const placed = this.placedIds(); return this.state.items.filter(i => !placed.has(i.id)); }
  freeTiles() {
    const side = this.side(), free = [];
    for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) if (!this.state.haven.tiles[`${r},${c}`]) free.push(`${r},${c}`);
    return free;
  }

  // ——— Settings and tags ———

  set(patch) {
    this.state.settings = migrate({ ...this.state, settings: { ...this.state.settings, ...patch } }, this.now()).settings;
    this.commit('settings');
  }
  addTag(name) {
    const clean = String(name || '').trim().slice(0, 24);
    if (!clean) return { ok: false, error: 'Give the tag a name.' };
    if (this.state.tags.some(t => t.name.toLowerCase() === clean.toLowerCase())) return { ok: false, error: 'You already have a tag with that name.' };
    if (this.state.tags.length >= 12) return { ok: false, error: 'You can keep up to 12 tags. Remove one first.' };
    const tag = { id: newId('t'), name: clean, colour: TAG_COLOURS[this.state.tags.length % TAG_COLOURS.length] };
    this.state.tags.push(tag);
    this.commit('tags');
    return { ok: true, tag };
  }
  removeTag(id) {
    if (this.state.tags.length <= 1) return { ok: false, error: 'Keep at least one tag.' };
    this.state.tags = this.state.tags.filter(t => t.id !== id);
    if (this.state.settings.tag === id) this.state.settings.tag = this.state.tags[0].id;
    this.commit('tags');
    return { ok: true };
  }
  tagName(id) { return this.state.tags.find(t => t.id === id)?.name || 'Other'; }
  tagColour(id) { return this.state.tags.find(t => t.id === id)?.colour || TAG_COLOURS[7]; }

  // ——— Sessions ———

  /** Start a session. `minutes` 0 means a stopwatch. */
  begin({ minutes, species, tag, mode = 'timer', deep = this.state.settings.deep, room = null, round = null, start = this.now(), id = newId('s') }) {
    if (this.state.active) return { ok: false, error: 'A session is already running.' };
    if (!speciesById(species) || !this.state.unlocked.includes(species)) return { ok: false, error: 'Choose a plant or an animal you have unlocked.' };
    const planned = mode === 'stopwatch' ? 0 : clamp(Math.round(minutes), 1, LIMITS.maxMinutes);
    this.state.active = { id, start, planned, species, tag: this.state.tags.some(t => t.id === tag) ? tag : this.state.tags[0].id, mode, deep: Boolean(deep), allowance: this.state.settings.allowance, ...(room ? { room } : {}), ...(round ? { round } : {}) };
    this.commit('session');
    return { ok: true, active: this.state.active };
  }

  /** Note that Haven was open and in front at this moment, in case it is closed without warning. */
  beat(at) {
    if (!this.state.active || this.state.active.hiddenAt) return;
    this.state.active.beat = at;
    this.commit('away');
  }
  /** The server has seen this session start, so it will vouch for it when it ends. */
  markRemote() {
    if (!this.state.active || this.state.active.remote) return;
    this.state.active.remote = true;
    this.commit('away');
  }
  /** Where a pomodoro run stands, or null when none is in progress. */
  setCycle(cycle) {
    this.state.cycle = cycle;
    this.commit('cycle');
  }

  /** Record when Haven was left, so a restart can still tell how long it was away. */
  markHidden(at) {
    if (!this.state.active || this.state.active.hiddenAt) return;
    this.state.active.hiddenAt = at;
    this.commit('away');
  }
  markVisible() {
    if (!this.state.active?.hiddenAt) return;
    delete this.state.active.hiddenAt;
    this.commit('away');
  }

  /** Stop in the first seconds: nothing is recorded. */
  cancel() {
    if (!this.state.active) return { ok: false };
    this.state.active = null;
    this.commit('session');
    return { ok: true };
  }

  /** The session ran its course. Adds the plant or animal, coins, and anything newly earned. */
  finish({ others = 0, end = this.now() } = {}) {
    const active = this.state.active;
    if (!active) return { ok: false, error: 'No session is running.' };
    const p = progress(active, end);
    const minutes = active.planned ? active.planned : Math.floor(p.elapsed / 60);
    if (active.planned && !p.done) return { ok: false, error: 'The session has not finished yet.' };
    this.state.active = null;
    if (!active.planned && minutes < LIMITS.stopwatchMinMinutes) {
      this.commit('session');
      return { ok: true, short: true, minutes };
    }
    const before = this.level().level;
    const streakBefore = this.streak().current;
    const coins = coinsFor({ minutes, streak: streakBefore, others });
    const session = { id: active.id, start: active.start, end: active.planned ? active.start + active.planned * 60000 : end, planned: active.planned, minutes, status: 'done', species: active.species, tag: active.tag, mode: active.mode, coins, ...(others ? { others } : {}), ...(active.room ? { room: active.room } : {}) };
    this.state.sessions.push(session);
    const item = { id: newId('i'), s: active.species, z: sizeFor(minutes), at: session.end };
    this.state.items.push(item);
    this.state.coins += coins;
    let placedAt = null;
    if (this.state.settings.autoPlace) placedAt = this.placeAnywhere(item.id, false);
    const level = this.level().level;
    let levelCoins = 0;
    for (let l = before + 1; l <= level; l++) levelCoins += levelReward(l);
    this.state.coins += levelCoins;
    this.state.level = level;
    const earned = this.recordAchievements();
    this.commit('session');
    return { ok: true, session, coins, item, placedAt, levelUp: level > before ? { level, coins: levelCoins, side: landSide(level), grew: landSide(level) > landSide(before) } : null, achievements: earned, streak: this.streak().current };
  }

  /** The session was given up or Haven was left for too long. */
  fail(reason = 'gave-up', end = this.now()) {
    const active = this.state.active;
    if (!active) return { ok: false, error: 'No session is running.' };
    this.state.active = null;
    const session = { id: active.id, start: active.start, end, planned: active.planned, minutes: 0, status: 'failed', species: active.species, tag: active.tag, mode: active.mode, coins: 0, reason, ...(active.room ? { room: active.room } : {}) };
    this.state.sessions.push(session);
    this.commit('session');
    return { ok: true, session };
  }

  deleteSession(id) {
    const before = this.state.sessions.length;
    this.state.sessions = this.state.sessions.filter(s => s.id !== id);
    if (this.state.sessions.length !== before) this.commit('sessions');
  }
  setNote(id, note) {
    const s = this.state.sessions.find(x => x.id === id);
    if (!s) return;
    const clean = String(note || '').trim().slice(0, 200);
    if (clean) s.note = clean; else delete s.note;
    this.commit('sessions');
  }
  markSynced(ids) {
    let changed = false;
    for (const s of this.state.sessions) if (ids.includes(s.id) && !s.synced) { s.synced = true; changed = true; }
    if (changed) this.commit('sync');
  }

  recordAchievements() {
    const earned = [];
    // Each achievement can add coins, which never unlocks another one, so one pass is enough.
    for (const a of newAchievements(this.state, this.now())) {
      this.state.achieved[a.id] = this.now();
      this.state.coins += a.coins;
      earned.push(a);
    }
    return earned;
  }
  /** Check achievements after a change that is not a session (a new friend, an unlock, a placement). */
  checkAchievements() {
    const earned = this.recordAchievements();
    if (earned.length) this.commit('achievements');
    return earned;
  }

  // ——— Collection ———

  unlock(id) {
    const species = speciesById(id);
    if (!species) return { ok: false, error: 'That species does not exist.' };
    const how = availability(this.state, species, this.now());
    if (how === 'owned') return { ok: true, how };
    if (how === 'locked') return { ok: false, error: `You need ${species.price - this.state.coins} more coins.` };
    if (how === 'buy') this.state.coins -= species.price;
    this.state.unlocked.push(id);
    const earned = this.recordAchievements();
    this.commit('collection');
    return { ok: true, how, achievements: earned };
  }

  /** What sending this species as a gift costs. */
  giftPrice(id) { const s = speciesById(id); return s ? Math.max(50, Math.round(s.price / 2)) : 0; }
  payForGift(id) {
    const price = this.giftPrice(id);
    if (!this.state.unlocked.includes(id)) return { ok: false, error: 'You can only gift species you have unlocked.' };
    if (this.state.coins < price) return { ok: false, error: `You need ${price - this.state.coins} more coins.` };
    this.state.coins -= price;
    this.state.social.giftsSent += 1;
    const earned = this.recordAchievements();
    this.commit('collection');
    return { ok: true, price, achievements: earned };
  }
  refundGift(id) {
    this.state.coins += this.giftPrice(id);
    this.state.social.giftsSent = Math.max(0, this.state.social.giftsSent - 1);
    this.commit('collection');
  }
  /** A gift from a friend arrives as a plant or animal ready to place. */
  receiveGift(speciesId, from, giftId) {
    if (!speciesById(speciesId)) return null;
    const id = 'g' + giftId;
    if (this.item(id)) return null; // already received
    const item = { id, s: speciesId, z: 2, at: this.now(), from: String(from || 'A friend').slice(0, 40) };
    this.state.items.push(item);
    if (this.state.settings.autoPlace) this.placeAnywhere(id, false);
    this.commit('haven');
    return item;
  }
  setFriendCount(n) {
    if (this.state.social.friends === n) return [];
    this.state.social.friends = n;
    const earned = this.recordAchievements();
    this.commit('social');
    return earned;
  }

  // ——— Haven ———

  /** Put an item on a tile. An item already standing somewhere moves; a tile already taken swaps. */
  place(itemId, row, col) {
    const side = this.side();
    if (!this.item(itemId)) return { ok: false, error: 'That item is not yours.' };
    if (!(row >= 0 && col >= 0 && row < side && col < side)) return { ok: false, error: 'That tile is outside your land.' };
    const key = `${row},${col}`;
    const tiles = this.state.haven.tiles;
    const from = Object.keys(tiles).find(k => tiles[k] === itemId) || null;
    const occupant = tiles[key] || null;
    if (from === key) return { ok: true };
    if (from) delete tiles[from];
    if (occupant && from) tiles[from] = occupant; // swap places
    tiles[key] = itemId;
    const earned = this.recordAchievements();
    this.commit('haven');
    return { ok: true, achievements: earned, displaced: occupant && !from ? occupant : null };
  }
  /** Put an item on a free tile, chosen from the item's id so it is stable. Returns the tile or null. */
  placeAnywhere(itemId, commit = true) {
    const free = this.freeTiles();
    if (!free.length || !this.item(itemId) || this.placedIds().has(itemId)) return null;
    let h = 0;
    for (const ch of itemId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const key = free[h % free.length];
    this.state.haven.tiles[key] = itemId;
    if (commit) { this.recordAchievements(); this.commit('haven'); }
    return key;
  }
  /** Take whatever stands on a tile back into storage. */
  unplace(row, col) {
    const key = `${row},${col}`;
    if (!this.state.haven.tiles[key]) return { ok: false };
    delete this.state.haven.tiles[key];
    this.commit('haven');
    return { ok: true };
  }
  /** Let an item go for good. */
  release(itemId) {
    const tiles = this.state.haven.tiles;
    for (const k of Object.keys(tiles)) if (tiles[k] === itemId) delete tiles[k];
    this.state.items = this.state.items.filter(i => i.id !== itemId);
    this.commit('haven');
  }

  // ——— Backup ———

  /** What other people may see: level, totals and the haven's layout. */
  publicCard() {
    const side = this.side();
    const tiles = [];
    for (const [key, id] of Object.entries(this.state.haven.tiles)) {
      const item = this.item(id);
      const [r, c] = key.split(',').map(Number);
      if (item && r < side && c < side) tiles.push([r, c, item.s, item.z]);
    }
    const streak = this.streak();
    return { level: this.level().level, minutes: this.totalMinutes(), sessions: doneSessions(this.state.sessions).length, streak: streak.current, best: streak.best, species: this.state.unlocked.length, of: SPECIES.length, side, tiles };
  }
  exportState() { const copy = structuredClone(this.state); copy.active = null; copy.cycle = null; return copy; }
  importState(raw, { merge = true } = {}) {
    if (!raw || typeof raw !== 'object' || raw.v !== STATE_VERSION) return { ok: false, error: 'That is not a Haven backup.' };
    const active = this.state.active;
    this.state = merge ? mergeStates(this.state, raw, this.now()) : migrate(raw, this.now());
    this.state.active = active;
    this.commit('state');
    return { ok: true };
  }
  reset() {
    this.state = freshState(this.now());
    this.commit('state');
  }
}
