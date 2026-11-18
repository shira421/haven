process.env.TZ = 'Asia/Singapore';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, freshState, migrate, mergeStates, DEFAULT_SETTINGS } from '../src/store.js';
import { SPECIES } from '../src/catalog.js';

const T0 = new Date(2026, 10, 14, 9, 0).getTime();
function make(seed) {
  const clock = { t: T0 };
  const map = new Map();
  if (seed) map.set('haven-state', JSON.stringify(seed));
  const storage = { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) };
  const store = new Store({ storage, now: () => clock.t });
  return { store, clock, map, reopen: () => new Store({ storage, now: () => clock.t }) };
}
const run = (store, clock, minutes, extra = {}) => { const b = store.begin({ minutes, species: 'clover', tag: 'study', ...extra }); assert.equal(b.ok, true); clock.t += minutes * 60000; return store.finish(); };

test('a new haven has starters and sensible settings', () => {
  const { store } = make();
  assert.deepEqual(store.state.unlocked, ['clover', 'fern', 'rabbit']);
  assert.equal(store.state.coins, 0);
  assert.deepEqual(store.state.settings, DEFAULT_SETTINGS);
  assert.equal(store.side(), 5);
});

test('finishing a session gives coins, a plant in the haven, and achievements', () => {
  const { store, clock } = make();
  const r = run(store, clock, 25);
  assert.equal(r.ok, true);
  assert.equal(r.coins, 60);
  assert.equal(r.item.s, 'clover');
  assert.equal(r.item.z, 2);
  assert.equal(r.treats, 2);
  assert.equal(store.state.food, 5, 'three to start with, two earned');
  assert.deepEqual(store.state.haven.spots[r.item.id], r.placedAt);
  assert.ok(r.placedAt.every(n => n >= 0.4 && n <= 4.6), 'it stands on the land');
  assert.deepEqual(r.achievements.map(a => a.id), ['first']);
  assert.equal(store.state.coins, 60 + 50);
  assert.equal(store.state.active, null);
  assert.equal(store.state.sessions.length, 1);
  assert.equal(store.state.sessions[0].end - store.state.sessions[0].start, 25 * 60000);
  assert.equal(r.streak, 1);
});

test('a session cannot be finished early, started twice, or started with a locked species', () => {
  const { store, clock } = make();
  assert.equal(store.begin({ minutes: 25, species: 'panda', tag: 'study' }).ok, false);
  assert.equal(store.begin({ minutes: 25, species: 'clover', tag: 'study' }).ok, true);
  assert.equal(store.begin({ minutes: 25, species: 'clover', tag: 'study' }).ok, false);
  clock.t += 24 * 60000;
  assert.equal(store.finish().ok, false);
  assert.ok(store.state.active, 'still running');
  clock.t += 60000;
  assert.equal(store.finish().ok, true);
  assert.equal(store.finish().ok, false);
});

test('giving up records a failed session and grows nothing', () => {
  const { store, clock } = make();
  store.begin({ minutes: 50, species: 'fern', tag: 'work' });
  clock.t += 12 * 60000;
  const r = store.fail('gave-up');
  assert.equal(r.session.status, 'failed');
  assert.equal(r.session.minutes, 0);
  assert.equal(store.state.items.length, 0);
  assert.equal(store.state.coins, 0);
  assert.equal(store.streak().current, 0);
});

test('cancelling leaves no trace', () => {
  const { store } = make();
  store.begin({ minutes: 25, species: 'clover', tag: 'study' });
  assert.equal(store.cancel().ok, true);
  assert.equal(store.state.sessions.length, 0);
  assert.equal(store.state.active, null);
});

test('a stopwatch grows something from ten minutes', () => {
  const { store, clock } = make();
  store.begin({ minutes: 0, species: 'clover', tag: 'study', mode: 'stopwatch' });
  clock.t += 9 * 60000;
  const short = store.finish();
  assert.equal(short.short, true);
  assert.equal(store.state.sessions.length, 0);
  store.begin({ minutes: 0, species: 'clover', tag: 'study', mode: 'stopwatch' });
  clock.t += 42 * 60000 + 30000;
  const r = store.finish();
  assert.equal(r.session.minutes, 42);
  assert.equal(r.session.mode, 'stopwatch');
  assert.equal(r.coins, 94);
});

test('a running session survives a restart, with the time it was left', () => {
  const { store, clock, reopen } = make();
  store.begin({ minutes: 25, species: 'clover', tag: 'study' });
  clock.t += 60000;
  store.markHidden(clock.t);
  const again = reopen();
  assert.equal(again.state.active.species, 'clover');
  assert.equal(again.state.active.hiddenAt, clock.t);
  again.markVisible();
  assert.equal(again.state.active.hiddenAt, undefined);
});

test('levelling up pays coins and grows the land every two levels', () => {
  const { store, clock } = make();
  const r1 = run(store, clock, 60);
  assert.deepEqual(r1.levelUp, { level: 2, coins: 100, side: 5, grew: false });
  const r2 = run(store, clock, 120);
  assert.equal(r2.levelUp.level, 3);
  assert.equal(r2.levelUp.grew, true);
  assert.equal(store.side(), 6);
  assert.equal(store.state.level, 3);
});

test('unlocking: with coins, in season, by goal, and never twice', () => {
  const { store, clock } = make();
  assert.match(store.unlock('daisy').error, /80 more coins/);
  store.state.coins = 100;
  assert.equal(store.unlock('daisy').how, 'buy');
  assert.equal(store.state.coins, 20);
  assert.equal(store.unlock('daisy').how, 'owned');
  assert.equal(store.state.coins, 20);
  assert.equal(store.unlock('pumpkin').how, 'season');
  assert.equal(store.state.coins, 20);
  run(store, clock, 120);
  const coins = store.state.coins;
  assert.equal(store.unlock('bonsai').how, 'goal');
  assert.equal(store.state.coins, coins, 'a goal unlock is free');
  assert.equal(store.unlock('nothing').ok, false);
});

test('things stand anywhere on the land, can be moved, stored and let go', () => {
  const { store, clock } = make();
  store.set({ autoPlace: false });
  const a = run(store, clock, 25).item, b = run(store, clock, 25).item;
  assert.equal(store.stored().length, 2);
  assert.deepEqual(store.place(a.id, 1.234, 3.777).at, [1.23, 3.78]);
  assert.deepEqual(store.place(a.id, -4, 99).at, [0.4, 4.6], 'a point off the land is pulled back onto it');
  assert.equal(store.place('nope', 1, 1).ok, false);
  assert.equal(store.place(b.id, NaN, 1).ok, false);
  assert.equal(store.place(b.id, 1, 1).ok, true);
  assert.equal(store.stored().length, 0);
  assert.equal(store.unplace(a.id).ok, true);
  assert.equal(store.unplace(a.id).ok, false);
  assert.deepEqual(store.stored().map(i => i.id), [a.id]);
  store.release(b.id);
  assert.equal(store.state.haven.spots[b.id], undefined);
  assert.equal(store.item(b.id), null);
});

test('a session grows where it was planted, and a full land keeps new arrivals in storage', () => {
  const { store, clock } = make();
  const started = store.begin({ minutes: 25, species: 'clover', tag: 'study' }).active;
  assert.equal(started.spot.length, 2);
  clock.t += 25 * 60000;
  const r = store.finish();
  assert.deepEqual(r.placedAt, started.spot);
  for (let i = 0; i < 24; i++) { store.state.items.push({ id: 'x' + i, s: 'clover', z: 1, at: T0 }); assert.ok(store.placeAnywhere('x' + i)); }
  assert.equal(store.room(), 0);
  assert.equal(store.capacity(), 25);
  assert.equal(store.begin({ minutes: 10, species: 'clover', tag: 'study' }).active.spot, undefined);
  clock.t += 10 * 60000;
  const full = store.finish();
  assert.equal(full.placedAt, null);
  assert.equal(store.stored().length, 1);
  assert.match(store.place(full.item.id, 2, 2).error, /Your land is full/);
  assert.equal(store.place('x3', 2, 2).ok, true, 'something already standing can still be moved');
});

test('new spots keep their distance from what is already there', () => {
  const { store } = make();
  for (let i = 0; i < 10; i++) { store.state.items.push({ id: 'x' + i, s: 'clover', z: 1, at: T0 }); store.placeAnywhere('x' + i); }
  const spots = Object.values(store.state.haven.spots);
  let closest = 99;
  for (let i = 0; i < spots.length; i++) for (let j = 0; j < i; j++) closest = Math.min(closest, Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1]));
  assert.ok(closest > 0.5, `nothing is planted on top of anything else (closest ${closest.toFixed(2)})`);
  assert.deepEqual(store.suggestSpot('same'), store.suggestSpot('same'), 'the same seed gives the same spot');
});

test('nature items need a long enough session', () => {
  const { store, clock } = make();
  store.state.unlocked.push('pond');
  assert.match(store.begin({ minutes: 25, species: 'pond', tag: 'study' }).error, /pond takes at least 60 min/);
  assert.equal(store.begin({ minutes: 60, species: 'pond', tag: 'study' }).ok, true);
  clock.t += 60 * 60000;
  assert.equal(store.finish().item.s, 'pond');
  store.begin({ minutes: 0, species: 'pond', tag: 'study', mode: 'stopwatch' });
  clock.t += 40 * 60000;
  const short = store.finish();
  assert.equal(short.short, true);
  assert.equal(short.least, 60);
});

test('feeding: treats, hunger, bond levels and their rewards', () => {
  const { store, clock } = make();
  const rabbit = run(store, clock, 25, { species: 'rabbit' }).item;
  assert.equal(rabbit.bond, 0);
  assert.equal(rabbit.fed, rabbit.at, 'animals arrive fed');
  assert.match(store.feed(rabbit.id).error, /It is full/);
  assert.match(store.feed('nope').error, /Only animals eat/);
  assert.deepEqual(store.hungry(), []);
  clock.t += 7 * 3600000;
  assert.equal(store.hungry().length, 1);
  const food = store.state.food, coins = store.state.coins;
  const r = store.feed(rabbit.id);
  assert.equal(r.ok, true);
  assert.deepEqual(r.achievements.map(a => a.id), ['feed1']);
  assert.equal(store.state.food, food - 1);
  assert.equal(store.item(rabbit.id).bond, 4);
  assert.equal(store.state.coins, coins + 50);
  for (let i = 0; i < 3; i++) { clock.t += 21 * 3600000; store.state.food = 5; store.feed(rabbit.id); }
  assert.equal(store.item(rabbit.id).bond, 22, 'a hungry animal bonds a little more when fed');
  clock.t += 21 * 3600000;
  store.item(rabbit.id).bond = 18;
  const up = store.feed(rabbit.id);
  assert.deepEqual(up.bond, { level: 1, coins: 40 });
  store.state.food = 0;
  clock.t += 21 * 3600000;
  assert.match(store.feed(rabbit.id).error, /No treats left/);
});

test('feeding everyone goes hungriest first and stops when treats run out', () => {
  const { store, clock } = make();
  const a = run(store, clock, 10, { species: 'rabbit' }).item;
  clock.t += 3600000;
  const b = run(store, clock, 10, { species: 'rabbit' }).item;
  clock.t += 22 * 3600000;
  store.state.food = 1;
  const r = store.feedAll();
  assert.deepEqual(r.fed, [a.id]);
  assert.equal(r.left, 1);
  assert.equal(store.feedAll().ok, false);
  store.state.food = 4;
  assert.deepEqual(store.feedAll().fed, [b.id]);
  assert.equal(store.state.food, 3);
});

test('petting counts once an hour, and animals can be named', () => {
  const { store, clock } = make();
  const rabbit = run(store, clock, 25, { species: 'rabbit' }).item;
  assert.equal(store.pet(rabbit.id).counted, true);
  assert.equal(store.pet(rabbit.id).counted, false);
  assert.equal(store.item(rabbit.id).bond, 1);
  clock.t += 61 * 60000;
  assert.equal(store.pet(rabbit.id).counted, true);
  store.rename(rabbit.id, '  Mochi   the   Brave and Long Named ');
  assert.equal(store.nameOf(store.item(rabbit.id)), 'Mochi the Brave and');
  store.rename(rabbit.id, '');
  assert.equal(store.nameOf(store.item(rabbit.id)), 'Rabbit');
});

test('gifts: paying, refunding and receiving once', () => {
  const { store } = make();
  assert.equal(store.payForGift('daisy').ok, false, 'not unlocked');
  assert.match(store.payForGift('clover').error, /50 more coins/);
  store.state.coins = 60;
  const paid = store.payForGift('clover');
  assert.equal(paid.price, 50);
  assert.deepEqual(paid.achievements.map(a => a.id), ['gift1']);
  assert.equal(store.state.coins, 10 + 100);
  store.refundGift('clover');
  assert.equal(store.state.coins, 160);
  const item = store.receiveGift('fox', 'Mei', 7);
  assert.equal(item.s, 'fox');
  assert.equal(item.bond, 0, 'a gifted animal can be cared for like any other');
  assert.equal(item.from, 'Mei');
  assert.equal(store.receiveGift('fox', 'Mei', 7), null, 'the same gift is not added twice');
  assert.equal(store.receiveGift('dragon', 'Mei', 8), null);
});

test('tags', () => {
  const { store } = make();
  assert.equal(store.addTag('  ').ok, false);
  assert.equal(store.addTag('study').ok, false, 'names are unique whatever the case');
  const t = store.addTag('Thesis');
  assert.equal(t.ok, true);
  store.set({ tag: t.tag.id });
  assert.equal(store.removeTag(t.tag.id).ok, true);
  assert.equal(store.state.settings.tag, 'study');
  assert.equal(store.tagName('gone'), 'Other');
});

test('settings are kept inside their limits', () => {
  const { store } = make();
  store.set({ minutes: 999, allowance: 1, species: 'panda', theme: 'neon', volume: 4 });
  assert.equal(store.state.settings.minutes, 180);
  assert.equal(store.state.settings.allowance, 30);
  store.set({ allowance: 600 });
  assert.equal(store.state.settings.allowance, 120);
  assert.equal(store.state.settings.species, 'clover');
  assert.equal(store.state.settings.theme, 'system');
  assert.equal(store.state.settings.volume, 1);
  store.set({ minutes: 47 });
  assert.equal(store.state.settings.minutes, 45);
});

test('broken or hostile stored data falls back safely', () => {
  assert.deepEqual(migrate('nonsense', T0).unlocked, ['clover', 'fern', 'rabbit']);
  const s = migrate({ coins: -50, unlocked: ['dragon', 'fox'], items: [{ id: 'a', s: 'fox', z: 9, bond: 900, name: 5 }, { id: 'b', s: 'dragon' }, 5], food: -4, haven: { tiles: { '0,0': 'a', '1,1': 'a', 'x': 'a', '2,2': 'zzz' } }, sessions: [{ id: 1 }, { id: 'ok', start: T0, status: 'done', minutes: 9999, species: 'dragon' }], tags: [{ id: 'a', name: '   ' }], settings: { pomodoro: { focus: 0 } }, achieved: { first: 'x' } }, T0);
  assert.equal(s.coins, 0);
  assert.deepEqual(s.unlocked, ['clover', 'fern', 'rabbit', 'fox']);
  assert.deepEqual(s.items.map(i => [i.id, i.z, i.bond, i.name]), [['a', 3, 100, undefined]]);
  assert.equal(s.food, 0);
  assert.deepEqual(s.haven.spots, { a: [0.5, 0.5] }, 'a haven saved as tiles is carried over, each item once');
  assert.deepEqual(migrate({ items: [{ id: 'a', s: 'fern' }], haven: { spots: { a: [2.5, 99], zzz: [1, 1] } } }, T0).haven.spots, {}, 'a spot off the land is dropped');
  assert.deepEqual(migrate({ items: [{ id: 'a', s: 'fern' }], haven: { spots: { a: [2.25, 3.5] } } }, T0).haven.spots, { a: [2.25, 3.5] });
  assert.equal(s.sessions.length, 1);
  assert.equal(s.sessions[0].minutes, 180);
  assert.equal(s.sessions[0].species, 'clover');
  assert.equal(s.tags.length, 4);
  assert.equal(s.settings.pomodoro.focus, 5);
  assert.deepEqual(s.achieved, {});
  const { store } = make();
  const bad = new Store({ storage: { getItem: () => '{not json', setItem() {}, removeItem() {} }, now: () => T0 });
  assert.equal(bad.state.coins, 0);
  assert.equal(store.importState({ v: 99 }).ok, false);
});

test('a failing save is reported, not thrown', () => {
  const store = new Store({ storage: { getItem: () => null, setItem() { throw new Error('quota'); }, removeItem() {} }, now: () => T0 });
  store.set({ minutes: 30 });
  assert.equal(store.saveError.message, 'quota');
  assert.equal(store.state.settings.minutes, 30);
});

test('merging two devices loses nothing that was earned', () => {
  const a = make(), b = make();
  run(a.store, a.clock, 25);
  b.clock.t = T0 + 3600000;
  b.store.state.coins = 500;
  b.store.unlock('daisy');
  run(b.store, b.clock, 50, { species: 'daisy' });
  const merged = mergeStates(a.store.exportState(), b.store.exportState(), T0 + 2 * 3600000);
  assert.equal(merged.sessions.length, 2);
  assert.equal(merged.items.length, 2);
  assert.ok(merged.unlocked.includes('daisy'));
  assert.equal(merged.coins, a.store.state.coins + b.store.state.coins, 'two separate havens: both balances');
  assert.ok(merged.achieved.first <= b.store.state.achieved.first);
  assert.equal(mergeStates(merged, merged, T0).sessions.length, 2, 'merging twice changes nothing');
});

test('a new phone signing in takes the account as it is', () => {
  const a = make();
  run(a.store, a.clock, 25);
  a.store.state.coins = 740;
  a.store.state.food = 12;
  const fresh = freshState(T0 + 9 * 3600000); // newer than the account's copy
  const merged = mergeStates(fresh, a.store.exportState(), T0 + 9 * 3600000);
  assert.equal(merged.coins, 740);
  assert.equal(merged.food, 12);
  assert.deepEqual(merged.haven.spots, a.store.state.haven.spots);
  assert.deepEqual(merged.settings, a.store.state.settings);
  assert.equal(mergeStates(a.store.exportState(), freshState(T0), T0).coins, 740, 'and the other way round');
});

test('two different havens joined add their coins; two copies of one do not', () => {
  const a = make(), b = make();
  run(a.store, a.clock, 25);
  b.clock.t = T0 + 3600000;
  run(b.store, b.clock, 25);
  a.store.state.coins = 300; b.store.state.coins = 200;
  assert.equal(mergeStates(a.store.exportState(), b.store.exportState(), T0 + 7200000).coins, 500, 'different havens');
  const copy = structuredClone(a.store.exportState());
  copy.coins = 250; copy.updated += 1000;
  assert.equal(mergeStates(a.store.exportState(), copy, T0 + 7200000).coins, 300, 'the same haven: the higher count, not twice');
  // An old phone opened today is the newer copy, with fewer coins: it must not take any away.
  const stale = structuredClone(a.store.exportState());
  stale.coins = 0; stale.updated = T0 + 9e9;
  assert.equal(mergeStates(stale, a.store.exportState(), T0 + 9e9).coins, 300);
  const joined = mergeStates(a.store.exportState(), b.store.exportState(), T0 + 7200000);
  assert.equal(Object.keys(joined.haven.spots).length, 2, 'both havens\' things keep their places');
});

test('what friends can see holds no private data', () => {
  const { store, clock } = make();
  run(store, clock, 25);
  const card = store.publicCard();
  assert.deepEqual(Object.keys(card).sort(), ['best', 'level', 'minutes', 'of', 'sessions', 'side', 'species', 'streak', 'tiles']);
  assert.equal(card.tiles.length, 1);
  assert.equal(card.tiles[0][2], 'clover');
  assert.equal(card.tiles[0].length, 4);
  assert.equal(card.of, SPECIES.length);
});

test('a shiba from before 1.3 becomes a dog that is still a shiba; new dogs are mixed', () => {
  const old = migrate({ unlocked: ['clover', 'shiba'], items: [{ id: 'i1', s: 'shiba', z: 2, at: T0 }], haven: { spots: { i1: [1, 1] } }, sessions: [{ id: 's1', start: T0, end: T0, status: 'done', minutes: 25, species: 'shiba' }], settings: { species: 'shiba', keepAwake: true, allowance: 15 } }, T0);
  assert.ok(old.unlocked.includes('dog') && !old.unlocked.includes('shiba'));
  assert.deepEqual([old.items[0].s, old.items[0].breed], ['dog', 'shiba']);
  assert.equal(old.sessions[0].species, 'dog');
  assert.equal(old.settings.species, 'dog');
  assert.equal(old.settings.keepAwake, false, 'the screen may lock now unless chosen again');
  assert.equal(old.settings.allowance, 30, 'time away is from 30 s to 2 min');
  const { store, clock } = make(old);
  store.set({ keepAwake: true });
  assert.equal(migrate(store.state, T0).settings.keepAwake, true, 'a choice made since sticks');
  store.begin({ minutes: 25, species: 'dog', tag: 'study' }); clock.t += 25 * 60000;
  const r = store.finish();
  assert.equal(r.item.breed, 'mixed');
  assert.equal(store.setBreed(r.item.id, 'corgi').ok, true);
  assert.equal(store.setBreed(r.item.id, 'poodle').ok, false);
  assert.equal(store.publicCard().tiles.find(t => t[2] === 'dog' && t[4] === 'corgi') !== undefined, true);
});
