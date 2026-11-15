process.env.TZ = 'Asia/Singapore';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { Timer } from '../src/timer.js';

const T0 = new Date(2026, 10, 14, 9, 0).getTime(), MIN = 60000;
function make({ native = false, social = {} } = {}) {
  const clock = { t: T0 }, events = [], calls = [];
  const store = new Store({ now: () => clock.t });
  const fakeSocial = {
    account: { id: 'me' }, offset: 0, data: { room: null },
    sessionStarted: async a => { calls.push(['start', a.id]); return true; },
    sessionEnded: async (id, status) => { calls.push(['end', status]); return { status, minutes: 25, others: 0 }; },
    syncSessions: async () => { calls.push(['sync']); }, pushCard() {}, scheduleBackup() {},
    roomSessionId: room => room.code.toLowerCase() + 'me', ...social,
  };
  const sound = { start() {}, stop() {}, unlock() {}, chime() { calls.push(['chime']); } };
  const timer = new Timer({ store, social: fakeSocial, sound, now: () => clock.t, native: () => native });
  timer.on((type, payload) => events.push([type, payload]));
  const stop = () => clearInterval(timer.interval);
  return { store, timer, clock, events, calls, stop, names: () => events.map(e => e[0]).filter(n => n !== 'tick' && n !== 'break-tick') };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

test('a session runs to the end and is reported to friends', async () => {
  const x = make();
  assert.equal(x.timer.start().ok, true);
  await settle();
  assert.equal(x.store.state.active.remote, true);
  x.clock.t += 25 * MIN;
  x.timer.tick();
  await settle();
  assert.deepEqual(x.names(), ['started', 'finished']);
  assert.equal(x.store.state.sessions[0].synced, true);
  assert.deepEqual(x.calls.map(c => c.join(':')), ['start:' + x.store.state.sessions[0].id, 'chime', 'end:done']);
  x.stop();
});

test('cancelling in the first ten seconds leaves nothing; after that it is giving up', () => {
  const x = make();
  x.timer.start();
  x.clock.t += 9000;
  assert.ok(x.timer.cancelLeft() > 0);
  x.timer.giveUp();
  assert.equal(x.store.state.sessions.length, 0);
  x.timer.start();
  x.clock.t += 11000;
  assert.equal(x.timer.cancelLeft(), 0);
  x.timer.giveUp();
  assert.equal(x.store.state.sessions[0].status, 'failed');
  assert.deepEqual(x.names(), ['started', 'cancelled', 'started', 'failed']);
  x.stop();
});

test('in a browser, the plant withers the moment the allowance runs out while hidden', () => {
  const x = make();
  x.timer.start();
  x.clock.t += MIN;
  x.timer.hidden();
  x.clock.t += 9000;
  x.timer.tick();
  assert.equal(x.timer.warned, false, 'no warning yet');
  x.clock.t += 1000;
  x.timer.tick();
  assert.equal(x.timer.warned, true, 'a third of the way through the time away, a "come back" notification');
  x.clock.t += 19000;
  x.timer.tick();
  assert.ok(x.store.state.active, 'twenty-nine seconds is still allowed');
  x.clock.t += 1500;
  x.timer.tick();
  assert.equal(x.store.state.active, null);
  assert.equal(x.events.at(-1)[0], 'failed');
  assert.equal(x.events.at(-1)[1].reason, 'left');
  assert.equal(x.events.at(-1)[1].away, 31);
  x.stop();
});

test('coming back within the allowance carries on; deep focus off never withers', async () => {
  const x = make();
  x.timer.start();
  x.timer.hidden();
  x.clock.t += 10000;
  await x.timer.visible();
  assert.ok(x.store.state.active);
  assert.equal(x.store.state.active.hiddenAt, undefined);
  x.timer.giveUp();
  x.store.set({ deep: false });
  x.timer.start();
  x.timer.hidden();
  x.clock.t += 20 * MIN;
  x.timer.tick();
  await x.timer.visible();
  assert.ok(x.store.state.active, 'still running after twenty minutes away');
  x.clock.t += 5 * MIN;
  x.timer.tick();
  await settle();
  assert.equal(x.store.state.sessions.at(-1).status, 'done');
  x.stop();
});

test('leaving shortly before the end still finishes the session', async () => {
  const x = make();
  x.timer.start();
  x.clock.t += 25 * MIN - 8000;
  x.timer.hidden();
  x.clock.t += 60 * MIN; // back an hour later
  await x.timer.visible();
  await settle();
  assert.equal(x.store.state.sessions[0].status, 'done', 'only the eight seconds before the end count as away');
  x.stop();
});

test('in the apps, time away is judged when Haven comes back, not while it is in the background', async () => {
  const x = make({ native: true });
  x.timer.start();
  x.timer.hidden();
  x.clock.t += 5 * MIN;
  x.timer.tick();
  assert.ok(x.store.state.active, 'not judged while in the background');
  await x.timer.visible(); // no bridge in this test, so the phone was not locked
  assert.equal(x.store.state.sessions[0].status, 'failed');
  x.stop();
});

test('a restart mid-session picks the session up, or fails it if Haven was closed for long', async () => {
  const x = make();
  x.timer.start();
  x.clock.t += 12000;
  x.timer.tick(); // heartbeat
  x.stop();
  const again = new Timer({ store: x.store, social: x.timer.social, sound: x.timer.sound, now: () => x.clock.t, native: () => false });
  x.clock.t += 5000;
  await again.resume();
  assert.ok(x.store.state.active, 'reopened within the allowance');
  clearInterval(again.interval);
  x.clock.t += 11000;
  again.tick();
  x.clock.t += 5 * MIN;
  const third = new Timer({ store: x.store, social: x.timer.social, sound: x.timer.sound, now: () => x.clock.t, native: () => false });
  await third.resume();
  assert.equal(x.store.state.active, null);
  assert.equal(x.store.state.sessions[0].reason, 'left');
  clearInterval(third.interval);
});

test('pomodoro: rounds, breaks, the long break, and stopping', async () => {
  const x = make();
  x.store.set({ mode: 'pomodoro', pomodoro: { focus: 25, short: 5, long: 15, rounds: 2, auto: true } });
  x.timer.start();
  assert.equal(x.store.state.active.round, 1);
  x.clock.t += 25 * MIN; x.timer.tick(); await settle();
  assert.deepEqual({ ...x.store.state.cycle }, { round: 2, rounds: 2, breakUntil: x.clock.t + 5 * MIN, breakKind: 'short' });
  assert.equal(Math.round(x.timer.breakLeft()), 300);
  x.clock.t += 5 * MIN; x.timer.tick(); await settle();
  assert.equal(x.store.state.active.round, 2, 'the next round starts by itself');
  x.clock.t += 25 * MIN; x.timer.tick(); await settle();
  assert.equal(x.store.state.cycle.breakKind, 'long');
  assert.equal(x.store.state.cycle.done, true);
  x.clock.t += 15 * MIN; x.timer.tick();
  assert.equal(x.store.state.cycle, null);
  assert.equal(x.names().at(-1), 'cycle-done');
  assert.equal(x.store.state.sessions.filter(s => s.mode === 'pomodoro' && s.status === 'done').length, 2);
  // Without auto-start the break ends and waits.
  x.store.set({ pomodoro: { focus: 25, short: 5, long: 15, rounds: 3, auto: false } });
  x.timer.start();
  x.clock.t += 25 * MIN; x.timer.tick(); await settle();
  x.clock.t += 5 * MIN; x.timer.tick();
  assert.equal(x.store.state.active, null);
  assert.equal(x.names().at(-1), 'break-over');
  x.timer.endCycle();
  assert.equal(x.store.state.cycle, null);
  x.stop();
});

test('a room session starts on the server clock and takes the bonus from the server', async () => {
  const room = { code: 'ABCDEF', state: 'running', minutes: 25, rule: 'together', start: T0 + 5000 + 2000, members: [{ id: 'me', status: 'focusing', species: 'fern' }, { id: 'you', status: 'focusing', species: 'clover' }] };
  const x = make({ social: { offset: 2000, data: { room }, sessionEnded: async (id, status) => ({ status, minutes: 25, others: 1 }) } });
  x.timer.startRoom(room);
  assert.equal(x.store.state.active.id, 'abcdefme');
  assert.equal(x.store.state.active.start, T0 + 5000, 'the server start, moved onto this phone\'s clock');
  assert.equal(x.store.state.active.species, 'fern');
  assert.equal(x.timer.cancelLeft(), 0, 'no free cancel in a room');
  x.timer.startRoom(room);
  assert.equal(x.names().filter(n => n === 'started').length, 1, 'starting twice does nothing');
  x.clock.t += 5000 + 25 * MIN; x.timer.tick(); await settle();
  assert.equal(x.store.state.sessions[0].others, 1);
  assert.equal(x.store.state.sessions[0].coins, 66);
  x.stop();
});

test('a room the server says has failed cannot be finished', async () => {
  const room = { code: 'ABCDEF', state: 'running', minutes: 25, rule: 'together', start: T0, members: [{ id: 'me', status: 'focusing', species: 'clover' }] };
  const x = make({ social: { data: { room }, sessionEnded: async () => ({ status: 'failed' }) } });
  x.timer.startRoom(room);
  x.clock.t += 25 * MIN; x.timer.tick(); await settle();
  assert.equal(x.store.state.sessions[0].status, 'failed');
  assert.equal(x.store.state.sessions[0].reason, 'friend-left');
  x.stop();
});
