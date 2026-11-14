// The friends server, run on the real Workers runtime: every route, and what friends see live.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHub } from './hub-server.mjs';
import { cleanName, cleanHandle, cleanCode, randomString } from '../worker/hub.js';

const MIN = 60000;
let hub, T = Date.UTC(2026, 10, 14, 4, 0, 0), n = 0;
const tick = (ms = 1000) => (T += ms);
before(async () => { hub = await startHub(); });
after(async () => { await hub.stop(); });

const api = (method, path, token, body) => hub.call(method, path, { token, body, now: T });
const ok = async (method, path, token, body) => { const r = await api(method, path, token, body); assert.equal(r.status, 200, `${method} ${path}: ${JSON.stringify(r.body)}`); return r.body; };
// Each test person registers from their own network address, as real people do.
async function person(name) {
  const r = await hub.call('POST', '/api/register', { now: T, ip: `10.1.${Math.floor(++n / 250)}.${n % 250}`, body: { name, handle: `${name.toLowerCase()}_${n}` } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { ...r.body.user, token: r.body.token };
}
async function friends(a, b) {
  await ok('POST', '/api/friends/request', a.token, { id: b.id });
  await ok('POST', '/api/friends/respond', b.token, { id: a.id, accept: true });
}
const live = p => hub.socket(p.token, T);

test('text rules', () => {
  assert.equal(cleanName('  Mei   Lin ‮'), 'Mei Lin');
  assert.throws(() => cleanName('   '), /Enter a name/);
  assert.throws(() => cleanName('x'.repeat(25)), /24 characters/);
  assert.equal(cleanHandle('@Mei_Lin9'), 'mei_lin9');
  assert.throws(() => cleanHandle('ab'), /3 to 20/);
  assert.throws(() => cleanHandle('mei lin'), /3 to 20/);
  assert.throws(() => cleanHandle('admin'), /not available/);
  assert.equal(cleanCode('k7m2-p9qx '), 'K7M2P9QX');
  assert.match(randomString(8, 'ABC'), /^[ABC]{8}$/);
});

test('health and CORS', async () => {
  const h = await api('GET', '/health');
  assert.equal(h.body.ok, true);
  const pre = await hub.mf.dispatchFetch('http://hub/api/me', { method: 'OPTIONS', headers: { Origin: 'https://shira421.github.io', 'Access-Control-Request-Method': 'GET' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(pre.headers.get('Access-Control-Allow-Headers'), /Authorization/);
  const res = await hub.mf.dispatchFetch('http://hub/health', { headers: { Origin: 'haven://app' } });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  await res.arrayBuffer();
  assert.equal((await api('GET', '/nothing')).status, 404);
  assert.equal((await hub.mf.dispatchFetch('http://hub/api/me', { method: 'DELETE' })).status, 405);
});

test('profiles: creating one, and what is refused', async () => {
  const a = await person('Ana');
  assert.match(a.code, /^[A-HJKMNP-Z2-9]{8}$/);
  assert.match(a.token, /^[a-z0-9]{48}$/);
  assert.equal((await api('POST', '/api/register', null, { name: 'Ana', handle: a.handle })).status, 409);
  assert.match((await api('POST', '/api/register', null, { name: '', handle: 'someone_new' })).body.error, /Enter a name/);
  assert.match((await api('POST', '/api/register', null, { name: 'Bo', handle: 'no' })).body.error, /3 to 20/);
  assert.equal((await api('GET', '/api/me')).status, 401);
  assert.equal((await api('GET', '/api/me', 'wrong-token')).status, 401);
  const me = await ok('GET', '/api/me', a.token);
  assert.equal(me.me.handle, a.handle);
  assert.deepEqual(me.friends, []);
  const p = await ok('POST', '/api/profile', a.token, { name: 'Ana B', avatar: 'fox', card: { level: 3, streak: 2, tiles: [[0, 0, 'fern', 2]] } });
  assert.equal(p.me.name, 'Ana B');
  assert.equal(p.me.avatar, 'fox');
  assert.equal((await ok('POST', '/api/profile', a.token, { avatar: 'dragon' })).me.avatar, 'fox', 'an unknown avatar is ignored');
  assert.equal((await api('POST', '/api/profile', a.token, { card: { blob: 'x'.repeat(9000) } })).status, 400);
  const bad = await hub.mf.dispatchFetch('http://hub/api/profile', { method: 'POST', headers: { Authorization: 'Bearer ' + a.token }, body: '{oops' });
  assert.equal(bad.status, 400);
  await bad.arrayBuffer();
});

test('only five new profiles an hour from one network', async () => {
  const from = (handle, ip) => hub.call('POST', '/api/register', { now: T, ip, body: { name: 'Bulk', handle } });
  const results = [];
  for (let i = 0; i < 6; i++) results.push((await from(`bulk_user_${i}`, '10.9.9.9')).status);
  assert.deepEqual(results, [200, 200, 200, 200, 200, 429]);
  assert.equal((await from('bulk_other_net', '10.9.9.10')).status, 200, 'another network is not affected');
  T += 3600000 + 1;
  assert.equal((await from('bulk_user_late', '10.9.9.9')).status, 200);
});

test('finding people: by code or exact username only', async () => {
  const a = await person('Finder'), b = await person('Found');
  assert.equal((await ok('GET', `/api/find?q=${b.code.slice(0, 4)}-${b.code.slice(4).toLowerCase()}`, a.token)).user.id, b.id);
  assert.equal((await ok('GET', `/api/find?q=@${b.handle}`, a.token)).relation, 'none');
  assert.equal((await ok('GET', `/api/find?q=${a.code}`, a.token)).relation, 'self');
  assert.equal((await api('GET', '/api/find?q=fou', a.token)).status, 404, 'a partial username finds no one');
  assert.equal((await api('GET', '/api/find?q=', a.token)).status, 400);
  const found = await ok('GET', `/api/find?q=${b.code}`, a.token);
  assert.deepEqual(Object.keys(found.user).sort(), ['avatar', 'handle', 'id', 'name'], 'no code or token leaks');
});

test('friend requests arrive live, and accepting makes both friends', async () => {
  const a = await person('Asha'), b = await person('Ben');
  const sa = await live(a), sb = await live(b);
  const r = await ok('POST', '/api/friends/request', a.token, { id: b.id });
  assert.equal(r.status, 'requested');
  const got = await sb.next(m => m.t === 'request');
  assert.equal(got.from.name, 'Asha');
  assert.equal((await ok('GET', '/api/me', b.token)).incoming[0].id, a.id);
  assert.equal((await ok('GET', '/api/me', a.token)).outgoing[0].id, b.id);
  assert.equal((await ok('GET', `/api/find?q=${a.code}`, b.token)).relation, 'incoming');
  await ok('POST', '/api/friends/request', a.token, { id: b.id });
  assert.equal(sb.messages.filter(m => m.t === 'request').length, 1, 'asking twice does not notify twice');
  const acc = await ok('POST', '/api/friends/respond', b.token, { id: a.id, accept: true });
  assert.equal(acc.status, 'friends');
  assert.equal((await sa.next(m => m.t === 'accepted')).by.name, 'Ben');
  const mine = await ok('GET', '/api/me', a.token);
  assert.equal(mine.friends.length, 1);
  assert.equal(mine.friends[0].online, true);
  assert.deepEqual(mine.outgoing, []);
  assert.equal((await ok('POST', '/api/friends/request', a.token, { id: b.id })).status, 'friends');
  sa.close(); sb.close();
});

test('two people who ask each other become friends at once', async () => {
  const a = await person('Cy'), b = await person('Di');
  await ok('POST', '/api/friends/request', a.token, { id: b.id });
  assert.equal((await ok('POST', '/api/friends/request', b.token, { id: a.id })).status, 'friends');
  assert.equal((await ok('GET', '/api/me', a.token)).friends[0].id, b.id);
  assert.deepEqual((await ok('GET', '/api/me', b.token)).incoming, []);
});

test('declining, cancelling, removing and blocking', async () => {
  const a = await person('Eve'), b = await person('Fay');
  assert.match((await api('POST', '/api/friends/request', a.token, { id: a.id })).body.error, /your own code/);
  assert.equal((await api('POST', '/api/friends/request', a.token, { id: 'zzzzzzzzzzzz' })).status, 404);
  await ok('POST', '/api/friends/request', a.token, { id: b.id });
  await ok('POST', '/api/friends/respond', b.token, { id: a.id, accept: false });
  assert.deepEqual((await ok('GET', '/api/me', a.token)).outgoing, []);
  assert.equal((await api('POST', '/api/friends/respond', b.token, { id: a.id, accept: true })).status, 404, 'nothing left to accept');
  await ok('POST', '/api/friends/request', a.token, { id: b.id });
  await ok('POST', '/api/friends/cancel', a.token, { id: b.id });
  assert.deepEqual((await ok('GET', '/api/me', b.token)).incoming, []);
  await friends(a, b);
  await ok('POST', '/api/friends/remove', a.token, { id: b.id });
  assert.deepEqual((await ok('GET', '/api/me', b.token)).friends, []);
  await friends(a, b);
  await ok('POST', '/api/friends/block', a.token, { id: b.id });
  assert.deepEqual((await ok('GET', '/api/me', b.token)).friends, []);
  assert.equal((await api('GET', `/api/find?q=${a.code}`, b.token)).status, 404, 'a blocked person cannot find you');
  assert.equal((await api('POST', '/api/friends/request', b.token, { id: a.id })).status, 404);
  assert.equal((await ok('GET', '/api/blocks', a.token)).blocked[0].id, b.id);
  await ok('POST', '/api/friends/unblock', a.token, { id: b.id });
  assert.equal((await ok('GET', `/api/find?q=${a.code}`, b.token)).relation, 'none');
});

test('friends see each other come online, focus, finish and go offline, live', async () => {
  const a = await person('Gus'), b = await person('Hana');
  await friends(a, b);
  const sa = await live(a);
  const sb = await live(b);
  assert.equal((await sa.next(m => m.t === 'presence' && m.id === b.id && m.online === true)).online, true);
  const started = await ok('POST', '/api/session/start', b.token, { id: 'sessionb1', planned: 25, species: 'fern' });
  assert.equal(started.start, T);
  const focus = await sa.next(m => m.t === 'presence' && m.focusing);
  assert.deepEqual(focus.focusing, { start: T, until: T + 25 * MIN, minutes: 25, species: 'fern', room: null });
  let list = (await ok('GET', '/api/me', a.token)).friends;
  assert.equal(list[0].focusing.species, 'fern');
  tick(10 * MIN);
  assert.match((await api('POST', '/api/session/end', b.token, { id: 'sessionb1', status: 'done' })).body.error, /not finished yet/);
  tick(15 * MIN - 20000);
  sa.clear();
  const end = await ok('POST', '/api/session/end', b.token, { id: 'sessionb1', status: 'done' });
  assert.deepEqual(end, { status: 'done', minutes: 25, others: 0 });
  const stopped = await sa.next(m => m.t === 'presence' && m.focusing === null);
  assert.equal(stopped.add, 25);
  const item = await sa.next(m => m.t === 'feed');
  assert.equal(item.item.species, 'fern');
  assert.equal(item.item.user.name, 'Hana');
  assert.deepEqual(await ok('POST', '/api/session/end', b.token, { id: 'sessionb1', status: 'done' }), { status: 'done', minutes: 25, others: 0 }, 'ending twice changes nothing');
  list = (await ok('GET', `/api/me?since=${T - 3600000}`, a.token)).friends;
  assert.equal(list[0].today, 25);
  assert.equal(list[0].focusing, null);
  sa.clear();
  sb.close();
  assert.equal((await sa.next(m => m.t === 'presence' && m.online === false)).id, b.id);
  assert.equal((await ok('GET', '/api/me', a.token)).friends[0].online, false);
  sa.close();
});

test('a second device keeps you online until both are closed', async () => {
  const a = await person('Ivo'), b = await person('Jun');
  await friends(a, b);
  const sa = await live(a);
  const one = await live(b), two = await live(b);
  await sa.next(m => m.t === 'presence' && m.online === true);
  sa.clear();
  one.close();
  await new Promise(r => setTimeout(r, 300));
  assert.equal(sa.messages.some(m => m.t === 'presence' && m.online === false), false);
  assert.equal((await ok('GET', '/api/me', a.token)).friends[0].online, true);
  two.close();
  await sa.next(m => m.t === 'presence' && m.online === false);
  sa.close();
});

test('giving up, stopwatches, and a stale session', async () => {
  const a = await person('Kit');
  await ok('POST', '/api/session/start', a.token, { id: 'kit0001', planned: 50, species: 'oak' });
  tick(5 * MIN);
  assert.deepEqual(await ok('POST', '/api/session/end', a.token, { id: 'kit0001', status: 'failed' }), { status: 'failed', minutes: 0, others: 0 });
  await ok('POST', '/api/session/start', a.token, { id: 'kit0002', planned: 0, species: 'oak' });
  tick(9 * MIN);
  assert.equal((await ok('POST', '/api/session/end', a.token, { id: 'kit0002', status: 'done' })).status, 'short');
  await ok('POST', '/api/session/start', a.token, { id: 'kit0003', planned: 0, species: 'oak' });
  tick(42 * MIN + 5000);
  assert.equal((await ok('POST', '/api/session/end', a.token, { id: 'kit0003', status: 'done' })).minutes, 42);
  assert.equal((await api('POST', '/api/session/start', a.token, { id: 'kit0003', planned: 25 })).status, 409, 'an id is used once');
  assert.equal((await api('POST', '/api/session/start', a.token, { id: 'x', planned: 25 })).status, 400);
  assert.equal((await api('POST', '/api/session/start', a.token, { id: 'kit0004', planned: 500 })).status, 400);
  assert.equal((await api('POST', '/api/session/end', a.token, { id: 'missing1', status: 'done' })).status, 404);
  // A session that was never ended stops showing as focusing once its time is well past.
  const b = await person('Lou');
  await friends(a, b);
  await ok('POST', '/api/session/start', a.token, { id: 'kit0005', planned: 25, species: 'oak' });
  tick(26 * MIN);
  assert.ok((await ok('GET', '/api/me', b.token)).friends[0].focusing, 'still shown just after the end');
  tick(2 * MIN);
  assert.equal((await ok('GET', '/api/me', b.token)).friends[0].focusing, null);
  await ok('POST', '/api/session/start', a.token, { id: 'kit0006', planned: 25, species: 'oak' });
  tick(25 * MIN);
  assert.equal((await ok('POST', '/api/session/end', a.token, { id: 'kit0006', status: 'done' })).minutes, 25, 'starting again replaces the stale one');
});

test('sessions finished offline can be added later, within limits', async () => {
  const a = await person('Mo');
  tick(10 * 3600000);
  const start = T - 3 * 3600000;
  assert.deepEqual(await ok('POST', '/api/session/log', a.token, { id: 'offline1', start, minutes: 50, species: 'pine' }), { status: 'done', minutes: 50 });
  assert.deepEqual(await ok('POST', '/api/session/log', a.token, { id: 'offline1', start, minutes: 50, species: 'pine' }), { status: 'done', minutes: 50 }, 'sending it again is harmless');
  assert.equal((await api('POST', '/api/session/log', a.token, { id: 'offline2', start: start + 20 * MIN, minutes: 25 })).status, 409, 'overlapping time is refused');
  assert.match((await api('POST', '/api/session/log', a.token, { id: 'offline3', start: T - 10 * MIN, minutes: 60 })).body.error, /not finished yet/);
  assert.match((await api('POST', '/api/session/log', a.token, { id: 'offline4', start: T - 9 * 86400000, minutes: 25 })).body.error, /too old/);
  assert.equal((await api('POST', '/api/session/log', a.token, { id: 'offline5', start: T - 3600000, minutes: 999 })).status, 400);
  const b = await person('Nia');
  assert.equal((await api('POST', '/api/session/log', b.token, { id: 'offline1', start, minutes: 50 })).status, 400, 'someone else cannot reuse the id');
  // A session the server saw start is finished by the server's clock, not the phone's word.
  await ok('POST', '/api/session/start', a.token, { id: 'online01', planned: 25, species: 'pine' });
  tick(5 * MIN);
  assert.equal((await api('POST', '/api/session/log', a.token, { id: 'online01', start: T - 30 * MIN, minutes: 25 })).status, 400);
  tick(20 * MIN);
  assert.equal((await ok('POST', '/api/session/log', a.token, { id: 'online01', start: T - 25 * MIN, minutes: 25 })).minutes, 25);
});

test('the board ranks you and your friends, and the feed lists what they grew', async () => {
  const a = await person('Oli'), b = await person('Pia'), c = await person('Quin');
  await friends(a, b);
  const since = T;
  tick(MIN);
  for (const [p, id, m] of [[a, 'boarda1', 25], [b, 'boardb1', 50], [c, 'boardc1', 120]]) {
    await ok('POST', '/api/session/start', p.token, { id, planned: m, species: 'daisy' });
  }
  tick(120 * MIN);
  for (const [p, id] of [[a, 'boarda1'], [b, 'boardb1'], [c, 'boardc1']]) await ok('POST', '/api/session/end', p.token, { id, status: 'done' });
  const board = (await ok('GET', `/api/board?since=${since}`, a.token)).board;
  assert.deepEqual(board.map(r => [r.name, r.minutes, r.me]), [['Pia', 50, false], ['Oli', 25, true]], 'a stranger is not on your board');
  assert.deepEqual((await ok('GET', `/api/board?since=${T + 1}`, a.token)).board.map(r => r.minutes), [0, 0]);
  const feed = (await ok('GET', '/api/feed', a.token)).feed;
  assert.deepEqual(feed.map(f => f.user.name).sort(), ['Oli', 'Pia']);
  assert.equal(feed[0].species, 'daisy');
  const page = await ok('GET', `/api/friends/${b.id}?since=${since}&week=${since}`, a.token);
  assert.equal(page.stats.total, 50);
  assert.equal(page.recent.length, 1);
  assert.equal((await api('GET', `/api/friends/${c.id}`, a.token)).status, 403, 'only friends can visit');
  assert.equal((await ok('GET', `/api/friends/${a.id}`, a.token)).user.id, a.id);
});

test('cheers, nudges and gifts reach a friend live, wait if they are away, and are limited', async () => {
  const a = await person('Rae'), b = await person('Sol'), c = await person('Tay');
  await friends(a, b);
  const sb = await live(b);
  await ok('POST', '/api/cheer', a.token, { to: b.id, kind: 'cheer' });
  const cheer = await sb.next(m => m.t === 'inbox');
  assert.equal(cheer.item.kind, 'cheer');
  assert.equal(cheer.item.from.name, 'Rae');
  assert.equal((await api('POST', '/api/cheer', a.token, { to: b.id, kind: 'cheer' })).status, 429);
  await ok('POST', '/api/cheer', a.token, { to: b.id, kind: 'nudge' });
  tick(61000);
  await ok('POST', '/api/cheer', a.token, { to: b.id, kind: 'cheer' });
  assert.equal((await api('POST', '/api/cheer', a.token, { to: c.id })).status, 403, 'not to a stranger');
  sb.close();
  await ok('POST', '/api/gift', a.token, { to: b.id, species: 'fox' });
  assert.equal((await api('POST', '/api/gift', a.token, { to: b.id, species: 'dragon' })).status, 400);
  const inbox = (await ok('GET', '/api/me', b.token)).inbox;
  assert.deepEqual(inbox.map(i => i.kind), ['cheer', 'nudge', 'cheer', 'gift']);
  assert.deepEqual(inbox[3].data, { species: 'fox' });
  await ok('POST', '/api/inbox/ack', b.token, { ids: inbox.map(i => i.id) });
  assert.deepEqual((await ok('GET', '/api/me', b.token)).inbox, []);
  await ok('POST', '/api/inbox/ack', c.token, { ids: inbox.map(i => i.id) });
});

test('focusing together: everyone starts at the same moment and finishes with a bonus', async () => {
  const a = await person('Uma'), b = await person('Vik'), c = await person('Wen');
  await friends(a, b); await friends(a, c);
  const sa = await live(a), sb = await live(b), sc = await live(c);
  const room = (await ok('POST', '/api/rooms', a.token, { minutes: 25, rule: 'together', species: 'oak' })).room;
  assert.match(room.code, /^[A-HJKMNP-Z2-9]{6}$/);
  assert.equal(room.state, 'lobby');
  await ok('POST', '/api/rooms/invite', a.token, { code: room.code, to: b.id });
  const invite = await sb.next(m => m.t === 'inbox' && m.item.kind === 'invite');
  assert.deepEqual(invite.item.data, { code: room.code, minutes: 25, rule: 'together' });
  await ok('POST', '/api/rooms/join', b.token, { code: room.code, species: 'fern' });
  assert.equal((await sa.next(m => m.t === 'room' && m.room.members.length === 2)).room.members[1].name, 'Vik');
  assert.deepEqual((await ok('GET', '/api/me', b.token)).inbox, [], 'the invitation is cleared on joining');
  await ok('POST', '/api/rooms/join', c.token, { code: room.code.toLowerCase() });
  await ok('POST', '/api/rooms/species', c.token, { code: room.code, species: 'rabbit' });
  assert.equal((await ok('GET', `/api/rooms/${room.code}`, b.token)).room.members[2].species, 'rabbit');
  assert.equal((await api('POST', '/api/rooms/start', b.token, { code: room.code })).status, 403, 'only the host starts');
  sa.clear(); sb.clear(); sc.clear();
  const started = (await ok('POST', '/api/rooms/start', a.token, { code: room.code })).room;
  assert.equal(started.state, 'running');
  assert.equal(started.start, T + 5000);
  for (const s of [sa, sb, sc]) assert.equal((await s.next(m => m.t === 'room' && m.room.state === 'running')).room.start, T + 5000);
  assert.equal((await ok('GET', '/api/me', b.token)).room.code, room.code);
  assert.equal((await api('POST', '/api/rooms/join', (await person('Late')).token, { code: room.code })).status, 400, 'no joining once it has started');
  tick(5000 + 25 * MIN);
  const ids = [a, b, c].map(p => room.code.toLowerCase() + p.id);
  assert.deepEqual(await ok('POST', '/api/session/end', a.token, { id: ids[0], status: 'done' }), { status: 'done', minutes: 25, others: 2 });
  assert.equal((await ok('POST', '/api/session/end', b.token, { id: ids[1], status: 'done' })).others, 2);
  const last = await ok('POST', '/api/session/end', c.token, { id: ids[2], status: 'done' });
  assert.equal(last.others, 2);
  assert.equal((await sa.next(m => m.t === 'room' && m.room.state === 'done')).room.members.every(m => m.status === 'done'), true);
  assert.equal((await ok('GET', '/api/me', a.token)).room, null);
  assert.equal((await ok('GET', '/api/feed', a.token)).feed.filter(f => f.room === room.code).length, 3);
  sa.close(); sb.close(); sc.close();
});

test('together rule: one person leaving ends it for everyone, live', async () => {
  const a = await person('Xan'), b = await person('Yui');
  await friends(a, b);
  const sa = await live(a);
  const room = (await ok('POST', '/api/rooms', a.token, { minutes: 50, rule: 'together' })).room;
  await ok('POST', '/api/rooms/join', b.token, { code: room.code });
  await ok('POST', '/api/rooms/start', a.token, { code: room.code });
  tick(10 * MIN);
  sa.clear();
  await ok('POST', '/api/rooms/leave', b.token, { code: room.code });
  const failed = await sa.next(m => m.t === 'room' && m.room.state === 'failed' && m.by);
  assert.equal(failed.by.name, 'Yui');
  tick(45 * MIN);
  assert.equal((await ok('POST', '/api/session/end', a.token, { id: room.code.toLowerCase() + a.id, status: 'done' })).status, 'failed', 'the host cannot finish a failed room');
  assert.equal((await ok('GET', `/api/board?since=0`, a.token)).board.find(r => r.me).minutes, 0);
  sa.close();
});

test('gentle rule: someone leaving costs only them', async () => {
  const a = await person('Zed'), b = await person('Abe'), c = await person('Bea');
  const room = (await ok('POST', '/api/rooms', a.token, { minutes: 25, rule: 'gentle' })).room;
  await ok('POST', '/api/rooms/join', b.token, { code: room.code });
  await ok('POST', '/api/rooms/join', c.token, { code: room.code });
  await ok('POST', '/api/rooms/start', a.token, { code: room.code });
  tick(10 * MIN);
  assert.equal((await ok('POST', '/api/session/end', b.token, { id: room.code.toLowerCase() + b.id, status: 'failed' })).status, 'failed');
  assert.equal((await ok('GET', `/api/rooms/${room.code}`, a.token)).room.state, 'running');
  tick(15 * MIN + 5000);
  assert.deepEqual(await ok('POST', '/api/session/end', a.token, { id: room.code.toLowerCase() + a.id, status: 'done' }), { status: 'done', minutes: 25, others: 1 });
  assert.equal((await ok('POST', '/api/session/end', c.token, { id: room.code.toLowerCase() + c.id, status: 'done' })).others, 1);
  assert.equal((await ok('GET', `/api/rooms/${room.code}`, a.token)).room.state, 'done');
});

test('rooms: lobby rules', async () => {
  const a = await person('Cal'), b = await person('Dot');
  assert.equal((await api('POST', '/api/rooms', a.token, { minutes: 3 })).status, 400);
  assert.equal((await api('POST', '/api/rooms/join', a.token, { code: 'NOPE22' })).status, 404);
  const first = (await ok('POST', '/api/rooms', a.token, { minutes: 25 })).room;
  const second = (await ok('POST', '/api/rooms', a.token, { minutes: 30 })).room;
  assert.equal((await api('POST', '/api/rooms/join', b.token, { code: first.code })).status, 404, 'opening a new room closes the old one');
  await ok('POST', '/api/rooms/join', b.token, { code: second.code });
  await ok('POST', '/api/rooms/leave', b.token, { code: second.code });
  assert.equal((await ok('GET', `/api/rooms/${second.code}`, a.token)).room.members.length, 1);
  assert.equal((await api('GET', `/api/rooms/${second.code}`, b.token)).status, 404, 'only members can look inside');
  assert.equal((await api('POST', '/api/rooms/invite', a.token, { code: second.code, to: b.id })).status, 403, 'invitations go to friends');
  await ok('POST', '/api/rooms/leave', a.token, { code: second.code });
  assert.equal((await api('POST', '/api/rooms/join', b.token, { code: second.code })).status, 404, 'a room closes when its host leaves');
  const full = (await ok('POST', '/api/rooms', a.token, { minutes: 25 })).room;
  for (let i = 0; i < 7; i++) await ok('POST', '/api/rooms/join', (await person('Seat')).token, { code: full.code });
  T += 3600000 + 1;
  assert.match((await api('POST', '/api/rooms/join', (await person('Seat')).token, { code: full.code })).body.error, /full/);
  T += 3 * 3600000;
  assert.equal((await api('POST', '/api/rooms/join', b.token, { code: full.code })).status, 404, 'an unused lobby closes after two hours');
});

test('moving to another device with a one-time code, and backing up', async () => {
  T += 3600000;
  const a = await person('Eli');
  const link = await ok('POST', '/api/link', a.token);
  assert.match(link.code, /^[A-HJKMNP-Z2-9]{8}$/);
  const claimed = await ok('POST', '/api/link/claim', null, { code: link.code.toLowerCase() });
  assert.equal(claimed.user.id, a.id);
  assert.notEqual(claimed.token, a.token);
  assert.equal((await api('POST', '/api/link/claim', null, { code: link.code })).status, 404, 'a code works once');
  const old = await ok('POST', '/api/link', a.token);
  T += 11 * MIN;
  assert.equal((await api('POST', '/api/link/claim', null, { code: old.code })).status, 404, 'a code runs out after ten minutes');
  assert.equal((await ok('GET', '/api/state', claimed.token)).state, null);
  const state = { v: 1, coins: 120, sessions: [{ id: 's1' }] };
  const put = await ok('PUT', '/api/state', a.token, { state });
  assert.equal(put.at, T);
  assert.deepEqual((await ok('GET', '/api/state', claimed.token)).state, state);
  assert.equal((await ok('GET', '/api/me', a.token)).me.backupAt, T);
  assert.equal((await api('PUT', '/api/state', a.token, { state: { big: 'x'.repeat(610000) } })).status, 413);
  await ok('POST', '/api/logout', claimed.token);
  assert.equal((await api('GET', '/api/me', claimed.token)).status, 401);
  assert.equal((await api('GET', '/api/me', a.token)).status, 200, 'the other device stays signed in');
});

test('deleting a profile removes it everywhere', async () => {
  const a = await person('Flo'), b = await person('Gil');
  await friends(a, b);
  const sb = await live(b);
  await ok('POST', '/api/cheer', a.token, { to: b.id });
  await ok('POST', '/api/account/delete', a.token);
  await sb.next(m => m.t === 'friends');
  const me = await ok('GET', '/api/me', b.token);
  assert.deepEqual(me.friends, []);
  assert.deepEqual(me.inbox, []);
  assert.equal((await api('GET', '/api/me', a.token)).status, 401);
  assert.equal((await api('GET', `/api/find?q=${a.code}`, b.token)).status, 404);
  assert.equal((await api('POST', '/api/register', null, { name: 'Flo', handle: a.handle })).status, 200, 'the username is free again');
  sb.close();
});

test('a live connection needs a fresh ticket, used once', async () => {
  const a = await person('Hal');
  const ticket = (await ok('POST', '/api/live/ticket', a.token)).ticket;
  const open = t => hub.mf.dispatchFetch(`http://hub/api/live?ticket=${t}`, { headers: { Upgrade: 'websocket', 'x-haven-now': String(T) } });
  const first = await open(ticket);
  assert.equal(first.status, 101);
  first.webSocket.accept(); first.webSocket.close(1000, 'bye');
  assert.equal((await open(ticket)).status, 401);
  assert.equal((await open('made-up')).status, 401);
  const late = (await ok('POST', '/api/live/ticket', a.token)).ticket;
  T += 31000;
  assert.equal((await open(late)).status, 401, 'tickets last 30 seconds');
  const plain = await hub.mf.dispatchFetch('http://hub/api/live?ticket=x');
  assert.equal(plain.status, 426);
  await plain.arrayBuffer();
});

test('a deployed server ignores a caller who tries to set the clock', async () => {
  const real = await startHub({ testClock: false });
  try {
    const r = await real.call('GET', '/health', { now: 12345 });
    assert.ok(Math.abs(r.body.now - Date.now()) < 5000);
  } finally { await real.stop(); }
});
