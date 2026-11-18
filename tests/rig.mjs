// The animals' moving parts, checked by measuring them in a real browser engine.
// The poses rely on CSS transforms of SVG parts, so this runs in Chrome and, on GitHub, in WebKit
// (the engine inside the iOS app):  node tests/rig.mjs [chromium|webkit]
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium, webkit } from 'playwright-core';
import { createStaticServer } from '../server.mjs';
import { drawing } from '../src/art.js';
import { traitsOf } from '../src/world.js';

const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chromium';
const chrome = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
const server = createStaticServer();
await new Promise(resolve => server.listen(4176, '127.0.0.1', resolve));
setTimeout(() => { console.error(`not ok - ${engine}: still running after 3 minutes`); process.exit(1); }, 180000).unref();
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 600, height: 500 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let passed = 0;
const ok = name => { passed++; console.log(`ok ${passed} - ${name}`); };

try {
  await page.goto('http://localhost:4176/');
  // This test is about the drawings, which it puts on the page itself: any first screen will do.
  await page.waitForSelector('.page');

  /** Stand one animal alone on the page in a given state and let it settle. */
  async function pose(id, act, { lift = 0, cls = '' } = {}) {
    const t = traitsOf(id);
    const html = `<div style="position:relative;width:600px;height:500px"><span class="ent animal m-${t.move} ${cls}" data-species="${id}" data-act="${act}" style="left:300px;top:400px;width:200px;--gait:${t.gait || 0.5}s;--sink:${t.sink || 14};--lift:${lift};--tilt:0deg"><svg class="sprite" viewBox="0 0 100 100"><g class="alive">${drawing(id, { kind: 'animal' })}</g></svg><i class="emote" data-kind="heart"></i></span></div>`;
    await page.evaluate(h => { document.body.innerHTML = h; }, html);
    await page.waitForTimeout(700);
  }
  /** The box a part takes up on screen, or null when it is not drawn. */
  const box = selector => page.evaluate(q => { const el = document.querySelector(q); if (!el) return null; const r = el.getBoundingClientRect(); return r.width || r.height ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height } : null; }, selector);
  const style = (selector, prop) => page.evaluate(([q, p]) => getComputedStyle(document.querySelector(q))[p], [selector, prop]);

  await pose('deer', 'idle');
  const idle = { head: await box('.head'), rig: await box('.rig'), shade: await box('.shade'), torso: await box('.torso'), leg: await box('.leg.hl:not(.far)'), eye: await box('.eye'), lid: await box('.lid'), emote: await box('.emote') };
  assert.ok(idle.head && idle.rig && idle.shade && idle.eye, 'the parts are drawn');
  assert.equal(idle.lid, null, 'eyes are open');
  assert.ok(Math.abs(idle.rig.bottom - 400) < 6, `the feet are on the ground (${idle.rig.bottom})`);
  assert.ok(idle.leg.top > idle.torso.top && idle.leg.top < idle.torso.bottom, 'legs join the body');
  ok(`${engine}: an animal stands on the ground in one piece`);

  await pose('deer', 'eat');
  const eating = await box('.head');
  assert.ok(eating.bottom > idle.head.bottom + 40, `the head goes down to graze (${idle.head.bottom.toFixed(0)} to ${eating.bottom.toFixed(0)})`);
  assert.ok(eating.left < idle.rig.right && eating.right > idle.torso.right - 10, 'and stays on the neck');
  ok(`${engine}: the head dips to eat about its own pivot`);

  await pose('deer', 'sleep', { cls: 'asleep' });
  const asleep = { rig: await box('.rig'), eye: await box('.eye'), lid: await box('.lid') };
  assert.ok(asleep.rig.top > idle.rig.top + 30 && asleep.rig.bottom > idle.rig.bottom - 12 && asleep.rig.bottom < idle.rig.bottom + 16, `it lies down: lower, still on the ground (top ${idle.rig.top.toFixed(0)} to ${asleep.rig.top.toFixed(0)}, bottom ${idle.rig.bottom.toFixed(0)} to ${asleep.rig.bottom.toFixed(0)})`);
  assert.equal(asleep.eye, null);
  assert.ok(asleep.lid, 'eyes closed');
  ok(`${engine}: asleep it lies down with its eyes shut`);

  await pose('deer', 'hop', { lift: 40, cls: 'air' });
  const up = { rig: await box('.rig'), shade: await box('.shade'), leg: await box('.leg.hl:not(.far)'), torso: await box('.torso'), emote: await box('.emote') };
  assert.ok(Math.abs((idle.rig.bottom - up.rig.bottom) - 80) < 14, `lift raises the body by its own measure (${(idle.rig.bottom - up.rig.bottom).toFixed(0)} of 80)`);
  assert.ok(Math.abs(up.shade.bottom - idle.shade.bottom) < 3 && up.shade.width < idle.shade.width - 4, 'the shadow stays down and shrinks');
  assert.ok(up.leg.top > up.torso.top - 4 && up.leg.top < up.torso.bottom, 'in the air the legs swing from the hip, not away from the body');
  assert.ok(up.leg.left < idle.leg.left - 6, 'hind legs stretch out behind');
  assert.ok(idle.emote.top - up.emote.top > 60, 'the sign over its head rises with it');
  ok(`${engine}: off the ground the body rises, the legs stretch and the shadow stays`);

  await pose('robin', 'idle');
  assert.equal(await box('.wing.fly'), null, 'wings folded on the ground');
  assert.ok(await box('.wing.fold'));
  await pose('robin', 'fly', { lift: 30 });
  assert.ok(await box('.wing.fly'), 'wings spread in the air');
  assert.equal(await box('.wing.fold'), null);
  const beat = [];
  for (let i = 0; i < 6; i++) { beat.push((await box('.wing.fly:not(.far)')).height); await page.waitForTimeout(45); }
  assert.ok(Math.max(...beat) - Math.min(...beat) > 4, `and beat (${beat.map(b => b.toFixed(0)).join(' ')})`);
  ok(`${engine}: a bird spreads its wings to fly and they beat`);

  await pose('dog', 'walk');
  const steps = [];
  for (let i = 0; i < 6; i++) { steps.push((await box('.leg.fl:not(.far)')).left); await page.waitForTimeout(70); }
  assert.ok(Math.max(...steps) - Math.min(...steps) > 3, `legs stride (${steps.map(s => s.toFixed(0)).join(' ')})`);
  ok(`${engine}: walking moves the legs`);

  await pose('duck', 'swim');
  assert.notEqual(await style('.sprite', 'clipPath'), 'none', 'what is under water is cut away');
  assert.notEqual(await style('.sprite', 'translate'), 'none', 'and it sits low');
  ok(`${engine}: a swimmer sits low in the water`);

  assert.deepEqual(errors, []);
  console.log(`# ${passed} checks passed in ${engine}`);
} catch (error) {
  console.error(`not ok - ${error.message}`);
  process.exitCode = 1;
} finally {
  // A browser that does not close (it happens on busy CI machines) must not hang the run.
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 10000))]);
  server.close();
  setTimeout(() => process.exit(), 100);
}
