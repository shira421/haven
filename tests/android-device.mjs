// The Android app on an emulator, driven like a person would use it, watching for crashes.
// Run by .github/workflows/devices.yml inside an Android emulator. It needs an APK built with
// HAVEN_WEB_DEBUG=1, so the test can reach into the web view.
//   node tests/android-device.mjs path/to/app.apk
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { _android as android } from 'playwright-core';

const APK = process.argv[2] || 'android/app/build/outputs/apk/debug/app-debug.apk';
const PKG = 'com.shira421.haven';
const OUT = 'tests/output/';
mkdirSync(OUT, { recursive: true });
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const shell = cmd => adb('shell', cmd);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let step = 0;
const ok = name => console.log(`ok ${++step} - ${name}`);
const pid = () => { try { return shell(`pidof ${PKG}`); } catch { return ''; } };
const notifications = () => shell('dumpsys notification --noredact');
const posted = title => notifications().split('NotificationRecord').some(r => r.includes(`pkg=${PKG}`) && r.includes(title));
const crashes = () => adb('logcat', '-d', '-b', 'crash');
const shot = name => { try { execFileSync('sh', ['-c', `adb exec-out screencap -p > ${OUT}android-${name}.png`]); } catch { /* best effort */ } };
const front = () => shell(`am start -W -n ${PKG}/.MainActivity`);
const home = () => shell('input keyevent KEYCODE_HOME');

/** Tap a button on a system screen (a permission prompt) by its text. */
async function tapText(pattern, tries = 10) {
  for (let i = 0; i < tries; i++) {
    shell('uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true');
    const xml = shell('cat /sdcard/ui.xml 2>/dev/null || true');
    const node = [...xml.matchAll(/<node [^>]*>/g)].map(m => m[0]).find(n => pattern.test((/text="([^"]*)"/.exec(n) || [])[1] || ''));
    const b = node && /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
    if (b) { shell(`input tap ${(Number(b[1]) + Number(b[3])) >> 1} ${(Number(b[2]) + Number(b[4])) >> 1}`); return true; }
    await sleep(1000);
  }
  return false;
}

let device, page, attachedPid = '';
/** Connect to the app's web view (again, after the app was stopped or restarted). */
async function attach() {
  // Android can replace the web view just after it was reached (an activity brought back from a
  // notification). Then reach the new one.
  for (let tries = 0; ; tries++) {
    try { return await attachOnce(); } catch (error) {
      if (tries >= 2 || !/closed/i.test(String(error?.message))) throw error;
      page = null;
      await sleep(3000);
    }
  }
}
async function attachOnce() {
  for (let i = 0; i < 30 && !pid(); i++) await sleep(1000);
  assert.ok(pid(), 'the app is running');
  device ??= (await android.devices())[0];
  if (pid() !== attachedPid) page = null; // a new process: its web view is a new one
  attachedPid = pid();
  let last;
  for (let i = 0; i < 5 && !page?.url?.().includes('appassets'); i++) {
    try { page = await (await device.webView({ pkg: PKG }, { timeout: 20000 })).page(); } catch (error) { last = error; await sleep(2000); }
  }
  assert.ok(page, `the web view can be reached${last ? ': ' + last.message : ''}`);
  if (!page._watched) { page._watched = true; page.on('pageerror', e => errors.push(e.message)); }
  await page.waitForFunction(() => window.__haven && document.querySelector('.page'), null, { timeout: 30000 });
}
const errors = [];
const js = (fn, arg) => page.evaluate(fn, arg);
function noCrash(where) {
  const log = crashes();
  if (/FATAL EXCEPTION|AndroidRuntime/.test(log)) { writeFileSync(OUT + 'android-crash.txt', log); throw new Error(`The app crashed ${where}:\n${log.slice(0, 4000)}`); }
  assert.ok(pid(), `the app is still running ${where}`);
}

const API = 'https://haven-hub.vksheerabthi.workers.dev';
const call = async (method, path, token, body) => {
  const r = await fetch(API + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
};
const cleanup = [];
// Haven opens on the sign-in screen. The test makes a throwaway account on the live server, through
// the screen itself, and deletes it at the end.
const handle = 'ci_' + Date.now().toString(36), PASSWORD = 'ci-' + Math.random().toString(36).slice(2) + '-pass';
async function createAccount() {
  await page.waitForSelector('.page.welcome', { timeout: 30000 });
  await page.click('[data-action="welcome-tab"][data-value="up"]');
  await page.fill('form[data-form="sign-up"] input[name="name"]', 'CI phone');
  await page.fill('form[data-form="sign-up"] input[name="handle"]', handle);
  await page.fill('form[data-form="sign-up"] input[name="password"]', PASSWORD);
  await page.click('form[data-form="sign-up"] button[type="submit"]');
  await page.waitForSelector('.page.focus', { timeout: 30000 });
  const token = await js(() => window.__haven.app.social.account.token);
  cleanup.push(() => call('POST', '/api/account/delete', token));
}

try {
  adb('install', '-r', '-g', APK); // -g: Android's permissions start granted except notifications, which the test asks for below
  shell(`pm revoke ${PKG} android.permission.POST_NOTIFICATIONS || true`);
  adb('logcat', '-c', '-b', 'all');
  front();
  await attach();
  noCrash('on opening');
  shot('opened');
  // The app first finds its server, then shows the sign-in screen.
  await page.waitForFunction(() => window.__haven.state().gate === 'welcome', null, { timeout: 30000 }).catch(() => {});
  assert.equal(await js(() => window.__haven.state().gate), 'welcome', 'Haven opens on the sign-in screen');
  await createAccount();
  noCrash('after creating an account');
  ok('the app opens on the sign-in screen, and an account can be created');

  // The first session asks to send notifications, through Android's own prompt.
  await page.click('[data-action="start"]');
  const asked = await tapText(/^Allow$/i, 25); // a slow emulator can take a while to show it
  assert.ok(asked, 'Android asked for permission to send notifications');
  await sleep(1500);
  assert.match(shell(`dumpsys package ${PKG} | grep POST_NOTIFICATIONS`), /granted=true/);
  await page.waitForSelector('.page.focus.running', { timeout: 10000 });
  noCrash('after allowing notifications');
  ok('starting the first session asks for notifications, and allowing them works');

  // A notification right now, and one at a time, go through both of the app's paths.
  await js(() => window.__haven.device.notifyNow('Test now', 'A notification shown at once.', 'test-now'));
  await js(() => window.__haven.device.notifyAt('test-later', Date.now() + 4000, 'Test later', 'A notification set for later.'));
  await sleep(1500);
  assert.ok(posted('Test now'), 'a notification shows at once');
  home();
  // Set 4 s ahead; a busy emulator can deliver an exact alarm a little late.
  for (let i = 0; i < 20 && !posted('Test later'); i++) await sleep(1000);
  assert.ok(posted('Test later'), 'a notification set for later arrives while Haven is in the background');
  noCrash('while notifications arrived');
  front();
  await sleep(2000);
  ok('notifications show at once and at a set time, with Haven open or in the background');

  // Tapping a notification opens Haven, also when Android had stopped it in the meantime.
  await attach();
  await js(() => window.__haven.device.notifyAt('test-tap', Date.now() + 6000, 'Tap me', 'Opens Haven.'));
  home();
  await sleep(1500);
  shell(`am kill ${PKG}`);
  await sleep(9000);
  assert.ok(posted('Tap me'), 'a notification set before Haven was stopped still arrives');
  shell('cmd statusbar expand-notifications');
  await sleep(1500);
  assert.ok(await tapText(/^Tap me$/), 'the notification can be tapped');
  // Haven starts from cold here, which takes a while on a busy emulator.
  const inFront = () => /com\.shira421\.haven/.test(shell('dumpsys activity activities | grep -i "ResumedActivity" | head -3'));
  for (let i = 0; i < 20 && !inFront(); i++) await sleep(1000);
  assert.match(shell('dumpsys activity activities | grep -i "ResumedActivity" | head -3'), /com\.shira421\.haven/, 'Haven is in front');
  await attach();
  noCrash('after tapping a notification');
  ok('tapping a notification opens Haven, even after Android stopped it');

  // A session that ends while Haven is in the background: the notification, then the result.
  // Move the running session on so it ends 8 s from now, and set its notification again.
  await js(() => { const a = window.__haven.app, act = a.store.state.active; act.start = Date.now() + 8000 - act.planned * 60000; a.store.commit('session'); a.timer.afterBegin(act); });
  home();
  let grown = false;
  for (let i = 0; i < 20 && !grown; i++) { await sleep(1000); grown = posted('fully grown') || posted('has arrived'); }
  assert.ok(grown, 'the end of the session is notified while Haven is in the background');
  shell('cmd statusbar collapse');
  front();
  await attach();
  await page.waitForSelector('#dialog[open] .result-art', { timeout: 15000 });
  noCrash('after a session ended in the background');
  await page.click('#dialog [data-action="close-dialog"]');
  await page.click('[data-action="start"]');
  await page.waitForSelector('.page.focus.running', { timeout: 10000 });
  ok('a session that ends in the background is notified, and its result shows on return');

  // Switching apps during a session: "come back" after a third of the 30 s allowed, and the session survives a short trip.
  await attach();
  assert.ok(await js(() => Boolean(window.__haven.app.store.state.active)), 'the session is still running');
  home();
  await sleep(16000);
  assert.ok(posted('Come back to Haven'), 'a come-back notification arrives after about 10 s away');
  noCrash('while away during a session');
  shot('come-back');
  front();
  await attach();
  await sleep(1500);
  assert.ok(await js(() => Boolean(window.__haven.app.store.state.active)), 'back within the 30 s: the session carries on');
  assert.ok(!posted('Come back to Haven'), 'coming back takes the notification away');
  ok('switching apps sends a come-back notification, and returning in time keeps the session');

  // Locking the phone is not leaving: no notification, and the session survives longer than the allowance.
  shell('input keyevent KEYCODE_SLEEP');
  await sleep(45000);
  assert.ok(!posted('Come back to Haven'), 'no come-back notification for a locked phone');
  shell('input keyevent KEYCODE_WAKEUP');
  shell('wm dismiss-keyguard || true');
  await sleep(1500);
  front();
  await attach();
  await sleep(1500);
  noCrash('after the screen was off');
  assert.ok(await js(() => Boolean(window.__haven.app.store.state.active)), 'the session survives 45 s with the screen off');
  ok('turning the screen off for 45 s during a session is fine');

  // Away too long: the session is lost, and Haven says so without closing.
  home();
  await sleep(40000);
  front();
  await attach();
  await page.waitForSelector('#dialog[open]', { timeout: 10000 });
  assert.match(await page.locator('#dialog-title').textContent(), /withered|wandered off|unfinished|left/i);
  noCrash('after a lost session');
  await page.click('#dialog [data-action="close-dialog"]');
  ok('away for 40 s, the session is lost and Haven says so');

  // Reminders: the streak and hunger reminders are scheduled without trouble.
  await js(() => { const a = window.__haven.app; a.store.set({ notify: { ...a.store.state.settings.notify, streak: true, hungry: true } }); });
  await sleep(3000);
  noCrash('after scheduling reminders');
  ok('the streak and hunger reminders are scheduled');

  // Friends: a friend request while Haven is closed, and the background check that notices it.
  const me = await js(() => window.__haven.app.social.account);
  const other = await call('POST', '/api/register', null, { name: 'CI friend', handle: handle + '_f', password: PASSWORD, avatar: 'fox' });
  cleanup.push(() => call('POST', '/api/account/delete', other.token));
  await sleep(2000);
  home();
  await sleep(2000);
  await call('POST', '/api/friends/request', other.token, { id: me.id });
  shell(`cmd jobscheduler run -f ${PKG} 4211`);
  let arrived = false;
  for (let i = 0; i < 20 && !arrived; i++) { await sleep(1000); arrived = posted('New friend request'); }
  assert.ok(arrived, 'the background check shows a friend request as a notification');
  noCrash('after the background check');
  ok('with Haven closed, a friend request arrives as a notification');

  // A sanctuary, opened and left, with the app in and out of the background.
  front();
  await attach();
  const s = await js(() => window.__haven.app.social.sanctuaryCreate('CI sanctuary'));
  await call('POST', '/api/friends/respond', me.token, { id: other.id, accept: true }).catch(() => {});
  await call('POST', '/api/sanctuaries/join', other.token, { code: s.code });
  await page.click('.tabs [data-page="friends"]');
  await page.click('.segmented [data-value="sanctuary"]');
  await page.waitForSelector(`[data-action="sanct-open"][data-id="${s.id}"].primary`, { timeout: 15000 });
  await page.click(`[data-action="sanct-open"][data-id="${s.id}"].primary`);
  await page.waitForSelector('.sanctuary-land', { timeout: 20000 });
  await sleep(5000);
  shot('sanctuary');
  home(); await sleep(3000); front(); await sleep(3000);
  noCrash('in a sanctuary');
  ok('a sanctuary opens and runs, and survives going to the background');

  // Haven stopped by the system while in the background comes back on its own.
  home();
  shell(`am kill ${PKG}`);
  await sleep(2000);
  front();
  await attach();
  noCrash('after being stopped by the system');
  ok('Haven reopens after the system stops it');

  assert.deepEqual(errors, [], 'no script errors in the web view');
  ok('no script errors');
  console.log(`# ${step} checks passed on Android ${shell('getprop ro.build.version.release')}`);
} catch (error) {
  console.error(`not ok ${step + 1}\n`, error);
  shot('failure');
  try { writeFileSync(OUT + 'android-logcat.txt', adb('logcat', '-d')); } catch { /* best effort */ }
  // What the app did, for reading in the CI log (artifacts are not always reachable).
  try { console.error('--- Haven log ---\n' + adb('logcat', '-d', '-s', 'Haven:*', 'AndroidRuntime:*', 'chromium:E').split('\n').slice(-80).join('\n')); } catch { /* best effort */ }
  try { console.error('--- alarms ---\n' + shell(`dumpsys alarm | grep -i -A3 ${PKG} | head -40`)); } catch { /* best effort */ }
  try { console.error('--- crash buffer ---\n' + crashes().slice(0, 3000)); } catch { /* best effort */ }
  try { writeFileSync(OUT + 'android-notifications.txt', notifications()); } catch { /* best effort */ }
  process.exitCode = 1;
} finally {
  for (const f of cleanup.reverse()) await f().catch(e => console.error('cleanup:', e.message));
  await device?.close().catch(() => {});
}
