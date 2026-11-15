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
const KEEP = ['session', 'friends', 'room', 'journal', 'sanctuary'];
const shot = (page, name) => (MEDIA && KEEP.includes(name) ? page.screenshot({ path: `${shots}${name}.png` }) : Promise.resolve());
async function noOverflow(page, where) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(wide <= 1, `${where}: the page scrolls sideways by ${wide}px`);
}
/** Move a page's clock on in small steps until something shows: for waits that are timers in the app. */
async function until(page, selector, ms = 15000) {
  const ready = typeof selector === 'function' ? () => page.evaluate(selector) : async () => (await page.locator(selector).count()) > 0;
  for (let spent = 0; spent < ms; spent += 250) {
    if (await ready()) return;
    await page.clock.runFor(250);
    await page.waitForTimeout(50);
  }
  if (typeof selector === 'function') assert.ok(await ready(), 'waited for the page'); else await page.waitForSelector(selector, { timeout: 2000 });
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
  await noOverflow(ana, 'Haven');
  assert.equal(await ana.locator('.tabs button').count(), 4);
  // The four tabs share the width evenly, each centred in its own quarter.
  const spread = await ana.evaluate(() => {
    const bar = document.querySelector('.tabs').getBoundingClientRect();
    return [...document.querySelectorAll('.tabs button')].map(b => { const r = b.getBoundingClientRect(); return Math.round(((r.left + r.right) / 2 - bar.left) / bar.width * 100); });
  });
  assert.deepEqual(spread, [13, 38, 63, 88], `the tab bar is evenly divided between its tabs (${spread.join(' ')})`);
  assert.equal(await ana.locator('.world .land').count(), 1, 'the land is there before anything grows');
  await shot(ana, 'focus');
  ok('the app opens on the haven with a 25 min timer');

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
  assert.equal(await ana.locator('.ent.sprouting').getAttribute('data-stage'), '2', 'the fern is growing where it was planted');
  await shot(ana, 'session');
  await forward(13 * 60000, ana, ben);
  await ana.waitForSelector('#dialog[open]');
  assert.equal(await ana.locator('#dialog-title').textContent(), 'Session finished');
  assert.match(await ana.locator('#dialog .lead').textContent(), /25 min focused. The fern is fully grown. It is in your haven\./);
  assert.match(await ana.locator('#dialog .facts').textContent(), /Coins\+60Treats\+2/);
  assert.match(await ana.locator('#dialog .facts').textContent(), /First session\+50 coins/);
  await shot(ana, 'finished');
  await ana.click('#dialog [data-action="close-dialog"]');
  assert.equal(await ana.locator('#coins').textContent(), '110');
  ok('a full session grows the plant, pays coins and records the achievement');

  // ——— A living haven ———
  assert.equal(await ana.locator('.world .ent[data-ent]').count(), 1);
  const fern = await ana.evaluate(() => Object.keys(window.__haven.app.store.state.haven.spots)[0]);
  const spotOf = id => ana.evaluate(i => window.__haven.app.store.state.haven.spots[i], id);
  const planted = await spotOf(fern);
  await ana.click('[data-action="arrange"]');
  const box = await ana.locator(`.ent[data-ent="${fern}"]`).boundingBox(), land = await ana.locator('.world').boundingBox();
  await ana.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8);
  await ana.mouse.down();
  await ana.mouse.move(land.x + land.width * 0.5, land.y + land.height * 0.55, { steps: 6 });
  await ana.mouse.up();
  const after = await spotOf(fern);
  assert.notDeepEqual(after, planted, 'dragging moved the fern');
  assert.ok(after.every(n => n >= 0.4 && n <= 4.6), 'and it is still on the land');
  await ana.click('.panel [data-action="arrange"]');
  await noOverflow(ana, 'Arranging');
  ok('the plant stands where it grew and can be dragged anywhere on the land');

  await ana.click('[data-action="choose-species"]');
  await ana.click('.segmented [data-value="animal"]');
  await ana.click('.species-card[data-id="rabbit"]');
  await ana.click('[data-action="start"]');
  await ana.waitForSelector('.page.focus.running');
  await forward(25 * 60000, ana, ben);
  await ana.waitForSelector('#dialog[open]');
  assert.match(await ana.locator('#dialog .lead').textContent(), /A rabbit has moved in/);
  await ana.click('#dialog [data-action="close-dialog"]');
  const rabbit = await ana.evaluate(() => window.__haven.app.store.state.items.find(i => i.s === 'rabbit').id);
  const where = () => ana.locator(`.ent[data-ent="${rabbit}"]`).evaluate(el => el.style.left + ' ' + el.style.top);
  const start = await where();
  let roamed = false;
  for (let i = 0; i < 12 && !roamed; i++) { await ana.clock.runFor(2500); roamed = (await where()) !== start; }
  assert.ok(roamed, 'the rabbit left the spot it arrived at');
  // It is drawn in parts that move, and it hops: off the ground, then down again.
  const rig = await ana.locator(`.ent[data-ent="${rabbit}"]`).evaluate(el => ['.rig.quad', '.leg.fl', '.leg.hl', '.head', '.ear', '.tail', '.eye', '.shade'].every(q => el.querySelector(q)));
  assert.ok(rig, 'the rabbit has legs, a head, ears and a tail of its own');
  let hopped = false, highest = 0;
  for (let i = 0; i < 400 && !(hopped && highest > 5); i++) {
    await ana.clock.runFor(50);
    const now = await ana.locator(`.ent[data-ent="${rabbit}"]`).evaluate(el => [el.dataset.act, Number(el.style.getPropertyValue('--lift'))]);
    if (now[0] === 'hop') hopped = true;
    highest = Math.max(highest, now[1]);
  }
  assert.ok(hopped && highest > 5, `the rabbit hops (${highest})`);
  await shot(ana, 'haven');
  ok('an animal moves in, roams the haven and hops as it goes');

  // Seven hours later the rabbit is peckish.
  await ana.evaluate(id => { const s = window.__haven.app.store; s.item(id).fed -= 7 * 3600000; s.commit('care'); }, rabbit);
  await ana.locator(`.ent[data-ent="${rabbit}"]`).dispatchEvent('click');
  await ana.waitForSelector('#dialog [data-action="feed"]');
  assert.match(await ana.locator('#dialog .lead').textContent(), /Peckish\. Likes burrow, clover, tall grass and daisy\./);
  const coinsThen = Number(await ana.locator('#coins').textContent());
  await ana.click('#dialog [data-action="feed"]');
  await toastSays(ana, /Rabbit ate\. Earned: First meal\. \+50 coins\./);
  assert.equal(await ana.evaluate(id => window.__haven.app.world.animals.get(id).doing, rabbit), 'eat', 'the rabbit in the haven stops to eat');
  assert.equal(Number(await ana.locator('#coins').textContent()), coinsThen + 50);
  assert.match(await ana.locator('#dialog .facts').textContent(), /HungerFull/);
  assert.equal(await ana.locator('#dialog [data-action="feed"]').count(), 0, 'a full animal is not offered food');
  await ana.click('#dialog [data-action="pet"]');
  await toastSays(ana, /Rabbit liked that/);
  await ana.fill('#dialog form[data-form="rename"] input', 'Mochi');
  await ana.click('#dialog form[data-form="rename"] button');
  assert.equal(await ana.locator('#dialog-title').textContent(), 'Mochi');
  await shot(ana, 'care');
  await ana.keyboard.press('Escape');
  assert.equal(await ana.locator(`.ent[data-ent="${rabbit}"]`).getAttribute('aria-label'), 'Mochi');
  assert.deepEqual(await ana.evaluate(id => { const i = window.__haven.app.store.item(id); return [i.bond, window.__haven.app.store.state.food]; }, rabbit), [5, 6]);
  ok('an animal can be fed, petted and named, and its bond grows');

  await tab(ana, 'collection');
  await ana.click('.species-card[data-id="daisy"]');
  const purse = Number(await ana.locator('#coins').textContent());
  await ana.click('#dialog [data-action="unlock"]');
  await toastSays(ana, /Unlocked: Daisy/);
  assert.equal(Number(await ana.locator('#coins').textContent()), purse - 80);
  await ana.keyboard.press('Escape');
  await ana.click('.species-card[data-id="pumpkin"]');
  assert.match(await ana.locator('#dialog .plain').textContent(), /Free from October to November\. That is now\./);
  await ana.click('#dialog [data-action="unlock"]');
  await ana.keyboard.press('Escape');
  assert.equal(Number(await ana.locator('#coins').textContent()), purse - 80, 'a seasonal unlock is free');
  await ana.click('.segmented [data-value="animal"]');
  assert.equal(await ana.locator('.species-card').count(), 29, 'two new animals: the giraffe and the elephant');
  await ana.click('.segmented [data-value="nature"]');
  assert.equal(await ana.locator('.species-card').count(), 10);
  await ana.click('.species-card[data-id="tallgrass"]');
  assert.match(await ana.locator('#dialog .facts').textContent(), /TakesA session of 10 min or more/);
  assert.match(await ana.locator('#dialog .facts').textContent(), /Liked byRabbit, Snail, Ladybird, Hedgehog/);
  await ana.click('#dialog [data-action="unlock"]');
  await ana.click('#dialog [data-action="grow-next"]');
  await toastSays(ana, /Building next: Tall grass/);
  assert.match(await ana.locator('.chooser[data-action="choose-species"]').textContent(), /BuildingTall grass/);
  await ana.click('[data-action="choose-species"]');
  await ana.click('.segmented [data-value="plant"]');
  await ana.click('.species-card[data-id="fern"]');
  await tab(ana, 'collection');
  await ana.click('.segmented [data-value="animal"]');
  await noOverflow(ana, 'Collection');
  await shot(ana, 'collection');
  ok('plants, animals and nature unlock with coins, and free in season');

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
  await forward(40000, ana, ben);
  await hide(ana, false);
  await ana.waitForSelector('#dialog[open]');
  assert.equal(await ana.locator('#dialog-title').textContent(), 'The fern withered');
  assert.match(await ana.locator('#dialog .lead').textContent(), /away from Haven for (3[0-9]|40) s\. Deep focus allows 30 s\./);
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
  // Ana's first two sessions were finished before she had a profile; they were sent to the server afterwards.
  assert.equal(await ana.locator('ol.rows').textContent(), '1You3 sessions1 h 15 min2Ben2 sessions50 min');
  await ana.click('.page.friends .segmented [data-value="activity"]');
  await ana.waitForSelector('.page.friends ul.rows .row');
  assert.match(await ana.locator('.page.friends ul.rows').textContent(), /with friends, grew a/);
  ok('the board ranks friends and the feed lists what they grew');

  await forward(6000, ana, ben); // a haven is shared a few seconds after it changes
  await ben.waitForTimeout(400);
  await ana.click('.page.friends .segmented [data-value="friends"]');
  await ana.click('.row.friend [data-action="friend"]');
  await ana.waitForSelector('#dialog .world');
  assert.equal(await ana.locator('#dialog .world .ent').count(), 2, "Ben's two plants show in his haven");
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
  assert.match(await ana.locator('.page.journal .facts').textContent(), /Focused1 h 15 min/);
  assert.match(await ana.locator('.page.journal .facts').textContent(), /3 finished, 2 not/);
  assert.match(await ana.locator('.page.journal .level').textContent(), /Level 2/);
  const chart = await ana.evaluate(() => [...document.querySelectorAll('.page.journal .chart path')].map(p => {
    const box = p.getBBox(), line = Number(document.querySelector('.page.journal .chart line').getAttribute('y1'));
    return [p.querySelector('title').textContent, Math.round((box.y + box.height - line) * 10) / 10];
  }));
  assert.equal(chart.length, 1, `a bar for each day that has a session (${JSON.stringify(chart)})`);
  assert.match(chart[0][0], /^\w+: 1 h 15 min$/);
  assert.ok(Math.abs(chart[0][1]) < 0.6, `the bar stands on the line it is drawn against (${chart[0][1]})`);
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

  // Both devices stay in step: a move on one shows on the other, live, without signing out.
  const moved = await phone2.evaluate(() => { const { store } = window.__haven.app; const id = Object.keys(store.state.haven.spots)[0]; store.place(id, 1.2, 1.3); return id; });
  await phone2.evaluate(() => window.__haven.app.social.sync());
  await ana.waitForFunction(id => JSON.stringify(window.__haven.app.store.state.haven.spots[id]) === '[1.2,1.3]', moved, { timeout: 8000 });
  const released = await ana.evaluate(() => { const { store } = window.__haven.app; const id = store.state.items.at(-1).id; store.release(id); return id; });
  await ana.evaluate(() => window.__haven.app.social.sync());
  await phone2.waitForFunction(id => !window.__haven.app.store.item(id), released, { timeout: 8000 });
  assert.deepEqual(await phone2.evaluate(() => window.__haven.app.store.state.coins), await ana.evaluate(() => window.__haven.app.store.state.coins));
  await phone2.close();
  ok('two devices on one profile stay in step: moves and releases on either reach the other');

  // A sanctuary: Ana makes one, a loading screen shows, then her haven as the first plot.
  await tab(ana, 'friends');
  await ana.click('.segmented [data-value="sanctuary"]');
  await ana.click('[data-action="sanct-new"]');
  await ana.fill('form[data-form="sanct-new"] input[name="name"]', 'Study club');
  await ana.click('form[data-form="sanct-new"] button[type="submit"]');
  await ana.waitForSelector('.page.sanctuary .sanct-loading', { timeout: 5000 });
  assert.match(await ana.locator('.sanct-loading p').textContent(), /Gathering havens|Joining the land|Waking the animals/);
  await until(ana, '#dialog[open] [data-action="sanct-invite-friend"]');
  assert.equal(await ana.locator('.sanctuary-land .plot-sign').count(), 1);
  assert.equal(await ana.locator('.tabs [aria-current="page"]').getAttribute('data-page'), 'friends', 'Friends stays lit');
  await ana.click('#dialog [data-action="sanct-invite-friend"]');
  await ana.click('#dialog [data-action="close-dialog"]');
  // Ben is asked, joins, and both see one land of two havens.
  await ben.waitForSelector('#dialog[open] [data-action="sanct-accept"]', { timeout: 8000 });
  await ben.click('#dialog [data-action="sanct-accept"]');
  await until(ben, '.page.sanctuary .sanctuary-land');
  assert.equal(await ben.locator('.sanctuary-land .plot-sign').count(), 2);
  await until(ana, () => document.querySelectorAll('.sanctuary-land .plot-sign').length === 2);
  const signs = await ana.locator('.sanctuary-land .plot-sign').allTextContents();
  assert.deepEqual(signs, ['Ana', 'Ben']);
  const animal = await ana.locator('.sanctuary-land .ent.animal').count();
  assert.ok(animal > 0, 'animals live in the sanctuary');
  const placesBefore = await ana.evaluate(() => [...document.querySelectorAll('.sanctuary-land .ent.animal')].map(el => el.style.left + el.style.top).join());
  await ana.clock.runFor(3000);
  assert.notEqual(await ana.evaluate(() => [...document.querySelectorAll('.sanctuary-land .ent.animal')].map(el => el.style.left + el.style.top).join()), placesBefore, 'the animals move about');
  await noOverflow(ana, 'sanctuary');
  await shot(ana, 'sanctuary');
  await ana.click('[data-action="sanct-back"]');
  await ana.waitForSelector('.page.friends .sanct-card');
  ok('a sanctuary joins two havens into one land, after a loading screen, and its animals move');
  await tab(ana, 'focus');

  await ana.reload();
  await ana.waitForSelector('.page.focus');
  assert.ok(Number(await ana.locator('#coins').textContent()) > 0, 'coins are kept across a reload');
  await ana.setViewportSize({ width: 360, height: 640 });
  for (const p of ['focus', 'collection', 'friends', 'journal']) { await tab(ana, p); await noOverflow(ana, `${p} at 360px`); }
  // The smallest phones: every Friends section, and the five section buttons each in one piece.
  await ana.setViewportSize({ width: 320, height: 640 });
  await tab(ana, 'friends');
  for (const section of ['friends', 'together', 'sanctuary', 'board', 'activity']) { await ana.click(`.segmented [data-value="${section}"]`); await noOverflow(ana, `friends, ${section}, at 320px`); }
  const squeezed = await ana.evaluate(() => [...document.querySelectorAll('.segmented button')].filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent));
  assert.deepEqual(squeezed, [], 'no section name is cut off at 320px');
  await ana.click('.segmented [data-value="friends"]');
  await ana.setViewportSize({ width: 1280, height: 800 });
  await tab(ana, 'focus');
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
