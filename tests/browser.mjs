// End to end, in a real browser at phone size: two people, the built app, and the real friends
// server on the Workers runtime. Time is moved forward in both browsers and on the server together.
//   npm run test:browser            (MEDIA=1 also writes the README screenshots to docs/media)
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createStaticServer } from '../server.mjs';
import { startHub } from './hub-server.mjs';

const chrome = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => existsSync(p));
if (!chrome) throw new Error('No Chrome found. Set CHROME_PATH.');
const MEDIA = process.env.MEDIA === '1', shots = MEDIA ? 'docs/media/' : 'tests/output/';
await mkdir(shots, { recursive: true });

const server = createStaticServer();
await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));
const hub = await startHub({ port: 8787, testClock: true });
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
let offset = 0, step = 0;
const START = new Date(2026, 10, 14, 10, 0, 0).getTime();
// The server keeps real time plus an offset; the browsers are set to a fixed morning. Line them up.
await setServer(START - Date.now());

async function setServer(ms) { offset = ms; await fetch('http://127.0.0.1:8787/test/clock', { method: 'POST', body: JSON.stringify({ offset }) }); }
async function person(name, scheme = 'light') {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, hasTouch: true });
  const page = await context.newPage();
  await page.clock.install({ time: START });
  page.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  await page.goto('http://localhost:4173/');
  await page.waitForSelector('.page.focus');
  return page;
}
/** Move time forward for everyone: both browsers and the server. */
async function forward(ms, ...pages) {
  await setServer(offset + ms);
  for (const p of pages) await p.clock.fastForward(ms);
}
const ok = name => console.log(`ok ${++step} - ${name}`);
const tab = (page, name) => page.click(`.tabs [data-page="${name}"]`);
/** Wait until the toast says something that matches. */
const toastSays = (page, pattern) => page.waitForFunction(source => new RegExp(source).test(document.querySelector('#toast.visible')?.textContent || ''), pattern.source, { timeout: 8000 });
const shot = (page, name) => (MEDIA ? page.screenshot({ path: `${shots}${name}.png` }) : Promise.resolve());
async function noOverflow(page, where) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(wide <= 1, `${where}: the page scrolls sideways by ${wide}px`);
}
async function register(page, name, handle) {
  await tab(page, 'friends');
  await page.fill('form[data-form="register"] input[name="name"]', name);
  await page.fill('form[data-form="register"] input[name="handle"]', handle);
  await page.click('form[data-form="register"] button[type="submit"]');
  await page.waitForSelector('.me-card .live.live', { timeout: 10000 });
}

try {
  const ana = await person('Ana'), ben = await person('Ben', 'dark');

  // ——— One person, no network needed ———
  assert.equal(await ana.title(), 'Haven');
  assert.equal(await ana.locator('.clock').textContent(), '25:00');
  await noOverflow(ana, 'Focus');
  await shot(ana, 'focus');
  ok('the app opens on Focus with a 25 min timer');

  await ana.click('[data-action="choose-length"].chooser');
  await ana.click('.chip[data-value="45"]');
  assert.equal(await ana.locator('#length-out').textContent(), '45 min');
  await ana.click('form[data-form="length"] button[type="submit"]');
  assert.equal(await ana.locator('.clock').textContent(), '45:00');
  await ana.click('[data-action="choose-length"].chooser');
  await ana.click('.chip[data-value="25"]');
  await ana.click('form[data-form="length"] button[type="submit"]');
  await ana.click('[data-action="choose-species"]');
  await ana.click('.species-card[data-id="fern"]');
  assert.match(await ana.locator('.chooser[data-action="choose-species"] b').textContent(), /Fern/);
  ok('length and what to grow can be chosen');

  await ana.click('[data-action="start"]');
  await ana.waitForSelector('.page.focus.running');
  assert.equal(await ana.locator('.tabs').isVisible(), false, 'the tab bar hides during a session');
  assert.match(await ana.locator('[data-action="give-up"]').textContent(), /Cancel \(\d+\)/);
  await forward(12 * 60000, ana, ben);
  assert.equal(await ana.locator('.clock').textContent(), '13:00');
  assert.equal(await ana.locator('.plot').getAttribute('data-stage'), '2');
  await shot(ana, 'session');
  await forward(13 * 60000, ana, ben);
  await ana.waitForSelector('#dialog[open]');
  assert.equal(await ana.locator('#dialog-title').textContent(), 'Session finished');
  assert.match(await ana.locator('#dialog .lead').textContent(), /25 min focused. The fern is fully grown. It is in your haven\./);
  assert.match(await ana.locator('#dialog .facts').textContent(), /Coins\+60/);
  assert.match(await ana.locator('#dialog .facts').textContent(), /First session\+50 coins/);
  await shot(ana, 'finished');
  await ana.click('#dialog [data-action="close-dialog"]');
  assert.equal(await ana.locator('#coins').textContent(), '110');
  ok('a full session grows the plant, pays coins and records the achievement');

  await tab(ana, 'haven');
  assert.equal(await ana.locator('.island .thing').count(), 1);
  assert.match(await ana.locator('.page.haven .lead').textContent(), /1 plant and 0 animals live here\./);
  await ana.click('[data-action="arrange"]');
  const from = await ana.evaluate(() => Object.keys(window.__haven.app.store.state.haven.tiles)[0]);
  const [fr, fc] = from.split(',');
  await ana.locator(`.tile[data-r="${fr}"][data-c="${fc}"]`).dispatchEvent('click');
  const target = from === '0,0' ? ['4', '4'] : ['0', '0'];
  await ana.locator(`.tile[data-r="${target[0]}"][data-c="${target[1]}"]`).dispatchEvent('click');
  assert.deepEqual(await ana.evaluate(() => Object.keys(window.__haven.app.store.state.haven.tiles)), [target.join(',')]);
  await ana.click('.edit-bar [data-action="arrange"]');
  await noOverflow(ana, 'Haven');
  ok('the plant stands in the haven and can be moved');

  await tab(ana, 'collection');
  await ana.click('.species-card[data-id="daisy"]');
  await ana.click('#dialog [data-action="unlock"]');
  await toastSays(ana, /Unlocked: Daisy/);
  assert.equal(await ana.locator('#coins').textContent(), '30');
  await ana.keyboard.press('Escape');
  await ana.click('.species-card[data-id="pumpkin"]');
  assert.match(await ana.locator('#dialog .plain').textContent(), /Free from October to November\. That is now\./);
  await ana.click('#dialog [data-action="unlock"]');
  await ana.keyboard.press('Escape');
  assert.equal(await ana.locator('#coins').textContent(), '30', 'a seasonal unlock is free');
  await ana.click('.segmented [data-value="animal"]');
  assert.equal(await ana.locator('.species-card').count(), 27);
  await noOverflow(ana, 'Collection');
  await shot(ana, 'collection');
  ok('species unlock with coins and free in season');

  // Leaving Haven in deep focus withers the plant.
  await tab(ana, 'focus');
  await ana.click('[data-action="start"]');
  await ana.waitForSelector('.page.focus.running');
  await forward(60000, ana, ben);
  const hide = (page, hidden) => page.evaluate(h => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);
  await hide(ana, true);
  await forward(10000, ana, ben);
  await hide(ana, false);
  assert.equal(await ana.locator('.page.focus.running').count(), 1, 'ten seconds away is forgiven');
  await hide(ana, true);
  await forward(20000, ana, ben);
  await hide(ana, false);
  await ana.waitForSelector('#dialog[open]');
  assert.equal(await ana.locator('#dialog-title').textContent(), 'The fern withered');
  assert.match(await ana.locator('#dialog .lead').textContent(), /away from Haven for (1[5-9]|20) s\. Deep focus allows 15 s\./);
  await ana.click('#dialog [data-action="close-dialog"]');
  ok('deep focus forgives a short absence and withers the plant after a long one');

  // ——— Friends, live ———
  await register(ana, 'Ana', 'ana_e2e');
  await register(ben, 'Ben', 'ben_e2e');
  const anaCode = await ana.evaluate(() => window.__haven.app.social.account.code);
  ok('both people create a profile and connect live');

  await ben.click('[data-action="add-friend"]');
  await ben.fill('form[data-form="find"] input[name="q"]', anaCode.toLowerCase());
  await ben.click('form[data-form="find"] button[type="submit"]');
  await ben.waitForSelector('#find-result [data-action="send-request"]');
  assert.match(await ben.locator('#find-result').textContent(), /Ana@ana_e2e/);
  await shot(ben, 'add-friend-dark');
  await ben.click('#find-result [data-action="send-request"]');
  await toastSays(ben, /Request sent to Ana/);
  await ana.waitForSelector('[data-action="respond"][data-accept="1"]', { timeout: 8000 });
  assert.match(await ana.locator('.page.friends').textContent(), /Ben@ben_e2e wants to be friends/);
  await ana.click('[data-action="respond"][data-accept="1"]');
  await ben.waitForSelector('.row.friend', { timeout: 8000 });
  await ana.waitForSelector('.row.friend');
  assert.match(await ben.locator('.row.friend').textContent(), /AnaOnline/);
  assert.equal(await ana.evaluate(() => window.__haven.app.store.state.achieved.friend1 > 0), true);
  ok('a friend request arrives live, and accepting it shows each to the other');

  await tab(ben, 'focus');
  await ben.click('[data-action="start"]');
  await ben.waitForSelector('.page.focus.running');
  await ana.waitForSelector('.row.friend.focusing', { timeout: 8000 });
  assert.match(await ana.locator('.row.friend .presence').textContent(), /Focusing, 25 min left/);
  await shot(ana, 'friends');
  await ana.click('.row.friend [data-action="cheer"]');
  await toastSays(ana, /Cheered Ben/);
  await toastSays(ben, /Ana cheered you on/);
  await forward(25 * 60000, ana, ben);
  await ben.waitForSelector('#dialog[open]');
  await ben.click('#dialog [data-action="close-dialog"]');
  await ana.waitForFunction(() => /25 min/.test(document.querySelector('.row.friend .minutes')?.textContent || ''), null, { timeout: 8000 });
  assert.equal(await ana.locator('.row.friend.focusing').count(), 0);
  ok('a friend sees a session start and finish as it happens, and a cheer arrives');

  // Focusing together
  await ana.click('.segmented [data-value="together"]');
  await ana.selectOption('form[data-form="room-create"] select[name="minutes"]', '25');
  await ana.click('form[data-form="room-create"] button[type="submit"]');
  await ana.waitForSelector('.room [data-action="room-invite"]');
  await ana.click('[data-action="room-invite"]');
  await ana.click('#dialog [data-action="invite-send"]');
  await ana.keyboard.press('Escape');
  await ben.waitForSelector('#dialog [data-action="invite-accept"]', { timeout: 8000 });
  assert.match(await ben.locator('#dialog .lead').textContent(), /Ana invites you to focus for 25 min\. If one person leaves, it ends for everyone\./);
  await ben.click('#dialog [data-action="invite-accept"]');
  await ana.waitForFunction(() => document.querySelectorAll('.room .rows .row').length === 2, null, { timeout: 8000 });
  await shot(ana, 'room');
  await ana.click('[data-action="room-start"]');
  await ana.waitForSelector('.page.focus.running');
  await ben.waitForSelector('.page.focus.running', { timeout: 8000 });
  assert.equal(await ben.locator('.room-strip li').count(), 2);
  assert.match(await ben.locator('.clock').textContent(), /^in \d$/, 'the room counts down before it starts');
  await forward(5000 + 25 * 60000, ana, ben);
  await ana.waitForSelector('#dialog[open]');
  await ben.waitForSelector('#dialog[open]');
  for (const p of [ana, ben]) assert.match(await p.locator('#dialog .facts').textContent(), /With friends1 finished with you/);
  assert.match(await ana.locator('#dialog .facts').textContent(), /Coins\+68/, '60 coins, 3% for the streak and 10% for finishing with one friend');
  await ana.click('#dialog [data-action="close-dialog"]');
  await ben.click('#dialog [data-action="close-dialog"]');
  ok('two friends start a room at the same moment and both finish with the bonus');

  await tab(ana, 'friends');
  await ana.click('.segmented [data-value="board"]');
  await ana.click('.segmented [data-value="today"]');
  await ana.waitForSelector('ol.rows .row');
  // Ana's first session was finished before she had a profile; it was sent to the server afterwards.
  assert.equal(await ana.locator('ol.rows').textContent(), '1You2 sessions50 min2Ben2 sessions50 min');
  await ana.click('.page.friends .segmented [data-value="activity"]');
  await ana.waitForSelector('.page.friends ul.rows .row');
  assert.match(await ana.locator('.page.friends ul.rows').textContent(), /with friends, grew a/);
  ok('the board ranks friends and the feed lists what they grew');

  await forward(6000, ana, ben); // a haven is shared a few seconds after it changes
  await ben.waitForTimeout(400);
  await ana.click('.page.friends .segmented [data-value="friends"]');
  await ana.click('.row.friend [data-action="friend"]');
  await ana.waitForSelector('#dialog .island');
  assert.equal(await ana.locator('#dialog .island .thing').count(), 2, "Ben's two plants show in his haven");
  await shot(ana, 'friend-haven');
  await ana.click('#dialog [data-action="gift-pick"]');
  const before = Number(await ana.locator('#coins').textContent());
  await ana.click('#dialog [data-action="gift-send"][data-id="clover"]');
  await toastSays(ana, /Sent to Ben/);
  assert.equal(Number(await ana.locator('#coins').textContent()), before - 50 + 100, 'the gift costs 50 and earns the first-gift achievement');
  await ben.waitForFunction(() => window.__haven.app.store.state.items.some(i => i.from === 'Ana'), null, { timeout: 8000 });
  ok('a friend can be visited, and a gift lands in their haven');

  // Together rule: one person leaving ends it for both.
  await tab(ben, 'friends');
  await ben.click('.segmented [data-value="together"]');
  await ben.click('form[data-form="room-create"] button[type="submit"]');
  await ben.waitForSelector('.room');
  const code = await ben.evaluate(() => window.__haven.app.social.data.room.code);
  await ana.keyboard.press('Escape');
  await ana.click('.page.friends .segmented [data-value="together"]');
  await ana.fill('form[data-form="room-join"] input[name="code"]', code);
  await ana.click('form[data-form="room-join"] button[type="submit"]');
  await ben.waitForFunction(() => document.querySelectorAll('.room .rows .row').length === 2, null, { timeout: 8000 });
  await ben.click('[data-action="room-start"]');
  await ana.waitForSelector('.page.focus.running', { timeout: 8000 });
  await forward(5 * 60000, ana, ben);
  await ana.click('[data-action="give-up"]');
  assert.match(await ana.locator('#dialog .lead').textContent(), /ends for everyone in the room/);
  await ana.click('#dialog [data-action="confirm-yes"]');
  await ben.waitForFunction(() => /withered|wandered/.test(document.querySelector('#dialog-title')?.textContent || ''), null, { timeout: 8000 });
  assert.match(await ben.locator('#dialog .lead').textContent(), /Ana left the room/);
  ok('in a together room, one person giving up ends it for the other, live');
  await ben.click('#dialog [data-action="close-dialog"]');
  await ana.click('#dialog [data-action="close-dialog"]');

  // ——— The rest of the app ———
  await tab(ana, 'journal');
  assert.match(await ana.locator('.page.journal .facts').textContent(), /Focused50 min/);
  assert.match(await ana.locator('.page.journal .facts').textContent(), /2 finished, 2 not/);
  assert.equal(await ana.locator('.chart rect').count(), 7);
  await noOverflow(ana, 'Journal');
  await shot(ana, 'journal');
  ok('the journal counts finished and unfinished sessions');

  await ana.click('[data-action="settings"]');
  await ana.waitForSelector('#dialog.settings');
  await ana.locator('#dialog [data-change="deep"]').uncheck();
  assert.equal(await ana.evaluate(() => window.__haven.app.store.state.settings.deep), false);
  await ana.selectOption('#dialog [data-change="theme"]', 'dark');
  assert.equal(await ana.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await ana.selectOption('#dialog [data-change="theme"]', 'light');
  await ana.click('#dialog [data-action="add-device"]');
  await ana.waitForSelector('#dialog .code-box b');
  const link = (await ana.locator('#dialog .code-box b').textContent()).trim();
  await ana.click('#dialog [data-action="close-dialog"]');
  ok('settings change how sessions behave and how Haven looks');

  // A second device signs in with the one-time code and gets the haven back.
  await ana.evaluate(() => window.__haven.app.social.backup());
  const phone2 = await person('Ana2');
  await tab(phone2, 'friends');
  await phone2.click('[data-action="link-device"]');
  await phone2.fill('form[data-form="claim"] input[name="code"]', link);
  await phone2.click('form[data-form="claim"] button[type="submit"]');
  await phone2.waitForSelector('.me-card .live.live', { timeout: 10000 });
  assert.equal(await phone2.evaluate(() => window.__haven.app.store.state.sessions.length), await ana.evaluate(() => window.__haven.app.store.state.sessions.length));
  assert.match(await phone2.locator('.row.friend').textContent(), /Ben/);
  ok('another device signs in with a one-time code and the haven comes with it');

  await ana.reload();
  await ana.waitForSelector('.page.focus');
  assert.ok(Number(await ana.locator('#coins').textContent()) > 0, 'coins are kept across a reload');
  await ana.setViewportSize({ width: 360, height: 640 });
  for (const p of ['focus', 'haven', 'collection', 'friends', 'journal']) { await tab(ana, p); await noOverflow(ana, `${p} at 360px`); }
  await ana.setViewportSize({ width: 1280, height: 800 });
  await tab(ana, 'haven');
  assert.equal(await ana.evaluate(() => getComputedStyle(document.querySelector('.tabs')).position), 'static', 'on a wide screen the tabs sit in the top bar');
  await shot(ana, 'haven-wide');
  ok('everything is kept across a reload and fits narrow and wide screens');

  assert.deepEqual(errors, [], 'no errors were logged in any browser');
  ok('no console errors');
  console.log(`# ${step} checks passed`);
} catch (error) {
  console.error(`not ok ${step + 1}\n`, error);
  if (errors.length) console.error('Browser errors:', errors);
  for (const [i, context] of browser.contexts().entries()) for (const p of context.pages()) await p.screenshot({ path: `tests/output/failure-${i}.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
  await hub.stop();
}
