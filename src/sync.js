// Keeping one haven on several devices. Each device remembers the last copy it agreed on with the
// server (the base). When the server has a newer copy, the two are joined with a three-way merge:
// whatever either device changed since the base is kept, so a move, a release or a purchase made on
// one device is not undone by the other. Counters such as coins add up both devices' changes.
import { migrate, mergeStates } from './store.js';
import { ACHIEVEMENTS, CARE, levelFor, levelReward, bondLevel, bondReward, doneSessions, clamp } from './core.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

/** The parts of a state that are worth comparing: no clock, nothing that belongs to one device. */
export function comparable(state) {
  return JSON.stringify({ ...state, updated: 0, active: null, cycle: null });
}

/** Pick a value: the side that changed it since the base wins; if both did, `both` decides. */
function pick(b, m, t, both) {
  if (same(m, b)) return t;
  if (same(t, b)) return m;
  return both(m, t);
}
/** A counter changed on both sides: keep both changes. */
const add = (b, m, t, lo = 0, hi = Infinity) => clamp((m ?? 0) + (t ?? 0) - (b ?? 0), lo, hi);

function mergeRecords(b, m, t, newer, rules = {}) {
  const out = {};
  for (const k of new Set([...Object.keys(m), ...Object.keys(t), ...Object.keys(b || {})])) {
    const v = b ? pick(b[k], m[k], t[k], (x, y) => (rules[k] ? rules[k](b[k], x, y) : newer === 'm' ? x : y)) : (k in m ? m[k] : t[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Join two copies of the same haven that both started from `base`.
 * `mine` is this device's copy; its running session stays with it.
 */
export function threeWay(base, mine, theirs, now = Date.now()) {
  if (!isObj(base)) return mergeStates(mine, theirs, now);
  const b = migrate(base, now), m = migrate(mine, now), t = migrate(theirs, now);
  const newer = m.updated >= t.updated ? 'm' : 't';
  const prefer = (x, y) => (newer === 'm' ? x : y);
  const out = structuredClone(m);

  // Counters.
  out.coins = add(b.coins, m.coins, t.coins);
  out.food = add(b.food, m.food, t.food, 0, 9999);
  out.care = { feeds: add(b.care.feeds, m.care.feeds, t.care.feeds) };
  out.social = { friends: Math.max(m.social.friends, t.social.friends), giftsSent: add(b.social.giftsSent, m.social.giftsSent, t.social.giftsSent) };

  // Things that are only ever added.
  out.unlocked = [...new Set([...m.unlocked, ...t.unlocked])];
  out.achieved = { ...t.achieved, ...m.achieved };
  for (const [id, at] of Object.entries(t.achieved)) out.achieved[id] = Math.min(at, out.achieved[id]);
  // An achievement earned on both devices paid out twice. Take one payment back.
  for (const a of ACHIEVEMENTS) if (m.achieved[a.id] && t.achieved[a.id] && !b.achieved[a.id]) out.coins = Math.max(0, out.coins - a.coins);

  // Plants, animals and nature. One that was in the base and is missing on a side was let go there.
  const byId = list => new Map(list.map(i => [i.id, i]));
  const bi = byId(b.items), mi = byId(m.items), ti = byId(t.items);
  const items = [];
  for (const id of new Set([...mi.keys(), ...ti.keys()])) {
    const x = mi.get(id), y = ti.get(id), was = bi.get(id);
    if (was && (!x || !y)) continue;
    if (!x || !y) { items.push(structuredClone(x || y)); continue; }
    const item = mergeRecords(was, x, y, newer, {
      fed: (_, p, q) => Math.max(p || 0, q || 0),
      pet: (_, p, q) => Math.max(p || 0, q || 0),
      bond: (o, p, q) => add(o, p, q, 0, CARE.maxBond),
    });
    // A bond level reached on both devices paid out twice.
    if (was && item.bond !== undefined) {
      const lb = bondLevel(was.bond), lx = bondLevel(x.bond), ly = bondLevel(y.bond), lo = bondLevel(item.bond);
      for (let l = lb + 1; l <= Math.min(lx, ly); l++) out.coins = Math.max(0, out.coins - bondReward(l));
      for (let l = Math.max(lx, ly) + 1; l <= lo; l++) out.coins += bondReward(l);
    }
    items.push(item);
  }
  out.items = items.sort((p, q) => p.at - q.at);
  const kept = new Set(out.items.map(i => i.id));

  // Where things stand. Missing means in storage.
  out.haven = { spots: {} };
  for (const id of kept) {
    const at = pick(b.haven.spots[id], m.haven.spots[id], t.haven.spots[id], prefer);
    if (at) out.haven.spots[id] = at;
  }

  // Sessions: a session deleted on one side stays deleted.
  const bs = byId(b.sessions), ms = byId(m.sessions), ts = byId(t.sessions);
  const sessions = [];
  for (const id of new Set([...ms.keys(), ...ts.keys()])) {
    const x = ms.get(id), y = ts.get(id), was = bs.get(id);
    if (was && (!x || !y)) continue;
    if (!x || !y) { sessions.push(structuredClone(x || y)); continue; }
    const s = mergeRecords(was, x, y, newer);
    if (x.synced || y.synced) s.synced = true;
    sessions.push(s);
  }
  out.sessions = sessions.sort((p, q) => p.start - q.start);

  // Levels: a level reached on both devices paid out twice; one reached only by joining them is paid now.
  const minutes = st => doneSessions(st.sessions).reduce((n, s) => n + s.minutes, 0);
  const lb = levelFor(minutes(b)).level, lm = levelFor(minutes(m)).level, lt = levelFor(minutes(t)).level, lo = levelFor(minutes(out)).level;
  for (let l = lb + 1; l <= Math.min(lm, lt); l++) out.coins = Math.max(0, out.coins - levelReward(l));
  for (let l = Math.max(lm, lt) + 1; l <= lo; l++) out.coins += levelReward(l);

  out.tags = pick(b.tags, m.tags, t.tags, prefer);
  out.settings = mergeRecords(b.settings, m.settings, t.settings, newer);
  out.created = Math.min(m.created, t.created);
  out.active = m.active;
  out.cycle = m.cycle;
  out.updated = now;
  return migrate(out, now);
}
