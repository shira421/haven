import test from 'node:test';
import assert from 'node:assert/strict';
import * as leave from '../src/leave.js';

const at = 1_000_000;
const snap = touch => { leave._reset({ lastTouch: touch }); return leave.snapshot(at, 5000); };

test('how the page was left is read from the last touch', () => {
  assert.equal(snap(null).way, 'none', 'the power button leaves no touch');
  assert.equal(snap({ start: at - 300, at: at - 200, kind: 'cancel' }).way, 'gesture', 'a system gesture cancels the touch');
  assert.equal(snap({ start: at - 300, at: at - 300, kind: 'start' }).way, 'gesture', 'a finger still down when the page hid');
  assert.equal(snap({ start: at - 500, at: at - 400, kind: 'end', edge: true }).way, 'gesture', 'a swipe from the edge just before');
  assert.equal(snap({ start: at - 9000, at: at - 8000, kind: 'end', edge: false }).way, 'none', 'a tap seconds earlier, then the power button');
  assert.equal(snap({ start: at - 6000, at: at - 5000, kind: 'cancel' }).way, 'none', 'a cancelled scroll long before');
  leave._reset({ blur: at - 800 });
  assert.equal(leave.snapshot(at, 0).way, 'slow', 'focus lost well before hiding');
  leave._reset();
});

test('time asleep is never counted, and doubt is taken as a lock', () => {
  const info = { way: 'gesture', mono: 0 };
  const j = leave.judge({ info, hiddenAt: 0, back: 600000, monoBack: 60000 });
  assert.equal(j.slept, 540000);
  assert.equal(j.counted, 60000);
  assert.equal(leave.judge({ info: null, hiddenAt: 0, back: 600000, monoBack: 0 }).counted, 0);
  assert.equal(leave.judge({ info: { way: 'none', mono: 0 }, hiddenAt: 0, back: 600000, monoBack: 600000 }).counted, 0, 'awake throughout, no sign of an app');
  assert.equal(leave.judge({ info: { way: 'none', mono: 0 }, hiddenAt: 0, back: 600000, monoBack: 30000 }).counted, 0, 'the usual lock: mostly asleep');
});
