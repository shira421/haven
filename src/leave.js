// Why did a phone's browser hide Haven: the screen went off, or another app came up?
//
// The browser says only "hidden" either way. A locked screen must never cost a session, so this
// reads what the leaving left behind and counts only time that was plainly spent in another app.
//
// 1. The sleep clock. With the screen off the phone sleeps, and performance.now() stops while it
//    sleeps (Chromium on Android, Safari on iPhone), while the wall clock goes on. The gap on
//    return is time the phone was asleep, which is never counted.
// 2. The way out. Going to another app is a swipe from the edge of the screen, which takes the
//    finger away from the page (touchcancel, or a touch that never ends). The power button and
//    the screen timing out leave no touch at all.
// 3. Idle Detection (Chrome on Android, with permission) says outright when the screen locks.
//
// Whatever cannot be told is taken as a locked screen.

const g = globalThis;

export const SIGNAL = {
  cancelWindow: 3000,   // a touchcancel this close before hiding means a system gesture took the page
  heldWindow: 10000,    // a finger still down when the page hid: the gesture was the way out
  edgeWindow: 2000,     // a touch from the edge of the screen just before hiding
  edge: 0.07,           // how close to the edge counts, as a share of the screen
  bottomEdge: 0.1,
  slowLeave: 400,       // the page lost focus this long before hiding: an app-switch animation
  sleepProof: 5000,     // asleep at least this long: this phone's clock does stop in sleep
  graceFixed: 15000,    // a locked phone still wakes now and then (notifications, sync)
  graceShare: 0.2,
};

let touch = null;       // the last touch: { start, at, kind: 'start'|'end'|'cancel', edge }
let blurAt = 0;
const idle = { detector: null, events: [], state: 'off' }; // events: { at, screen }

/** Listen for what leaving leaves behind. Safe to call more than once. */
let installed = false;
export function install(target = g) {
  if (installed || !target?.addEventListener) return;
  installed = true;
  const opts = { capture: true, passive: true };
  target.addEventListener('touchstart', e => {
    const t = e.touches?.[0] || e.changedTouches?.[0];
    const w = target.innerWidth || 1, h = target.innerHeight || 1;
    const edge = Boolean(t) && (t.clientX < w * SIGNAL.edge || t.clientX > w * (1 - SIGNAL.edge) || t.clientY > h * (1 - SIGNAL.bottomEdge) || t.clientY < h * SIGNAL.edge);
    touch = { start: Date.now(), at: Date.now(), kind: 'start', edge };
  }, opts);
  target.addEventListener('touchend', () => { if (touch) { touch.kind = 'end'; touch.at = Date.now(); } }, opts);
  target.addEventListener('touchcancel', () => { if (touch) { touch.kind = 'cancel'; touch.at = Date.now(); } }, opts);
  target.addEventListener('blur', () => { blurAt = Date.now(); });
  target.addEventListener('focus', () => { blurAt = 0; });
  startIdle();
}

/** For tests: set what the page saw. */
export function _reset({ lastTouch = null, blur = 0, idleEvents = [] } = {}) { touch = lastTouch; blurAt = blur; idle.events = idleEvents; }

/** How the page was left, read the moment it hid. */
export function snapshot(at = Date.now(), mono = monoNow()) {
  let way = 'none';
  if (touch) {
    const since = at - touch.at;
    if (touch.kind === 'cancel' && since <= SIGNAL.cancelWindow) way = 'gesture';
    else if (touch.kind === 'start' && at - touch.start <= SIGNAL.heldWindow) way = 'gesture';
    else if (touch.edge && since <= SIGNAL.edgeWindow) way = 'gesture';
  }
  const blurGap = blurAt && at >= blurAt ? at - blurAt : 0;
  if (way === 'none' && blurGap >= SIGNAL.slowLeave && blurGap < 15000) way = 'slow';
  return { at, mono, way, blurGap };
}

/**
 * How much of an absence counts as time in another app, in ms.
 * `info` is the snapshot taken on hiding (null if the page was reloaded meanwhile), `back` is
 * when it came back on the wall clock, `monoBack` the same moment on performance.now(), and
 * `until` the end of the absence that matters (the session may have ended while away).
 */
export function judge({ info, hiddenAt, back, monoBack, until = back }) {
  const wall = Math.max(0, back - hiddenAt);
  const part = wall ? Math.max(0, Math.min(1, (until - hiddenAt) / wall)) : 0;
  const out = { wall, slept: null, way: info?.way || 'unknown', locked: false, counted: 0, why: '' };
  if (!info || info.mono == null || monoBack == null) { out.why = 'Haven was reopened, so it cannot tell. Taken as a locked screen.'; return out; }
  const awakeTotal = Math.max(0, Math.min(wall, monoBack - info.mono));
  out.slept = wall - awakeTotal;
  const awake = awakeTotal * part;

  // Idle Detection, where it is allowed, says when the screen locked and unlocked.
  const seen = idle.events.filter(x => x.at >= hiddenAt - 5000 && x.at <= back);
  const lockedNear = seen.find(x => x.screen === 'locked' && x.at <= hiddenAt + 5000);
  if (lockedNear) {
    out.locked = true;
    const unlocked = seen.find(x => x.screen === 'unlocked' && x.at > lockedNear.at);
    // Unlocking goes back to the browser, so time after an unlock is only counted while awake.
    out.counted = unlocked ? Math.min(awake, Math.max(0, Math.min(until, back) - unlocked.at)) : 0;
    out.why = unlocked ? 'The screen locked, then unlocked without coming back to Haven.' : 'The screen was locked.';
    return out;
  }
  const clockStops = out.slept >= SIGNAL.sleepProof;
  if (info.way === 'gesture') {
    // Swiped out to another app. Time the phone spent asleep afterwards still never counts.
    out.counted = awake;
    out.why = clockStops ? 'Swiped to another app. Time the phone slept is not counted.' : 'Swiped to another app.';
  } else if (clockStops) {
    // Looked like the screen going off, and the phone did sleep. A locked phone still wakes for
    // notifications, so only time well beyond that counts (a notification opened from the lock screen).
    const grace = SIGNAL.graceFixed + SIGNAL.graceShare * wall * part;
    out.counted = Math.max(0, awake - (info.way === 'slow' ? SIGNAL.graceFixed : grace));
    out.why = out.counted ? 'The phone was awake longer than a locked phone would be.' : 'The screen was off.';
  } else {
    // No sign of another app, and the phone stayed awake (music playing, charging, or a browser
    // whose clock does not stop). It cannot be told, so it is taken as a locked screen.
    out.why = 'No sign of another app. Taken as a locked screen.';
  }
  return out;
}

export function monoNow() { try { return g.performance.now(); } catch { return null; } }

// ——— Idle Detection (Chrome on Android) ———

export const idleSupported = () => typeof g.IdleDetector === 'function';
export const idleState = () => idle.state;

async function startIdle() {
  if (!idleSupported() || idle.detector) return;
  try {
    const p = await g.navigator.permissions?.query({ name: 'idle-detection' });
    if (p?.state !== 'granted') { idle.state = p?.state === 'denied' ? 'denied' : 'off'; return; }
    const detector = new g.IdleDetector();
    detector.addEventListener('change', () => {
      idle.events.push({ at: Date.now(), screen: detector.screenState });
      if (idle.events.length > 50) idle.events.splice(0, idle.events.length - 50);
    });
    await detector.start({ threshold: 60000 });
    idle.detector = detector;
    idle.state = 'on';
  } catch { idle.state = 'off'; }
}

/** Ask for Idle Detection. Must be called from a tap. Resolves 'on', 'denied' or 'off'. */
export async function askIdle() {
  if (!idleSupported()) return 'off';
  try {
    const answer = await g.IdleDetector.requestPermission();
    if (answer !== 'granted') { idle.state = 'denied'; return 'denied'; }
    await startIdle();
    return idle.state;
  } catch { return 'off'; }
}
