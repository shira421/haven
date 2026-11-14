process.env.TZ = 'Asia/Singapore';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARE, treatsFor, hungerOf, bondLevel, bondReward, canPet, moodOf, isNight, LIMITS, coinsFor, sizeFor, levelFor, landSide, dayKey, startOfWeek, streaks, progress, awayVerdict, formatClock, formatMinutes, formatAgo, period, shiftPeriod, summarise, facts, goalProgress, availability, ACHIEVEMENTS, newAchievements, escapeHTML, newId } from '../src/core.js';
import { freshState } from '../src/store.js';
import { speciesById, SPECIES } from '../src/catalog.js';

const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const done = (start, minutes, extra = {}) => ({ id: 's' + start, start, end: start + minutes * 60000, planned: minutes, minutes, status: 'done', species: 'clover', tag: 'study', mode: 'timer', coins: 0, ...extra });
const failed = start => ({ id: 'f' + start, start, end: start + 60000, planned: 25, minutes: 0, status: 'failed', species: 'clover', tag: 'study', mode: 'timer', coins: 0 });

test('coins grow with length, streak and friends, and never for nothing', () => {
  assert.equal(coinsFor({ minutes: 0 }), 0);
  assert.equal(coinsFor({ minutes: 10 }), 20);
  assert.equal(coinsFor({ minutes: 25 }), 60);
  assert.equal(coinsFor({ minutes: 50 }), 125);
  assert.equal(coinsFor({ minutes: 120 }), 340);
  assert.equal(coinsFor({ minutes: 25, streak: 10 }), 78);
  assert.equal(coinsFor({ minutes: 25, streak: 400 }), 78, 'streak bonus is capped');
  assert.equal(coinsFor({ minutes: 25, others: 2 }), 72);
  assert.equal(coinsFor({ minutes: 25, others: 50 }), 90, 'group bonus is capped');
  assert.equal(coinsFor({ minutes: 9999 }), coinsFor({ minutes: LIMITS.maxMinutes }), 'minutes are capped');
});

test('longer sessions grow bigger plants', () => {
  assert.deepEqual([5, 24, 25, 59, 60, 180].map(sizeFor), [1, 1, 2, 2, 3, 3]);
});

test('levels and land', () => {
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(59).level, 1);
  assert.equal(levelFor(60).level, 2);
  assert.equal(levelFor(179).level, 2);
  assert.equal(levelFor(180).level, 3);
  assert.deepEqual(levelFor(90), { level: 2, into: 30, need: 120, next: 180 });
  assert.deepEqual([1, 2, 3, 5, 9, 11, 40].map(landSide), [5, 5, 6, 7, 9, 10, 10]);
});

test('days are local days', () => {
  assert.equal(dayKey(at(2026, 11, 14, 0, 5)), '2026-11-14');
  assert.equal(dayKey(at(2026, 11, 14, 23, 59)), '2026-11-14');
  assert.equal(dayKey(Date.UTC(2026, 10, 13, 17, 0)), '2026-11-14', '1 am in Singapore');
  assert.equal(dayKey(startOfWeek(at(2026, 11, 14))), '2026-11-09', 'weeks start on Monday');
  assert.equal(dayKey(startOfWeek(at(2026, 11, 9, 0, 0))), '2026-11-09');
});

test('streaks count consecutive days and survive until the end of the next day', () => {
  const now = at(2026, 11, 14, 9);
  assert.deepEqual(streaks([], now), { current: 0, best: 0 });
  const s = [done(at(2026, 11, 10), 25), done(at(2026, 11, 11), 25), done(at(2026, 11, 11, 15), 25), done(at(2026, 11, 13), 25)];
  assert.deepEqual(streaks(s, now), { current: 1, best: 2 }, 'yesterday still counts this morning');
  assert.deepEqual(streaks([...s, done(at(2026, 11, 14, 8), 25)], now), { current: 2, best: 2 });
  assert.deepEqual(streaks(s, at(2026, 11, 15, 9)), { current: 0, best: 2 }, 'a missed day ends it');
  assert.deepEqual(streaks([failed(at(2026, 11, 14, 8))], now), { current: 0, best: 0 }, 'failed sessions do not count');
  const across = [done(at(2026, 2, 28), 25), done(at(2026, 3, 1), 25)];
  assert.equal(streaks(across, at(2026, 3, 1, 20)).best, 2, 'across a month end');
});

test('progress of a timer and of a stopwatch', () => {
  const start = at(2026, 11, 14);
  const timer = { start, planned: 25 };
  assert.deepEqual(progress(timer, start), { elapsed: 0, remaining: 1500, fraction: 0, done: false, stopwatch: false });
  assert.equal(progress(timer, start + 750000).fraction, 0.5);
  assert.equal(progress(timer, start + 1500000).done, true);
  assert.equal(progress(timer, start + 9e6).remaining, 0);
  assert.equal(progress(timer, start - 5000).elapsed, 0, 'a clock that jumps back never gives negative time');
  const watch = { start, planned: 0 };
  assert.equal(progress(watch, start + 600000).elapsed, 600);
  assert.equal(progress(watch, start + 600000).done, false);
  assert.equal(progress(watch, start + 181 * 60000).done, true, 'a stopwatch stops at the longest session');
});

test('leaving Haven withers the plant only in deep focus, past the allowance, and not for a locked phone', () => {
  const base = { deep: true, allowance: 15, hiddenAt: 1000000, now: 1000000 + 16000 };
  assert.equal(awayVerdict(base), 'withered');
  assert.equal(awayVerdict({ ...base, now: 1000000 + 15000 }), 'ok');
  assert.equal(awayVerdict({ ...base, deep: false }), 'ok');
  assert.equal(awayVerdict({ ...base, locked: true }), 'ok');
  assert.equal(awayVerdict({ ...base, hiddenAt: null }), 'ok');
});

test('text for clocks, lengths and ages', () => {
  assert.equal(formatClock(1500), '25:00');
  assert.equal(formatClock(59.2), '01:00');
  assert.equal(formatClock(3899), '1:04:59');
  assert.equal(formatClock(-4), '00:00');
  assert.equal(formatMinutes(25), '25 min');
  assert.equal(formatMinutes(60), '1 h');
  assert.equal(formatMinutes(125), '2 h 5 min');
  const now = at(2026, 11, 14);
  assert.equal(formatAgo(now - 20000, now), 'just now');
  assert.equal(formatAgo(now - 5 * 60000, now), '5 min ago');
  assert.equal(formatAgo(now - 3 * 3600000, now), '3 h ago');
  assert.equal(formatAgo(now - 26 * 3600000, now), 'yesterday');
  assert.equal(formatAgo(now - 4 * 86400000, now), '4 days ago');
});

test('periods have the right bars and step both ways', () => {
  const anchor = at(2026, 11, 14, 15);
  const day = period('day', anchor);
  assert.equal(day.buckets.length, 24);
  assert.equal(day.label, '14 November 2026');
  const week = period('week', anchor);
  assert.equal(week.buckets.length, 7);
  assert.equal(dayKey(week.from), '2026-11-09');
  assert.equal(week.label, '9 to 15 Nov 2026');
  assert.equal(period('week', at(2026, 12, 1)).label, '30 Nov to 6 Dec 2026');
  const month = period('month', anchor);
  assert.equal(month.buckets.length, 30);
  assert.equal(period('month', at(2028, 2, 10)).buckets.length, 29, 'leap February');
  const year = period('year', anchor);
  assert.equal(year.buckets.length, 12);
  assert.equal(year.label, '2026');
  assert.equal(period('month', shiftPeriod('month', at(2026, 1, 31), 1)).label, 'February 2026', 'stepping from the 31st does not skip a month');
  assert.equal(period('year', shiftPeriod('year', anchor, -1)).label, '2025');
  assert.equal(period('day', shiftPeriod('day', anchor, 1)).label, '15 November 2026');
});

test('summaries count only what started in the period', () => {
  const sessions = [done(at(2026, 11, 9, 9), 25), done(at(2026, 11, 9, 14), 50, { tag: 'work', species: 'fern' }), failed(at(2026, 11, 10, 9)), done(at(2026, 11, 16, 9), 60)];
  const sum = summarise(sessions, period('week', at(2026, 11, 11)));
  assert.equal(sum.minutes, 75);
  assert.equal(sum.done, 2);
  assert.equal(sum.failed, 1);
  assert.deepEqual(sum.bars, [75, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(sum.byTag, { study: 25, work: 50 });
  assert.equal(sum.bestHour, 14);
  assert.deepEqual(sum.grown, [{ species: 'clover', size: 2 }, { species: 'fern', size: 2 }]);
  const empty = summarise([], period('day', at(2026, 11, 11)));
  assert.equal(empty.minutes, 0);
  assert.equal(empty.bestHour, null);
});

test('goals and availability', () => {
  const now = at(2026, 11, 14);
  const state = freshState(now);
  const bonsai = speciesById('bonsai'), cherry = speciesById('cherry'), pumpkin = speciesById('pumpkin'), daisy = speciesById('daisy');
  assert.equal(availability(state, speciesById('clover'), now), 'owned');
  assert.equal(availability(state, daisy, now), 'locked');
  state.coins = 80;
  assert.equal(availability(state, daisy, now), 'buy');
  assert.equal(availability(state, pumpkin, now), 'season', 'pumpkins are free in November');
  assert.equal(availability(state, cherry, now), 'locked');
  assert.equal(availability(state, cherry, at(2027, 3, 20)), 'season');
  assert.deepEqual(goalProgress(bonsai.goal, facts(state, now)), { have: 0, need: 120, met: false });
  state.sessions.push(done(at(2026, 11, 13), 120));
  assert.equal(availability(state, bonsai, now), 'goal');
  state.social.friends = 3;
  assert.equal(availability(state, speciesById('capybara'), now), 'goal');
  state.sessions.push(...[1, 2, 3, 4, 5].map(d => done(at(2026, 11, d, 23), 25)));
  assert.equal(facts(state, now).nightSessions, 5);
  assert.equal(availability(state, speciesById('owl'), now), 'goal');
});

test('achievements are found once', () => {
  const now = at(2026, 11, 14);
  const state = freshState(now);
  assert.deepEqual(newAchievements(state, now), []);
  state.sessions.push(done(at(2026, 11, 14, 9), 60));
  assert.deepEqual(newAchievements(state, now).map(a => a.id), ['first', 'long60']);
  state.achieved.first = now;
  assert.deepEqual(newAchievements(state, now).map(a => a.id), ['long60']);
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, ACHIEVEMENTS.length, 'ids are unique');
  for (const a of ACHIEVEMENTS) assert.ok(a.coins > 0 && a.name && a.text, a.id);
  const all = ACHIEVEMENTS.find(a => a.id === 'collectAll');
  assert.equal(all.test({ species: SPECIES.length }), true);
});

test('treats, hunger, mood and bond levels', () => {
  assert.deepEqual([5, 14, 15, 25, 60, 180].map(treatsFor), [1, 1, 2, 2, 5, 13]);
  const now = at(2026, 11, 14, 12), h = 3600000;
  assert.equal(hungerOf({ fed: now - 5 * h }, now), 'full');
  assert.equal(hungerOf({ fed: now - 7 * h }, now), 'peckish');
  assert.equal(hungerOf({ fed: now - 21 * h }, now), 'hungry');
  assert.equal(hungerOf({ at: now - h }, now), 'full', 'an animal that has never been fed counts from when it arrived');
  assert.deepEqual([0, 19, 20, 59, 60, 100, 400].map(bondLevel), [0, 0, 1, 2, 3, 5, 5]);
  assert.equal(bondReward(3), 120);
  assert.equal(canPet({ pet: now - 59 * 60000 }, now), false);
  assert.equal(canPet({ pet: now - 60 * 60000 }, now), true);
  assert.equal(canPet({}, now), true);
  assert.equal(moodOf({ fed: now - 30 * h }, now), 'Hungry');
  assert.equal(moodOf({ fed: now - 30 * h }, now, true), 'Hungry', 'hunger shows even at night');
  assert.equal(moodOf({ fed: now }, now, true), 'Sleepy');
  assert.equal(moodOf({ fed: now - 8 * h }, now), 'Peckish');
  assert.equal(moodOf({ fed: now, pet: now - h }, now), 'Happy');
  assert.equal(moodOf({ fed: now, bond: 70 }, now), 'Happy');
  assert.equal(moodOf({ fed: now }, now), 'Content');
  assert.deepEqual([[5, 50], [6, 0], [12, 0], [18, 20], [18, 30], [23, 0]].map(([hh, mm]) => isNight(at(2026, 11, 14, hh, mm))), [true, false, false, false, true, true]);
  assert.equal(CARE.maxBond / CARE.levels, 20);
});

test('escaping and ids', () => {
  assert.equal(escapeHTML(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  assert.equal(escapeHTML(null), '');
  const ids = new Set(Array.from({ length: 500 }, () => newId('s')));
  assert.equal(ids.size, 500);
  assert.match([...ids][0], /^s[0-9a-z]{14}$/);
});
