// The friends server, run on the real Workers runtime: every route, and what friends see live.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHub } from './hub-server.mjs';
import { cleanName, cleanHandle, cleanCode, cleanPassword, hashPassword, checkPassword, randomString, weekStart } from '../worker/hub.js';

const MIN = 60000;
const PASS = 'correct horse battery';
let hub, T = Date.UTC(2026, 10, 14, 4, 0, 0), n = 0;
const tick = (ms = 1000) => (T += ms);
before(async () => { hub = await startHub(); });
after(async () => { await hub.stop(); });

const api = (method, path, token, body) => hub.call(method, path, { token, body, now: T });
const ok = async (method, path, token, body) => { const r = await api(method, path, token, body); assert.equal(r.status, 200, `${method} ${path}: ${JSON.stringify(r.body)}`); return r.body; };
// Each test person registers from their own network address, as real people do.
async function person(name) {
  const r = await hub.call('POST', '/api/register', { now: T, ip: `10.1.${Math.floor(++n / 250)}.${n % 250}`, body: { name, handle: `${name.toLowerCase()}_${n}`, password: PASS } });
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
  assert.equal(a.hasPassword, true);
  assert.equal((await api('POST', '/api/register', null, { name: 'Ana', handle: a.handle, password: PASS })).status, 409);
  assert.match((await api('POST', '/api/register', null, { name: '', handle: 'someone_new', password: PASS })).body.error, /Enter a name/);
  assert.match((await api('POST', '/api/register', null, { name: 'Bo', handle: 'no', password: PASS })).body.error, /3 to 20/);
  assert.match((await api('POST', '/api/register', null, { name: 'Bo', handle: 'bo_short', password: 'short' })).body.error, /at least 8/);
  assert.match((await api('POST', '/api/register', null, { name: 'Bo', handle: 'bo_same_as', password: 'Bo_Same_As' })).body.error, /not your username/);
  assert.match((await api('POST', '/api/register', null, { name: 'Bo', handle: 'bo_old_app' })).body.error, /Update Haven/, 'a copy of Haven from before passwords');
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
  const from = (handle, ip) => hub.call('POST', '/api/register', { now: T, ip, body: { name: 'Bulk', handle, password: PASS } });
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
  // A phone checking in while Haven is closed hears about the request.
  const news = (await ok('GET', '/api/news?since=0', b.token)).news;
  assert.deepEqual(news.map(n => [n.kind, n.name]), [['request', 'Asha']]);
  assert.deepEqual((await ok('GET', `/api/news?since=${news[0].created}`, b.token)).news, [], 'nothing twice');
  await ok('POST', '/api/friends/request', a.token, { id: b.id });
  assert.equal(sb.messages.filter(m => m.t === 'request').length, 1, 'asking twice does not notify twice');
  const acc = await ok('POST', '/api/friends/respond', b.token, { id: a.id, accept: true });
  assert.equal(acc.status, 'friends');
  assert.equal((await sa.next(m => m.t === 'accepted')).by.name, 'Ben');
  assert.deepEqual((await ok('GET', '/api/news?since=0', a.token)).news.map(n => [n.kind, n.name]), [['accepted', 'Ben']], 'and so does the person who asked');
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
  assert.equal((await ok('GET', '/api/me', c.token)).inbox.filter(i => i.kind === 'invite').length, 0, 'someone who blocked the one lighting it is not invited');
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
  assert.deepEqual(await ok('POST', '/api/session/end', a.token, { id: ids[0], status: 'done' }), { status: 'done', minutes: 25, others: 2, strict: true }, 'a strict campfire says so, for its 1.2x coins');
  assert.equal((await ok('POST', '/api/session/end', b.token, { id: ids[1], status: 'done' })).others, 2);
  const last = await ok('POST', '/api/session/end', c.token, { id: ids[2], status: 'done' });
  assert.equal(last.others, 2);
  assert.equal((await sa.next(m => m.t === 'room' && m.room.state === 'done')).room.members.every(m => m.status === 'done'), true);
  assert.equal((await ok('GET', '/api/me', a.token)).room.state, 'done', 'a finished campfire stays until you leave it');
  await ok('POST', '/api/rooms/leave', a.token, { code: room.code });
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
  const out = await sa.next(m => m.t === 'inbox' && m.item.kind === 'fire-out');
  assert.equal(out.item.from.name, 'Yui', 'everyone else is told, also through the inbox for a closed app');
  assert.equal((await ok('GET', '/api/me', b.token)).inbox.filter(i => i.kind === 'fire-out').length, 0, 'not the one who left');
  assert.equal((await ok('GET', '/api/news?since=0', a.token)).news.find(n => n.kind === 'fire-out').name, 'Yui');
  tick(45 * MIN);
  assert.equal((await ok('POST', '/api/session/end', a.token, { id: room.code.toLowerCase() + a.id, status: 'done' })).status, 'failed', 'the host cannot finish a failed room');
  assert.equal((await ok('GET', `/api/board?since=0`, a.token)).board.find(r => r.me).minutes, 0);
  sa.close();
});

test('a finished campfire: anyone can leave, whoever lit it too, while someone is still focusing', async () => {
  const a = await person('Ida'), b = await person('Jo'), c = await person('Kit');
  const room = (await ok('POST', '/api/rooms', a.token, { minutes: 25, rule: 'together' })).room;
  await ok('POST', '/api/rooms/join', b.token, { code: room.code });
  await ok('POST', '/api/rooms/join', c.token, { code: room.code });
  await ok('POST', '/api/rooms/start', a.token, { code: room.code });
  tick(5000 + 25 * MIN);
  for (const p of [a, b]) await ok('POST', '/api/session/end', p.token, { id: room.code.toLowerCase() + p.id, status: 'done' });
  // Kit has not opened Haven since. The others stay round the fire until they choose to go.
  const seen = (await ok('GET', '/api/me', a.token)).room;
  assert.equal(seen.state, 'running');
  assert.deepEqual(seen.members.map(m => m.status), ['done', 'done', 'focusing']);
  const sa = await live(a), sb = await live(b);
  await ok('POST', '/api/rooms/leave', a.token, { code: room.code });
  assert.equal((await sa.next(m => m.t === 'room')).room, null, 'whoever lit it can leave');
  assert.equal((await sb.next(m => m.t === 'room')).room.members[0].gone, true, 'the others see they went');
  assert.equal((await ok('GET', '/api/me', a.token)).room, null);
  assert.equal((await ok('GET', `/api/rooms/${room.code}`, b.token)).room.members[0].status, 'done', 'leaving afterwards keeps the finished session');
  const kit = await ok('POST', '/api/session/end', c.token, { id: room.code.toLowerCase() + c.id, status: 'done' });
  assert.equal(kit.others, 2, 'Kit finishing later still counts the two who left');
  // Lighting another campfire moves on from a finished one.
  const next = (await ok('POST', '/api/rooms', b.token, { minutes: 30 })).room;
  assert.equal((await ok('GET', '/api/me', b.token)).room.code, next.code);
  sa.close(); sb.close();
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

test('passwords are stored hashed, each with its own salt', async () => {
  const one = await hashPassword(PASS), two = await hashPassword(PASS);
  assert.match(one, /^pbkdf2\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.notEqual(one, two);
  assert.equal(await checkPassword(PASS, one), true);
  assert.equal(await checkPassword(PASS + ' ', one), false);
  assert.equal(await checkPassword(PASS, null), false);
  assert.equal(await checkPassword('', ''), false);
  assert.throws(() => cleanPassword('x'.repeat(129)), /128/);
  assert.equal(cleanPassword('pässwörd'), 'pässwörd');
});

test('signing in on another device with the username and password, and backing up', async () => {
  T += 3600000;
  const a = await person('Eli');
  const login = (handle, password, ip = '10.9.0.1') => hub.call('POST', '/api/login', { now: T, ip, body: { handle, password } });
  const first = await login('@' + a.handle.toUpperCase(), PASS);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const claimed = first.body;
  assert.equal(claimed.user.id, a.id);
  assert.notEqual(claimed.token, a.token);
  assert.equal(claimed.user.hasPassword, true);
  const wrong = await login(a.handle, 'not the password');
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error, 'Wrong username or password.');
  assert.equal((await login('nobody_here', PASS)).body.error, 'Wrong username or password.', 'an unknown username reads the same');
  assert.equal((await api('POST', '/api/link', a.token)).status, 410, 'one-time device codes are gone');
  assert.equal((await api('POST', '/api/link/claim', null, { code: 'ABCDEFGH' })).status, 410);
  // Wrong guesses are counted even though they fail, and lock the account for a while.
  for (let i = 0; i < 10; i++) await login(a.handle, 'guess ' + i, '10.9.1.1');
  const locked = await login(a.handle, PASS, '10.9.1.1');
  assert.equal(locked.status, 429);
  assert.match(locked.body.error, /15 minutes/);
  assert.equal((await login(a.handle, PASS, '10.9.2.2')).status, 200, 'the owner, elsewhere, is not locked out by a stranger guessing');
  T += 16 * MIN;
  assert.equal((await login(a.handle, PASS, '10.9.1.1')).status, 200);
  assert.equal((await ok('GET', '/api/state', claimed.token)).state, null);
  const state = { v: 1, coins: 120, sessions: [{ id: 's1' }] };
  const put = await ok('PUT', '/api/state', a.token, { state });
  assert.equal(put.at, T);
  assert.deepEqual((await ok('GET', '/api/state', claimed.token)).state, state);
  // Saves carry the revision they were based on, so two devices cannot overwrite each other.
  assert.equal(put.rev, 1);
  assert.equal((await ok('GET', '/api/state', claimed.token)).rev, 1);
  assert.equal((await api('PUT', '/api/state', claimed.token, { state, base: 0 })).status, 409, 'a save based on an old copy is refused');
  assert.equal((await ok('PUT', '/api/state', claimed.token, { state, base: 1 })).rev, 2);
  assert.equal((await ok('GET', '/api/me', a.token)).me.backupAt, T);
  assert.equal((await api('PUT', '/api/state', a.token, { state: { big: 'x'.repeat(610000) } })).status, 413);
  await ok('POST', '/api/logout', claimed.token);
  assert.equal((await api('GET', '/api/me', claimed.token)).status, 401);
  assert.equal((await api('GET', '/api/me', a.token)).status, 200, 'the other device stays signed in');
});

test('changing the password signs the other devices out', async () => {
  T += 3600000;
  const a = await person('Ivy');
  const other = (await ok('POST', '/api/login', null, { handle: a.handle, password: PASS })).token;
  assert.equal((await api('POST', '/api/password', a.token, { current: 'wrong one', password: 'a brand new one' })).status, 403);
  assert.match((await api('POST', '/api/password', a.token, { current: PASS, password: 'tiny' })).body.error, /at least 8/);
  const r = await ok('POST', '/api/password', a.token, { current: PASS, password: 'a brand new one' });
  assert.equal(r.me.hasPassword, true);
  assert.equal((await api('GET', '/api/me', a.token)).status, 200, 'this device stays signed in');
  assert.equal((await api('GET', '/api/me', other)).status, 401);
  assert.equal((await api('POST', '/api/login', null, { handle: a.handle, password: PASS })).status, 401);
  assert.equal((await api('POST', '/api/login', null, { handle: a.handle, password: 'a brand new one' })).status, 200);
});

test('a profile made before passwords sets one, then signs in anywhere', async () => {
  T += 3600000;
  const a = await person('Old');
  // What such a profile looks like on the server: a token, and no password.
  await hub.mf.dispatchFetch('http://hub/test/sql', { method: 'POST', body: JSON.stringify({ q: 'UPDATE users SET pass=NULL WHERE id=?', p: [a.id] }) });
  assert.equal((await ok('GET', '/api/me', a.token)).me.hasPassword, false);
  assert.match((await api('POST', '/api/login', null, { handle: a.handle, password: PASS })).body.error, /no password yet/);
  const set = await ok('POST', '/api/password', a.token, { password: 'my first password' });
  assert.equal(set.me.hasPassword, true);
  assert.equal(set.me.handle, a.handle);
  assert.equal((await api('GET', '/api/me', a.token)).status, 200);
  const again = await ok('POST', '/api/login', null, { handle: a.handle, password: 'my first password' });
  assert.equal(again.user.id, a.id, 'the password is tied to the same username and haven');
});

test('signing in with Google: a new person, the same person again, and connecting an account', async () => {
  T += 3600000;
  const go = async path => { const r = await hub.mf.dispatchFetch('http://hub' + path, { redirect: 'manual', headers: { 'x-haven-now': String(T) } }); await r.arrayBuffer(); return r; };
  const follow = async path => { const r = await go(path); assert.equal(r.status, 302, path); const next = r.headers.get('Location'); return next.startsWith('http://hub') ? follow(next.slice(10)) : next; };
  const site = 'https://shira421.github.io/haven/';
  assert.equal((await ok('GET', '/health')).google, true);
  assert.equal((await go('/auth/google/start?return=' + encodeURIComponent('https://evil.example/'))).status, 400, 'only Haven itself can be returned to');
  assert.equal((await go('/auth/google/start?return=' + encodeURIComponent(site + '?x=1'))).status, 400);
  const real = await go('/auth/google/start?return=' + encodeURIComponent(site));
  assert.match(real.headers.get('Location'), /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?client_id=test-client&redirect_uri=http%3A%2F%2Fhub%2Fauth%2Fgoogle%2Fcallback&response_type=code&scope=openid\+profile&state=[a-z0-9]{40}/);
  // Someone new: Google vouches for them, then they choose a username.
  const back = await follow(`/auth/google/start?return=${encodeURIComponent(site)}&as=${encodeURIComponent('g-123|Noor')}`);
  assert.match(back, /^https:\/\/shira421\.github\.io\/haven\/#google=[a-z0-9]{40}$/);
  const code = back.split('=')[1];
  assert.deepEqual(await ok('POST', '/api/google/claim', null, { code }), { needsProfile: true, name: 'Noor' });
  assert.match((await api('POST', '/api/google/claim', null, { code, handle: 'x' })).body.error, /3 to 20/);
  const made = await ok('POST', '/api/google/claim', null, { code, handle: 'noor_g', name: 'Noor' });
  assert.equal(made.user.handle, 'noor_g');
  assert.deepEqual([made.user.hasPassword, made.user.google], [false, true]);
  assert.equal((await api('POST', '/api/google/claim', null, { code })).status, 404, 'a code works once');
  assert.match((await api('POST', '/api/login', null, { handle: 'noor_g', password: PASS })).body.error, /signs in with Google/);
  // The same person on another device, from the app.
  const app = await follow(`/auth/google/start?return=${encodeURIComponent('haven://auth')}&as=g-123`);
  assert.match(app, /^haven:\/\/auth\?google=[a-z0-9]{40}$/);
  const second = await ok('POST', '/api/google/claim', null, { code: app.split('=')[1] });
  assert.equal(second.user.id, made.user.id);
  assert.notEqual(second.token, made.token);
  // Without a password, Google is the only way in, so it cannot be disconnected.
  assert.match((await api('POST', '/api/google/unlink', made.token)).body.error, /Set a password first/);
  await ok('POST', '/api/password', made.token, { password: PASS });
  assert.equal((await ok('POST', '/api/google/unlink', made.token)).me.google, false);
  // An account with a password connects Google from Settings.
  const a = await person('Pia');
  const link = (await ok('POST', '/api/google/link', a.token)).code;
  assert.equal(await follow(`/auth/google/start?return=${encodeURIComponent(site)}&link=${link}&as=g-777`), site + '#google=linked');
  assert.equal((await ok('GET', '/api/me', a.token)).me.google, true);
  assert.equal((await go(`/auth/google/start?return=${encodeURIComponent(site)}&link=${link}&as=g-777`)).status, 400, 'a link works once');
  const viaGoogle = await follow(`/auth/google/start?return=${encodeURIComponent(site)}&as=g-777`);
  assert.equal((await ok('POST', '/api/google/claim', null, { code: viaGoogle.split('=')[1] })).user.id, a.id);
  // A Google account already on one profile cannot be connected to another.
  const b = await person('Quin');
  const link2 = (await ok('POST', '/api/google/link', b.token)).code;
  assert.equal(await follow(`/auth/google/start?return=${encodeURIComponent(site)}&link=${link2}&as=g-777`), site + '#google-error=taken');
  // The app keeps a secret and sends only its hash; the code alone is then no use to anyone else.
  const secret = 'f'.repeat(64), challenge = '0e5b3af1a6e9dd26a4b6d6fd6f3c1b0a'.repeat(2);
  const sha = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), x => x.toString(16).padStart(2, '0')).join('');
  const guarded = await follow(`/auth/google/start?return=${encodeURIComponent('haven://auth')}&challenge=${await sha(secret)}&as=g-777`);
  const guardedCode = guarded.split('=')[1];
  assert.equal((await api('POST', '/api/google/claim', null, { code: guardedCode })).status, 404, 'the code without the secret');
  assert.equal((await api('POST', '/api/google/claim', null, { code: guardedCode, verifier: challenge })).status, 404, 'the wrong secret');
  assert.equal((await ok('POST', '/api/google/claim', null, { code: guardedCode, verifier: secret })).user.id, a.id);
  // Cancelling at Google, and a state that has run out.
  const state = (await go('/auth/google/start?return=' + encodeURIComponent(site))).headers.get('Location').match(/state=([a-z0-9]+)/)[1];
  assert.equal(await follow(`/auth/google/callback?state=${state}&error=access_denied`), site + '#google-error=cancelled');
  assert.equal((await go(`/auth/google/callback?state=${state}&code=test:g-1`)).status, 400);
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
  assert.equal((await api('POST', '/api/register', null, { name: 'Flo', handle: a.handle, password: PASS })).status, 200, 'the username is free again');
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

test('sanctuaries: make one, invite a friend, join by code, see every haven, leave', async () => {
  const a = await person('Kit'), b = await person('Lu'), c = await person('Mo'), stranger = await person('Ned');
  await friends(a, b);
  const made = (await ok('POST', '/api/sanctuaries', a.token, { name: '  Study  club ' })).sanctuary;
  assert.equal(made.name, 'Study club');
  assert.equal(made.owner, a.id);
  assert.equal((await api('POST', '/api/sanctuaries', a.token, { name: '' })).status, 400);

  // A friend is invited, hears about it, and joins with the code.
  const sb = await live(b);
  await ok('POST', '/api/sanctuaries/invite', a.token, { id: made.id, to: b.id });
  const invite = await sb.next(m => m.t === 'inbox' && m.item.kind === 'sanctuary');
  assert.equal(invite.item.data.name, 'Study club');
  assert.equal((await api('POST', '/api/sanctuaries/invite', a.token, { id: made.id, to: c.id })).status, 403, 'only friends can be invited');
  await ok('POST', '/api/sanctuaries/join', b.token, { code: invite.item.data.code });
  assert.deepEqual((await ok('GET', '/api/me', b.token)).inbox.filter(i => i.kind === 'sanctuary'), [], 'joining clears the invitation');
  await ok('POST', '/api/sanctuaries/join', c.token, { code: made.code.toLowerCase() });

  // Members see each other's havens; others cannot.
  await ok('POST', '/api/profile', b.token, { card: { level: 3, side: 6, tiles: [[1, 1, 'dog', 2, 'corgi']] } });
  const sa = await live(a);
  await ok('POST', '/api/profile', b.token, { card: { level: 3, side: 6, tiles: [[2, 2, 'dog', 2, 'corgi']] } });
  assert.equal((await sa.next(m => m.t === 'haven')).id, b.id, 'a change to a member’s haven is heard live');
  const full = (await ok('GET', `/api/sanctuaries/${made.id}`, a.token)).sanctuary;
  assert.deepEqual(full.members.map(m => m.name), ['Kit', 'Lu', 'Mo']);
  assert.deepEqual(full.members[1].card.tiles, [[2, 2, 'dog', 2, 'corgi']]);
  assert.equal((await api('GET', `/api/sanctuaries/${made.id}`, stranger.token)).status, 404);
  assert.equal((await ok('GET', '/api/sanctuaries', c.token)).sanctuaries[0].members.length, 3);

  // Only the person looking after it can rename it or ask someone to leave.
  assert.equal((await api('POST', '/api/sanctuaries/edit', b.token, { id: made.id, name: 'Mine now' })).status, 403);
  await ok('POST', '/api/sanctuaries/edit', a.token, { id: made.id, name: 'Night owls', remove: c.id });
  assert.deepEqual((await ok('GET', '/api/sanctuaries', c.token)).sanctuaries, []);

  // When the owner leaves, the next person looks after it; when the last leaves, it is gone.
  await ok('POST', '/api/sanctuaries/leave', a.token, { id: made.id });
  const left = (await ok('GET', '/api/sanctuaries', b.token)).sanctuaries[0];
  assert.equal(left.name, 'Night owls');
  assert.equal(left.owner, b.id);
  await ok('POST', '/api/sanctuaries/leave', b.token, { id: made.id });
  assert.equal((await api('POST', '/api/sanctuaries/join', c.token, { code: made.code })).status, 404);
  sa.close(); sb.close();
});

test('sanctuaries have limits: eight havens each round the great tree, five each person', async () => {
  const owner = await person('Owner');
  const s = (await ok('POST', '/api/sanctuaries', owner.token, { name: 'Big' })).sanctuary;
  for (let i = 0; i < 7; i++) { const p = await person('P' + i); await ok('POST', '/api/sanctuaries/join', p.token, { code: s.code }); }
  const late = await person('Late');
  assert.match((await api('POST', '/api/sanctuaries/join', late.token, { code: s.code })).body.error, /full/);
  for (let i = 0; i < 4; i++) await ok('POST', '/api/sanctuaries', owner.token, { name: 'More ' + i });
  assert.match((await api('POST', '/api/sanctuaries', owner.token, { name: 'Too many' })).body.error, /up to 5/);
});

test('the great tree grows with the week\'s focus and blooms once at the goal', async () => {
  T = weekStart(T) + 7 * 86400000 + 3600000; // early on a Monday
  const a = await person('Tia'), b = await person('Uri');
  const s = (await ok('POST', '/api/sanctuaries', a.token, { name: 'Grove' })).sanctuary;
  await ok('POST', '/api/sanctuaries/join', b.token, { code: s.code });
  let tree = (await ok('GET', `/api/sanctuaries/${s.id}`, a.token)).sanctuary.tree;
  assert.deepEqual([tree.minutes, tree.goal, tree.stage, tree.blooms], [0, 240, 0, 0], 'two people: 240 min to bloom');
  const sa = await live(a);
  let n = 0;
  const focus = async (p, minutes) => {
    const id = `tree${++n}${p.id.slice(0, 4)}`;
    await ok('POST', '/api/session/start', p.token, { id, planned: minutes, species: 'oak' });
    T += minutes * MIN;
    await ok('POST', '/api/session/end', p.token, { id, status: 'done' });
  };
  await focus(a, 90);
  await focus(b, 60);
  tree = (await ok('GET', `/api/sanctuaries/${s.id}`, b.token)).sanctuary.tree;
  assert.deepEqual([tree.minutes, tree.stage], [150, 3]);
  assert.deepEqual(tree.top.map(t => [t.id, t.minutes]), [[a.id, 90], [b.id, 60]]);
  await focus(b, 90);
  const bloom = await sa.next(m => m.t === 'inbox' && m.item.kind === 'bloom');
  assert.equal(bloom.item.data.name, 'Grove');
  tree = (await ok('GET', `/api/sanctuaries/${s.id}`, a.token)).sanctuary.tree;
  assert.deepEqual([tree.stage, tree.blooms], [5, 1]);
  await focus(a, 30);
  assert.equal((await ok('GET', `/api/sanctuaries/${s.id}`, a.token)).sanctuary.tree.blooms, 1, 'once a week');
  // A new week starts the tree again.
  T = weekStart(T) + 7 * 86400000 + 60000;
  tree = (await ok('GET', `/api/sanctuaries/${s.id}`, a.token)).sanctuary.tree;
  assert.deepEqual([tree.minutes, tree.stage, tree.blooms], [0, 0, 1]);
  sa.close();
});

test('a campfire lit in a sanctuary invites everyone in it, friends or not, and shows there', async () => {
  T += 3600000;
  const a = await person('Vi'), b = await person('Wes'), c = await person('Xan');
  const s = (await ok('POST', '/api/sanctuaries', a.token, { name: 'Embers' })).sanctuary;
  for (const p of [b, c]) await ok('POST', '/api/sanctuaries/join', p.token, { code: s.code });
  await ok('POST', '/api/friends/block', c.token, { id: a.id });
  const sb = await live(b);
  const room = (await ok('POST', '/api/sanctuaries/campfire', a.token, { id: s.id, minutes: 25, rule: 'together', species: 'fern' })).room;
  const invite = await sb.next(m => m.t === 'inbox' && m.item.kind === 'invite');
  assert.deepEqual([invite.item.data.code, invite.item.data.sanctuary, invite.item.data.minutes], [room.code, 'Embers', 25]);
  assert.match((await api('POST', '/api/sanctuaries/campfire', b.token, { id: s.id, minutes: 25 })).body.error, /already lit/);
  let fire = (await ok('GET', `/api/sanctuaries/${s.id}`, b.token)).sanctuary.campfire;
  assert.deepEqual([fire.code, fire.state, fire.members.length], [room.code, 'lobby', 1]);
  await ok('POST', '/api/rooms/join', b.token, { code: room.code, species: 'oak' });
  await sb.next(m => m.t === 'sanctuary' && m.id === s.id);
  fire = (await ok('GET', `/api/sanctuaries/${s.id}`, a.token)).sanctuary.campfire;
  assert.equal(fire.members.length, 2);
  assert.equal((await api('POST', '/api/sanctuaries/campfire', (await person('Out')).token, { id: s.id, minutes: 25 })).status, 404, 'only those in the sanctuary');
  sb.close();
});

test('care for animals in other havens of the sanctuary, and animals that meet become friends', async () => {
  T += 3600000;
  const a = await person('Yas'), b = await person('Zed'), out = await person('Odd');
  const s = (await ok('POST', '/api/sanctuaries', a.token, { name: 'Den' })).sanctuary;
  await ok('POST', '/api/sanctuaries/join', b.token, { code: s.code });
  const sb = await live(b);
  await ok('POST', '/api/sanctuaries/care', a.token, { id: s.id, to: b.id, item: 'fox001', species: 'fox', kind: 'treat' });
  const care = await sb.next(m => m.t === 'inbox' && m.item.kind === 'care');
  assert.deepEqual([care.item.data.kind, care.item.data.item, care.item.data.species, care.item.from.id], ['treat', 'fox001', 'fox', a.id]);
  await ok('POST', '/api/sanctuaries/care', a.token, { id: s.id, to: b.id, item: 'fox001', species: 'fox', kind: 'pet' });
  await ok('POST', '/api/sanctuaries/care', a.token, { id: s.id, to: b.id, item: 'fox001', species: 'fox', kind: 'pet' });
  const pets = (await ok('GET', '/api/me', b.token)).inbox.filter(i => i.kind === 'care' && i.data.kind === 'pet');
  assert.equal(pets.length, 1, 'pats are told at most every half hour');
  assert.equal((await api('POST', '/api/sanctuaries/care', a.token, { id: s.id, to: a.id, item: 'x', species: 'fox' })).status, 404, 'not your own haven');
  assert.equal((await api('POST', '/api/sanctuaries/care', a.token, { id: s.id, to: b.id, item: 'x', species: 'oak' })).status, 400, 'only animals');
  assert.equal((await api('POST', '/api/sanctuaries/care', out.token, { id: s.id, to: b.id, item: 'x', species: 'fox' })).status, 404);
  // Two animals from different havens meet.
  const ka = `${a.id}:rab01:rabbit`, kb = `${b.id}:fox001:fox`;
  assert.deepEqual(await ok('POST', '/api/sanctuaries/pal', a.token, { id: s.id, a: ka, b: kb }), { status: 'friends' });
  assert.deepEqual(await ok('POST', '/api/sanctuaries/pal', b.token, { id: s.id, a: kb, b: ka }), { status: 'known' }, 'seen from either side, once');
  const pal = await sb.next(m => m.t === 'inbox' && m.item.kind === 'pal');
  assert.deepEqual([pal.item.data.mine, pal.item.data.theirs, pal.item.from.id], ['fox', 'rabbit', a.id]);
  assert.equal((await api('POST', '/api/sanctuaries/pal', a.token, { id: s.id, a: ka, b: `${a.id}:cat01:cat` })).status, 400, 'animals from the same haven are already home together');
  assert.equal((await api('POST', '/api/sanctuaries/pal', a.token, { id: s.id, a: ka, b: `${out.id}:cat01:cat` })).status, 404);
  assert.deepEqual((await ok('GET', `/api/sanctuaries/${s.id}`, a.token)).sanctuary.pals.map(p => [p.a, p.b]), [[ka, kb].sort()]);
  await ok('POST', '/api/sanctuaries/leave', b.token, { id: s.id });
  assert.deepEqual((await ok('GET', `/api/sanctuaries/${s.id}`, a.token)).sanctuary.pals, [], 'leaving takes its friendships with it');
  sb.close();
});

test('reporting someone keeps a record for the server owner, once a day per person', async () => {
  T += 3600000;
  const a = await person('Rae'), b = await person('Sam');
  assert.deepEqual(await ok('POST', '/api/report', a.token, { id: b.id, reason: 'name', place: 'sanctuary' }), { status: 'reported' });
  await ok('POST', '/api/report', a.token, { id: b.id, reason: 'spam' });
  const rows = (await (await hub.mf.dispatchFetch('http://hub/test/sql', { method: 'POST', body: JSON.stringify({ q: 'SELECT reason, place, about_handle FROM reports WHERE about_id=?', p: [b.id] }) })).json()).rows;
  assert.deepEqual(rows, [{ reason: 'name', place: 'sanctuary', about_handle: b.handle }]);
  assert.equal((await api('POST', '/api/report', a.token, { id: a.id })).status, 404);
  await ok('POST', '/api/account/delete', b.token);
  assert.equal((await (await hub.mf.dispatchFetch('http://hub/test/sql', { method: 'POST', body: JSON.stringify({ q: 'SELECT COUNT(*) AS n FROM reports WHERE about_id=?', p: [b.id] }) })).json()).rows[0].n, 1, 'kept after they delete their account');
});
