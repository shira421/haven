// Everything Haven keeps on the device, and every change that can be made to it.
// The state is one JSON document. Each action checks its input, changes the state, saves, and tells listeners.
import { SPECIES, STARTERS, speciesById, RENAMED, BREED_IDS } from './catalog.js';
import { LIMITS, CARE, clamp, coinsFor, treatsFor, sizeFor, levelFor, landSide, levelReward, streaks, availability, newAchievements, doneSessions, progress, newId, hungerOf, bondLevel, bondReward, canPet } from './core.js';

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
  allowance: 30, // seconds away that are forgiven
  keepAwake: false, // the phone may lock during a session; that does not count as leaving
  autoPlace: true,
  pomodoro: { focus: 25, short: 5, long: 15, rounds: 4, auto: true },
  sound: 'off',
  volume: 0.5,
  chime: true,
  haptics: true,
  reminder: { on: false, time: '19:00' },
  theme: 'system', // system | light | dark
  // What Haven may notify about. Each is still subject to the phone's own permission.
  notify: { done: true, away: true, friends: true, social: true, streak: true, hungry: true },
  rev: 2, // settings from before 1.3 kept the screen on by default; rev 2 lets the phone lock
};
export const NOTIFY_KINDS = ['done', 'away', 'friends', 'social', 'streak', 'hungry'];

export function freshState(now = Date.now()) {
  return {
    v: STATE_VERSION,
    created: now,
    updated: now,
    coins: 0,
    food: 3, // treats, for feeding animals
    unlocked: [...STARTERS],
    items: [], // {id, s: species id, z: size 1-3, at, from?} and for animals {name?, fed, pet, bond}
    haven: { spots: {} }, // item id → [u, v]: where it stands on the land, 0 to the land's side each way
    care: { feeds: 0 },
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
  const current = id => speciesById(id)?.id || id; // a renamed species under its new id
  state.unlocked = [...new Set([...STARTERS, ...(Array.isArray(raw.unlocked) ? raw.unlocked : []).map(current)])].filter(id => speciesById(id));
  state.food = clamp(Math.floor(num(raw.food, base.food)), 0, 9999);
  state.care = { feeds: Math.max(0, Math.floor(num(raw.care?.feeds, 0))) };
  state.items = (Array.isArray(raw.items) ? raw.items : [])
    .filter(i => isObj(i) && typeof i.id === 'string' && speciesById(i.s))
    .map(i => {
      const s = current(i.s);
      // A shiba from before dogs had breeds stays a shiba.
      const breed = s === 'dog' ? (BREED_IDS.includes(i.breed) ? i.breed : RENAMED[i.s] === 'dog' ? i.s : 'mixed') : null;
      return {
        id: i.id, s, z: clamp(Math.round(num(i.z, 1)), 1, 3), at: num(i.at, now), ...(typeof i.from === 'string' ? { from: i.from.slice(0, 40) } : {}),
        ...(speciesById(s).kind === 'animal' ? { fed: num(i.fed, num(i.at, now)), pet: num(i.pet, 0), bond: clamp(Math.floor(num(i.bond, 0)), 0, CARE.maxBond), ...(typeof i.name === 'string' && i.name.trim() ? { name: i.name.trim().slice(0, 20) } : {}) } : {}),
        ...(breed ? { breed } : {}),
      };
    });
  const itemIds = new Set(state.items.map(i => i.id));
  state.haven = { spots: {} };
  const inside = n => Number.isFinite(n) && n >= 0 && n <= 10;
  if (isObj(raw.haven) && isObj(raw.haven.spots)) {
    for (const [id, at] of Object.entries(raw.haven.spots)) if (itemIds.has(id) && Array.isArray(at) && inside(at[0]) && inside(at[1])) state.haven.spots[id] = [at[0], at[1]];
  } else if (isObj(raw.haven) && isObj(raw.haven.tiles)) {
    // Havens saved before things could stand anywhere: each tile becomes the middle of that tile.
    for (const [key, id] of Object.entries(raw.haven.tiles)) {
      if (/^\d{1,2},\d{1,2}$/.test(key) && itemIds.has(id) && !state.haven.spots[id]) { const [r, c] = key.split(',').map(Number); if (r < 10 && c < 10) state.haven.spots[id] = [r + 0.5, c + 0.5]; }
    }
  }
  state.sessions = (Array.isArray(raw.sessions) ? raw.sessions : [])
    .filter(s => isObj(s) && typeof s.id === 'string' && Number.isFinite(s.start) && (s.status === 'done' || s.status === 'failed'))
    .map(s => ({
      id: s.id, start: s.start, end: num(s.end, s.start), planned: clamp(num(s.planned, 0), 0, LIMITS.maxMinutes),
      minutes: clamp(Math.floor(num(s.minutes, 0)), 0, LIMITS.maxMinutes), status: s.status,
      species: speciesById(s.species) ? current(s.species) : 'clover', tag: typeof s.tag === 'string' ? s.tag : 'other',
      mode: ['timer', 'stopwatch', 'pomodoro'].includes(s.mode) ? s.mode : 'timer', coins: Math.max(0, Math.floor(num(s.coins, 0))),
      ...(s.others ? { others: clamp(Math.floor(num(s.others, 0)), 0, 7) } : {}), ...(s.strict === true ? { strict: true } : {}), ...(typeof s.room === 'string' ? { room: s.room } : {}),
      ...(typeof s.note === 'string' && s.note ? { note: s.note.slice(0, 200) } : {}), ...(typeof s.reason === 'string' ? { reason: s.reason } : {}),
      ...(s.synced ? { synced: true } : {}),
    }))
    .sort((a, b) => a.start - b.start);
  state.active = isObj(raw.active) && typeof raw.active.id === 'string' && Number.isFinite(raw.active.start) && speciesById(raw.active.species) ? { ...raw.active, species: current(raw.active.species) } : null;
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
    species: speciesById(s.species) && state.unlocked.includes(current(s.species)) ? current(s.species) : state.unlocked[0],
    tag: state.tags.some(t => t.id === s.tag) ? s.tag : state.tags[0].id,
    deep: typeof s.deep === 'boolean' ? s.deep : d.deep,
    allowance: clamp(Math.round(num(s.allowance, d.allowance)), LIMITS.minAllowance, LIMITS.maxAllowance),
    keepAwake: s.rev >= 2 && typeof s.keepAwake === 'boolean' ? s.keepAwake : d.keepAwake,
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
    notify: Object.fromEntries(NOTIFY_KINDS.map(k => [k, typeof s.notify?.[k] === 'boolean' ? s.notify[k] : d.notify[k]])),
    rev: d.rev,
  };
  state.level = levelFor(doneSessions(state.sessions).reduce((n, x) => n + x.minutes, 0)).level;
  return state;
}

/** A haven nothing has happened in yet: a new install, or a phone just signed out. */
export function isPristine(state) {
  return !state.sessions.length && !state.items.length && !state.coins && !Object.keys(state.achieved).length && !state.active;
}

/**
 * Join the state on this device with a copy from somewhere it shares no saved history with: the
 * account on a phone that has just signed in, or a backup file. Nothing earned is lost: sessions,
 * plants, animals, unlocks and achievements are combined.
 * - A haven nothing has happened in yet (a new phone) takes the other copy as it is.
 * - Two copies of the same haven (they share sessions or plants) keep the higher coins and treats,
 *   since adding them would count the same coins twice, and "newer" only means opened more lately:
 *   an old phone opened today must not take coins away. Layout and settings come from the newer.
 * - Two different havens being joined (one kept from before signing in) add their coins and treats.
 */
export function mergeStates(local, remote, now = Date.now()) {
  const a = migrate(local, now), b = migrate(remote, now);
  if (isPristine(a)) return migrate({ ...structuredClone(b), active: a.active, cycle: a.cycle, updated: now }, now);
  if (isPristine(b)) return migrate({ ...structuredClone(a), updated: now }, now);
  const [newer, older] = a.updated >= b.updated ? [a, b] : [b, a];
  const ids = st => new Set([...st.sessions.map(x => x.id), ...st.items.map(x => x.id)]);
  const olderIds = ids(older), shared = [...ids(newer)].some(id => olderIds.has(id));
  const out = structuredClone(newer);
  const sessions = new Map(older.sessions.map(s => [s.id, s]));
  for (const s of newer.sessions) sessions.set(s.id, s);
  out.sessions = [...sessions.values()].sort((x, y) => x.start - y.start);
  const items = new Map(older.items.map(i => [i.id, i]));
  for (const i of newer.items) items.set(i.id, i);
  out.items = [...items.values()].sort((x, y) => x.at - y.at);
  // Something only the older copy had keeps its place, so joining never empties a haven.
  for (const [id, at] of Object.entries(older.haven.spots)) if (!newer.items.some(i => i.id === id) && !out.haven.spots[id]) out.haven.spots[id] = at;
  out.unlocked = [...new Set([...newer.unlocked, ...older.unlocked])];
  out.achieved = { ...older.achieved, ...newer.achieved };
  for (const [id, t] of Object.entries(older.achieved)) out.achieved[id] = Math.min(t, out.achieved[id] ?? t);
  if (!shared) {
    out.coins = a.coins + b.coins;
    out.food = clamp(a.food + b.food, 0, 9999);
  } else {
    out.coins = Math.max(a.coins, b.coins);
    out.food = Math.max(a.food, b.food);
  }
  out.social = { friends: Math.max(a.social.friends, b.social.friends), giftsSent: Math.max(a.social.giftsSent, b.social.giftsSent) };
  out.care = { feeds: Math.max(a.care.feeds, b.care.feeds) };
  out.created = Math.min(a.created, b.created);
  out.active = a.active; // a running session belongs to this device
  out.cycle = a.cycle;
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
  placedIds() { return new Set(Object.keys(this.state.haven.spots)); }
  /** Plants, animals and nature that are owned but not standing in the haven. */
  stored() { const placed = this.placedIds(); return this.state.items.filter(i => !placed.has(i.id)); }
  /** How many things the land holds: one for each tile's worth of ground. */
  capacity() { return this.side() ** 2; }
  /** How many more things fit. */
  room() { return Math.max(0, this.capacity() - Object.keys(this.state.haven.spots).length); }
  /** Keep a point on the land, a little in from the edge. */
  onLand(u, v) { const side = this.side(), m = 0.4; return [clamp(u, m, side - m), clamp(v, m, side - m)]; }
  /** A free-looking spot: of a handful of candidates, the one farthest from everything else. `seed` keeps it stable. */
  suggestSpot(seed) {
    const side = this.side(), taken = Object.values(this.state.haven.spots);
    let h = 2166136261;
    for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    const rand = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
    let best = null, bestGap = -1;
    for (let i = 0; i < 16; i++) {
      const p = this.onLand(0.5 + rand() * (side - 1), 0.5 + rand() * (side - 1));
      const gap = taken.reduce((n, t) => Math.min(n, Math.hypot(t[0] - p[0], t[1] - p[1])), 99);
      if (gap > bestGap) { bestGap = gap; best = p; }
    }
    return best.map(n => Math.round(n * 100) / 100);
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
  begin({ minutes, species, tag, mode = 'timer', deep = this.state.settings.deep, room = null, strict = false, round = null, start = this.now(), id = newId('s') }) {
    if (this.state.active) return { ok: false, error: 'A session is already running.' };
    if (!speciesById(species) || !this.state.unlocked.includes(species)) return { ok: false, error: 'Choose a plant or an animal you have unlocked.' };
    const planned = mode === 'stopwatch' ? 0 : clamp(Math.round(minutes), 1, LIMITS.maxMinutes);
    const least = speciesById(species).minMinutes || 0;
    if (planned && planned < least) return { ok: false, error: `A ${speciesById(species).name.toLowerCase()} takes at least ${least} min.` };
    this.state.active = { id, start, planned, species, tag: this.state.tags.some(t => t.id === tag) ? tag : this.state.tags[0].id, mode, deep: Boolean(deep), allowance: this.state.settings.allowance, ...(room ? { room } : {}), ...(room && strict ? { strict: true } : {}), ...(round ? { round } : {}), ...(this.room() ? { spot: this.suggestSpot(id) } : {}) };
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
  finish({ others = 0, strict = false, end = this.now() } = {}) {
    const active = this.state.active;
    if (!active) return { ok: false, error: 'No session is running.' };
    const p = progress(active, end);
    const minutes = active.planned ? active.planned : Math.floor(p.elapsed / 60);
    if (active.planned && !p.done) return { ok: false, error: 'The session has not finished yet.' };
    this.state.active = null;
    const least = Math.max(LIMITS.stopwatchMinMinutes, speciesById(active.species).minMinutes || 0);
    if (!active.planned && minutes < least) {
      this.commit('session');
      return { ok: true, short: true, minutes, least };
    }
    const before = this.level().level;
    const streakBefore = this.streak().current;
    const coins = coinsFor({ minutes, streak: streakBefore, others, strict });
    const session = { id: active.id, start: active.start, end: active.planned ? active.start + active.planned * 60000 : end, planned: active.planned, minutes, status: 'done', species: active.species, tag: active.tag, mode: active.mode, coins, ...(others ? { others } : {}), ...(strict ? { strict: true } : {}), ...(active.room ? { room: active.room } : {}) };
    this.state.sessions.push(session);
    const item = this.newItem(newId('i'), active.species, sizeFor(minutes), session.end);
    this.state.coins += coins;
    const treats = treatsFor(minutes);
    this.state.food += treats;
    // It stays where it grew. If the land filled up meanwhile, it waits in storage.
    let placedAt = null;
    if (this.state.settings.autoPlace && this.room()) { placedAt = active.spot ? this.onLand(...active.spot) : this.suggestSpot(item.id); this.state.haven.spots[item.id] = placedAt; }
    const level = this.level().level;
    let levelCoins = 0;
    for (let l = before + 1; l <= level; l++) levelCoins += levelReward(l);
    this.state.coins += levelCoins;
    this.state.level = level;
    const earned = this.recordAchievements();
    this.commit('session');
    return { ok: true, session, coins, treats, item, placedAt, levelUp: level > before ? { level, coins: levelCoins, side: landSide(level), grew: landSide(level) > landSide(before) } : null, achievements: earned, streak: this.streak().current };
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

  /** Make a new plant, animal or nature item. Animals arrive fed. */
  newItem(id, species, size, at, from = null) {
    species = speciesById(species).id;
    const item = { id, s: species, z: size, at, ...(from ? { from } : {}), ...(speciesById(species).kind === 'animal' ? { fed: at, pet: 0, bond: 0 } : {}), ...(species === 'dog' ? { breed: 'mixed' } : {}) };
    this.state.items.push(item);
    return item;
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
    const item = this.newItem(id, speciesId, 2, this.now(), String(from || 'A friend').slice(0, 40));
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

  /** Stand an item at a point on the land, or move it there. */
  place(itemId, u, v) {
    if (!this.item(itemId)) return { ok: false, error: 'That item is not yours.' };
    if (!Number.isFinite(u) || !Number.isFinite(v)) return { ok: false, error: 'That spot is outside your land.' };
    const spots = this.state.haven.spots;
    if (!spots[itemId] && !this.room()) return { ok: false, error: 'Your land is full. Put something in storage first.' };
    spots[itemId] = this.onLand(u, v).map(n => Math.round(n * 100) / 100);
    const earned = this.recordAchievements();
    this.commit('haven');
    return { ok: true, achievements: earned, at: spots[itemId] };
  }
  /** Stand an item on a free-looking spot. Returns the spot, or null when the land is full. */
  placeAnywhere(itemId, commit = true) {
    if (!this.room() || !this.item(itemId) || this.state.haven.spots[itemId]) return null;
    const spot = this.suggestSpot(itemId);
    this.state.haven.spots[itemId] = spot;
    if (commit) { this.recordAchievements(); this.commit('haven'); }
    return spot;
  }
  /** Take an item back into storage. */
  unplace(itemId) {
    if (!this.state.haven.spots[itemId]) return { ok: false };
    delete this.state.haven.spots[itemId];
    this.commit('haven');
    return { ok: true };
  }
  /** Let an item go for good. */
  release(itemId) {
    delete this.state.haven.spots[itemId];
    this.state.items = this.state.items.filter(i => i.id !== itemId);
    this.commit('haven');
  }

  // ——— Caring for animals ———

  animals() { const placed = this.placedIds(); return this.state.items.filter(i => placed.has(i.id) && speciesById(i.s).kind === 'animal'); }
  hungry() { const now = this.now(); return this.animals().filter(i => hungerOf(i, now) !== 'full'); }
  /** Add bond points and pay for any bond level reached. */
  addBond(item, points) {
    const before = bondLevel(item.bond);
    item.bond = Math.min(CARE.maxBond, (item.bond || 0) + points);
    const level = bondLevel(item.bond);
    if (level <= before) return null;
    let coins = 0;
    for (let l = before + 1; l <= level; l++) coins += bondReward(l);
    this.state.coins += coins;
    return { level, coins };
  }
  /** Give an animal a treat. A full animal will not eat. */
  feed(itemId, commit = true) {
    const item = this.item(itemId), now = this.now();
    if (!item || speciesById(item.s).kind !== 'animal') return { ok: false, error: 'Only animals eat.' };
    const hunger = hungerOf(item, now);
    if (hunger === 'full') return { ok: false, error: 'It is full.' };
    if (this.state.food < 1) return { ok: false, error: 'No treats left. Finish a session for more.' };
    this.state.food -= 1;
    this.state.care.feeds += 1;
    item.fed = now;
    const bond = this.addBond(item, CARE.feedBond + (hunger === 'hungry' ? CARE.hungryBonus : 0));
    const earned = this.recordAchievements();
    if (commit) this.commit('care');
    return { ok: true, bond, achievements: earned };
  }
  /** Feed every animal that will eat, hungriest first, while treats last. */
  feedAll() {
    const now = this.now();
    const list = this.hungry().sort((a, b) => (a.fed || 0) - (b.fed || 0));
    const fed = [], bonds = [], earned = [];
    for (const item of list) {
      if (this.state.food < 1) break;
      const r = this.feed(item.id, false);
      if (r.ok) { fed.push(item.id); if (r.bond) bonds.push({ id: item.id, ...r.bond }); earned.push(...r.achievements); }
    }
    if (fed.length) this.commit('care');
    return { ok: fed.length > 0, fed, bonds, achievements: earned, left: list.length - fed.length, now };
  }
  /**
   * A treat given to someone else's animal in a sanctuary: it comes out of your treats. It counts
   * toward the care you have given, but the bond is between an animal and its own person.
   */
  giveTreat() {
    if (this.state.food < 1) return { ok: false, error: 'No treats left. Finish a session for more.' };
    this.state.food -= 1;
    this.state.care.feeds += 1;
    const earned = this.recordAchievements();
    this.commit('care');
    return { ok: true, achievements: earned };
  }
  /**
   * Someone in a sanctuary gave one of your animals a treat. It is fed; the bond does not change.
   * Safe to run twice (each of your devices hears about it).
   */
  fedByFriend(itemId, at) {
    const item = this.item(itemId);
    if (!item || speciesById(item.s).kind !== 'animal' || !Number.isFinite(at)) return false;
    if ((item.fed || 0) >= at) return false;
    item.fed = Math.min(at, this.now());
    this.commit('care');
    return true;
  }
  /** A pat. It counts toward the bond once an hour. */
  pet(itemId) {
    const item = this.item(itemId), now = this.now();
    if (!item || speciesById(item.s).kind !== 'animal') return { ok: false };
    const counted = canPet(item, now);
    let bond = null;
    if (counted) { item.pet = now; bond = this.addBond(item, CARE.petBond); }
    const earned = counted ? this.recordAchievements() : [];
    if (counted) this.commit('care');
    return { ok: true, counted, bond, achievements: earned };
  }
  rename(itemId, name) {
    const item = this.item(itemId);
    if (!item) return { ok: false };
    const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 20).trim();
    if (clean) item.name = clean; else delete item.name;
    this.commit('care');
    return { ok: true };
  }
  /** Choose how a dog looks. */
  setBreed(itemId, breed) {
    const item = this.item(itemId);
    if (!item || item.s !== 'dog' || !BREED_IDS.includes(breed)) return { ok: false };
    item.breed = breed;
    this.commit('care');
    return { ok: true };
  }
  /** What to call an item: its own name, or its species. */
  nameOf(item) { return item.name || speciesById(item.s).name; }

  // ——— Backup ———

  /** What other people may see: level, totals and where things stand in the haven. */
  publicCard() {
    const side = this.side(), tiles = [];
    for (const [id, [u, v]] of Object.entries(this.state.haven.spots)) {
      const item = this.item(id);
      if (!item || tiles.length >= 100) continue;
      // Animals also say which they are and when they last ate, so people in a sanctuary can give them a treat.
      if (speciesById(item.s).kind === 'animal') tiles.push([u, v, item.s, item.z, item.breed && item.breed !== 'mixed' ? item.breed : 0, item.id, item.fed || item.at]);
      else tiles.push([u, v, item.s, item.z]);
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
  /** Take a copy joined with another device's. This device's running session and pomodoro stay. */
  adopt(next) {
    const { active, cycle } = this.state;
    this.state = migrate(next, this.now());
    this.state.active = active;
    this.state.cycle = cycle;
    this.commit('state');
  }
  reset() {
    this.state = freshState(this.now());
    this.commit('state');
  }
}
