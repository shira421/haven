// Haven's rules, with no DOM and no storage: time, rewards, levels, streaks, goals, summaries.
// Timestamps are milliseconds. Days are the device's local days.
import { SPECIES, speciesById, inSeason } from './catalog.js';

export const LIMITS = {
  minMinutes: 5,
  maxMinutes: 180,
  step: 5,
  cancelSeconds: 10, // a session can be cancelled without penalty this long after it starts
  stopwatchMinMinutes: 10, // a stopwatch session grows something from here
  minAllowance: 5,
  maxAllowance: 300,
};

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const escapeHTML = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ——— Time ———

const pad = n => String(n).padStart(2, '0');
/** Local calendar day of a timestamp, as YYYY-MM-DD. */
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export function addDays(ts, n) {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}
/** Monday 00:00 of the week containing ts. */
export function startOfWeek(ts) {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
export function startOfMonth(ts) {
  const d = new Date(startOfDay(ts));
  d.setDate(1);
  return d.getTime();
}
export function startOfYear(ts) {
  const d = new Date(startOfDay(ts));
  d.setMonth(0, 1);
  return d.getTime();
}

/** "25 min", "1 h 5 min", "2 h". */
export function formatMinutes(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
/** Clock text for a number of seconds: "24:59" or "1:04:59". */
export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
/** "just now", "5 min ago", "2 h ago", "3 days ago". */
export function formatAgo(ts, now) {
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

// ——— Rewards ———

/** How big the plant or animal is when placed: longer sessions grow bigger ones. */
export function sizeFor(minutes) {
  return minutes >= 60 ? 3 : minutes >= 25 ? 2 : 1;
}

/** Coins for a finished session. `others` is how many friends finished it with you. */
export function coinsFor({ minutes, streak = 0, others = 0 }) {
  const m = clamp(Math.floor(minutes), 0, LIMITS.maxMinutes);
  if (m <= 0) return 0;
  const lengthBonus = m >= 120 ? 100 : m >= 90 ? 60 : m >= 50 ? 25 : m >= 25 ? 10 : 0;
  const streakRate = 1 + Math.min(Math.max(streak, 0), 10) * 0.03;
  const groupRate = 1 + Math.min(Math.max(others, 0), 5) * 0.1;
  return Math.round((m * 2 + lengthBonus) * streakRate * groupRate);
}

/** Level from total focused minutes. Level n starts at 30·n·(n−1) minutes. */
export function levelFor(totalMinutes) {
  const t = Math.max(0, totalMinutes);
  let level = 1;
  while (30 * (level + 1) * level <= t) level++;
  const from = 30 * level * (level - 1), to = 30 * (level + 1) * level;
  return { level, into: t - from, need: to - from, next: to };
}
/** The haven is a square of this many tiles a side. It grows every two levels, up to 10. */
export function landSide(level) {
  return clamp(5 + Math.floor((level - 1) / 2), 5, 10);
}
export const levelReward = level => level * 50;

// ——— Sessions ———

export const doneSessions = sessions => sessions.filter(s => s.status === 'done');

/** Where a running session stands. Stopwatch sessions have planned = 0 and never finish by themselves. */
export function progress(active, now) {
  const elapsed = Math.max(0, (now - active.start) / 1000);
  if (!active.planned) {
    const cap = LIMITS.maxMinutes * 60;
    return { elapsed: Math.min(elapsed, cap), remaining: 0, fraction: Math.min(1, elapsed / cap), done: elapsed >= cap, stopwatch: true };
  }
  const total = active.planned * 60;
  return { elapsed: Math.min(elapsed, total), remaining: Math.max(0, total - elapsed), fraction: Math.min(1, elapsed / total), done: elapsed >= total, stopwatch: false };
}

/**
 * Whether time away from Haven costs the session.
 * Without deep focus nothing does. With it, being away longer than the allowance withers the plant,
 * unless the phone was only locked (the apps can tell; a browser cannot).
 */
export function awayVerdict({ deep, allowance, hiddenAt, now, locked = false }) {
  if (!deep || !hiddenAt || locked) return 'ok';
  return (now - hiddenAt) / 1000 > allowance ? 'withered' : 'ok';
}

/** Current and best run of consecutive days with at least one finished session. */
export function streaks(sessions, now) {
  const days = new Set(doneSessions(sessions).map(s => dayKey(s.start)));
  if (!days.size) return { current: 0, best: 0 };
  let current = 0;
  let cursor = startOfDay(now);
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1); // today not done yet: yesterday still counts
  while (days.has(dayKey(cursor))) { current++; cursor = addDays(cursor, -1); }
  const sorted = [...days].sort();
  let best = 0, run = 0, prev = null;
  for (const key of sorted) {
    const [y, m, d] = key.split('-').map(Number);
    const t = new Date(y, m - 1, d).getTime();
    run = prev !== null && dayKey(addDays(prev, 1)) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return { current, best: Math.max(best, current) };
}

/** The numbers goals and achievements are judged on. */
export function facts(state, now) {
  const done = doneSessions(state.sessions);
  const minutes = done.reduce((n, s) => n + s.minutes, 0);
  const hourOf = s => new Date(s.start).getHours();
  const streak = streaks(state.sessions, now);
  return {
    minutes,
    hours: minutes / 60,
    sessions: done.length,
    streak: streak.current,
    bestStreak: streak.best,
    longSession: done.reduce((n, s) => Math.max(n, s.minutes), 0),
    nightSessions: done.filter(s => hourOf(s) >= 22 || hourOf(s) < 4).length,
    earlySessions: done.filter(s => hourOf(s) >= 4 && hourOf(s) < 7).length,
    groupSessions: done.filter(s => (s.others || 0) > 0).length,
    friends: state.social?.friends || 0,
    gifts: state.social?.giftsSent || 0,
    species: state.unlocked.length,
    placed: Object.keys(state.haven.tiles).length,
  };
}

export function goalProgress(goal, f) {
  const have = goal.type === 'streak' ? f.bestStreak : goal.type === 'hours' ? Math.floor(f.hours) : f[goal.type] || 0;
  return { have: Math.min(have, goal.n), need: goal.n, met: have >= goal.n };
}

/** How a species can be had right now: 'owned' | 'season' | 'goal' | 'buy' | 'locked'. */
export function availability(state, species, now) {
  if (state.unlocked.includes(species.id)) return 'owned';
  if (inSeason(species, new Date(now).getMonth() + 1)) return 'season';
  if (species.goal && goalProgress(species.goal, facts(state, now)).met) return 'goal';
  return state.coins >= species.price ? 'buy' : 'locked';
}

export const ACHIEVEMENTS = [
  { id: 'first', name: 'First session', text: 'Finish a session', coins: 50, test: f => f.sessions >= 1 },
  { id: 's10', name: '10 sessions', text: 'Finish 10 sessions', coins: 100, test: f => f.sessions >= 10, of: f => [f.sessions, 10] },
  { id: 's50', name: '50 sessions', text: 'Finish 50 sessions', coins: 300, test: f => f.sessions >= 50, of: f => [f.sessions, 50] },
  { id: 's200', name: '200 sessions', text: 'Finish 200 sessions', coins: 1000, test: f => f.sessions >= 200, of: f => [f.sessions, 200] },
  { id: 'h10', name: '10 hours', text: 'Focus for 10 hours in total', coins: 150, test: f => f.hours >= 10, of: f => [Math.floor(f.hours), 10] },
  { id: 'h50', name: '50 hours', text: 'Focus for 50 hours in total', coins: 500, test: f => f.hours >= 50, of: f => [Math.floor(f.hours), 50] },
  { id: 'h100', name: '100 hours', text: 'Focus for 100 hours in total', coins: 1000, test: f => f.hours >= 100, of: f => [Math.floor(f.hours), 100] },
  { id: 'streak3', name: '3 days in a row', text: 'Focus 3 days in a row', coins: 100, test: f => f.bestStreak >= 3, of: f => [f.bestStreak, 3] },
  { id: 'streak7', name: 'A full week', text: 'Focus 7 days in a row', coins: 300, test: f => f.bestStreak >= 7, of: f => [f.bestStreak, 7] },
  { id: 'streak30', name: '30 days in a row', text: 'Focus 30 days in a row', coins: 1500, test: f => f.bestStreak >= 30, of: f => [f.bestStreak, 30] },
  { id: 'long60', name: 'One hour', text: 'Finish a 60 min session', coins: 100, test: f => f.longSession >= 60 },
  { id: 'long120', name: 'Two hours', text: 'Finish a 120 min session', coins: 250, test: f => f.longSession >= 120 },
  { id: 'long180', name: 'Three hours', text: 'Finish a 180 min session', coins: 500, test: f => f.longSession >= 180 },
  { id: 'early5', name: 'Early start', text: 'Finish 5 sessions that start before 7 am', coins: 200, test: f => f.earlySessions >= 5, of: f => [f.earlySessions, 5] },
  { id: 'night5', name: 'Late shift', text: 'Finish 5 sessions that start after 10 pm', coins: 200, test: f => f.nightSessions >= 5, of: f => [f.nightSessions, 5] },
  { id: 'friend1', name: 'First friend', text: 'Add a friend', coins: 100, test: f => f.friends >= 1 },
  { id: 'friend5', name: '5 friends', text: 'Have 5 friends on Haven', coins: 300, test: f => f.friends >= 5, of: f => [f.friends, 5] },
  { id: 'group1', name: 'Together', text: 'Finish a session with friends', coins: 150, test: f => f.groupSessions >= 1 },
  { id: 'group10', name: '10 together', text: 'Finish 10 sessions with friends', coins: 500, test: f => f.groupSessions >= 10, of: f => [f.groupSessions, 10] },
  { id: 'gift1', name: 'A gift', text: 'Send a friend a plant or an animal', coins: 100, test: f => f.gifts >= 1 },
  { id: 'collect10', name: '10 species', text: 'Unlock 10 species', coins: 200, test: f => f.species >= 10, of: f => [f.species, 10] },
  { id: 'collect25', name: '25 species', text: 'Unlock 25 species', coins: 600, test: f => f.species >= 25, of: f => [f.species, 25] },
  { id: 'collectAll', name: 'Every species', text: 'Unlock every plant and animal', coins: 2000, test: f => f.species >= SPECIES.length, of: f => [f.species, SPECIES.length] },
  { id: 'haven10', name: 'Settled in', text: 'Place 10 things in your haven', coins: 100, test: f => f.placed >= 10, of: f => [f.placed, 10] },
  { id: 'haven25', name: 'Full of life', text: 'Place 25 things in your haven', coins: 300, test: f => f.placed >= 25, of: f => [f.placed, 25] },
];

/** Achievements earned but not yet recorded. */
export function newAchievements(state, now) {
  const f = facts(state, now);
  return ACHIEVEMENTS.filter(a => !state.achieved[a.id] && a.test(f));
}

// ——— Summaries for the journal ———

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A day, week, month or year around `anchor`, split into the bars of its chart. */
export function period(kind, anchor) {
  if (kind === 'day') {
    const from = startOfDay(anchor), to = addDays(from, 1);
    const d = new Date(from);
    const buckets = Array.from({ length: 24 }, (_, h) => ({ from: from + h * 3600000, to: from + (h + 1) * 3600000, label: h % 6 === 0 ? String(h) : '' }));
    return { kind, from, to, label: `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`, buckets };
  }
  if (kind === 'week') {
    const from = startOfWeek(anchor), to = addDays(from, 7);
    const a = new Date(from), b = new Date(addDays(from, 6));
    const buckets = WEEKDAYS.map((label, i) => ({ from: addDays(from, i), to: addDays(from, i + 1), label }));
    const label = a.getMonth() === b.getMonth() ? `${a.getDate()} to ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}` : `${a.getDate()} ${MONTHS[a.getMonth()]} to ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
    return { kind, from, to, label, buckets };
  }
  if (kind === 'month') {
    const from = startOfMonth(anchor);
    const d = new Date(from);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const days = Math.round((next - from) / 86400000);
    const buckets = Array.from({ length: days }, (_, i) => ({ from: addDays(from, i), to: addDays(from, i + 1), label: (i + 1) % 5 === 0 || i === 0 ? String(i + 1) : '' }));
    return { kind, from, to: next, label: `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`, buckets };
  }
  const from = startOfYear(anchor);
  const y = new Date(from).getFullYear();
  const buckets = MONTHS.map((label, i) => ({ from: new Date(y, i, 1).getTime(), to: new Date(y, i + 1, 1).getTime(), label: label[0] }));
  return { kind: 'year', from, to: new Date(y + 1, 0, 1).getTime(), label: String(y), buckets };
}

/** The period before (step −1) or after (step 1) the one around `anchor`. */
export function shiftPeriod(kind, anchor, step) {
  const d = new Date(anchor);
  if (kind === 'day') d.setDate(d.getDate() + step);
  else if (kind === 'week') d.setDate(d.getDate() + 7 * step);
  else if (kind === 'month') d.setMonth(d.getMonth() + step, 1);
  else d.setFullYear(d.getFullYear() + step, 0, 1);
  return d.getTime();
}

/** Totals for the sessions that started inside a period. */
export function summarise(sessions, p) {
  const inside = sessions.filter(s => s.start >= p.from && s.start < p.to);
  const done = inside.filter(s => s.status === 'done');
  const bars = p.buckets.map(b => done.filter(s => s.start >= b.from && s.start < b.to).reduce((n, s) => n + s.minutes, 0));
  const byTag = {};
  for (const s of done) byTag[s.tag || 'other'] = (byTag[s.tag || 'other'] || 0) + s.minutes;
  const byHour = Array(24).fill(0);
  for (const s of done) byHour[new Date(s.start).getHours()] += s.minutes;
  const best = byHour.indexOf(Math.max(...byHour));
  return {
    sessions: inside,
    minutes: done.reduce((n, s) => n + s.minutes, 0),
    done: done.length,
    failed: inside.filter(s => s.status === 'failed').length,
    bars,
    byTag,
    bestHour: done.length ? best : null,
    grown: done.map(s => ({ species: s.species, size: sizeFor(s.minutes) })).filter(g => speciesById(g.species)),
  };
}

// ——— Ids ———

export function newId(prefix = '') {
  const bytes = new Uint8Array(9);
  globalThis.crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
}
