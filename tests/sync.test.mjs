process.env.TZ = 'Asia/Singapore';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { threeWay, comparable } from '../src/sync.js';
import { Social } from '../src/social.js';

const T0 = new Date(2026, 10, 14, 9, 0).getTime();
const memory = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
function device(clock, seed) {
  const storage = memory();
  if (seed) storage.setItem('haven-state', JSON.stringify(seed));
  return new Store({ storage, now: () => clock.t });
}
const grow = (store, clock, minutes = 25, species = 'clover') => { store.begin({ minutes, species, tag: 'study' }); clock.t += minutes * 60000; return store.finish(); };

test('moves, releases and purchases on either device all survive a merge', () => {
  const clock = { t: T0 };
  const a = device(clock);
  for (let i = 0; i < 4; i++) grow(a, clock);
  const base = a.exportState();
  const b = device(clock, base);
  const [one, two, three] = a.state.items.map(i => i.id);

  a.place(one, 1, 1); // moved on A
  clock.t += 1000;
  b.release(two); // let go on B
  b.unplace(three); // put away on B
  const coinsBefore = base.coins;
  b.unlock('daisy'); // bought on B: 80 coins
  grow(a, clock); // a new session on A

  const merged = threeWay(base, a.exportState(), b.exportState(), clock.t);
  assert.deepEqual(merged.haven.spots[one], [1, 1], 'the move made on A stands');
  assert.equal(merged.items.some(i => i.id === two), false, 'the release made on B stands');
  assert.equal(merged.haven.spots[three], undefined, 'the item put away on B stays in storage');
  assert.ok(merged.unlocked.includes('daisy'));
  assert.equal(merged.sessions.length, 5);
  const earnedOnA = a.state.coins - coinsBefore;
  assert.equal(merged.coins, coinsBefore + earnedOnA - 80, 'coins earned on A and spent on B both count');
  // Merging is the same from either side.
  const other = threeWay(base, b.exportState(), a.exportState(), clock.t);
  assert.equal(comparable(other), comparable({ ...merged, settings: other.settings }));
});

test('an achievement earned on both devices pays once', () => {
  const clock = { t: T0 };
  const base = device(clock).exportState();
  const a = device(clock, base), b = device(clock, base);
  grow(a, clock);
  grow(b, clock); // both earn "first" and its coins
  const merged = threeWay(base, a.exportState(), b.exportState(), clock.t);
  assert.equal(merged.coins, a.state.coins + b.state.coins - 50);
});

test('two devices of one account stay in step through the server', async () => {
  const clock = { t: T0 };
  // A tiny server: the same rules as the real one for saving and reading the haven.
  let saved = null, rev = 0;
  const sockets = [];
  const fetchImpl = async (url, init) => {
    const path = url.replace('http://hub', '');
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (path === '/api/state' && init.method === 'GET') return json(200, { state: saved, rev, at: clock.t });
    if (path === '/api/state' && init.method === 'PUT') {
      const body = JSON.parse(init.body);
      if (body.base !== rev) return json(409, { error: 'Another device saved first.' });
      saved = body.state; rev += 1;
      for (const s of sockets) s.onMessage(JSON.stringify({ t: 'state', rev }));
      return json(200, { at: clock.t, rev });
    }
    return json(404, {});
  };
  const account = JSON.stringify({ id: 'u1', token: 't', name: 'A', handle: 'a' });
  const make = () => {
    const storage = memory();
    storage.setItem('haven-account', account);
    const store = new Store({ storage, now: () => clock.t });
    const social = new Social({ store, storage, base: 'http://hub', now: () => clock.t, fetchImpl });
    sockets.push(social);
    return { store, social };
  };
  const A = make();
  grow(A.store, clock);
  await A.social.sync();
  const B = make(); // "add another device"
  await B.social.sync();
  assert.equal(B.store.state.items.length, 1, 'B brings over what A grew');

  // A moves its plant; B hears about it straight away.
  const id = A.store.state.items[0].id;
  A.store.place(id, 2, 3);
  await A.social.sync();
  await B.social.syncing;
  assert.deepEqual(B.store.state.haven.spots[id], [2, 3]);

  // B grows something and releases A's plant while A also grows something.
  grow(B.store, clock, 30, 'fern');
  B.store.release(id);
  grow(A.store, clock, 45, 'rabbit');
  await Promise.all([A.social.sync(), B.social.sync()]);
  await A.social.syncing; await B.social.syncing;
  await A.social.sync(); await B.social.sync();
  for (const d of [A, B]) {
    assert.deepEqual(d.store.state.items.map(i => i.s).sort(), ['fern', 'rabbit'], 'both see the same haven');
    assert.equal(d.store.state.sessions.length, 3);
  }
  assert.equal(A.store.state.coins, B.store.state.coins);
  assert.equal(comparable(A.store.exportState()), comparable(B.store.exportState()));
});
