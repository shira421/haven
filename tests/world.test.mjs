import test from 'node:test';
import assert from 'node:assert/strict';
import { World, traitsOf } from '../src/world.js';
import { ANIMALS } from '../src/catalog.js';

// A small repeatable random source, so every run of a test sees the same haven.
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const thing = (id, species, u, v) => ({ id, species, u, v });
function run(world, seconds, ctx = {}, each = () => {}) { for (let i = 0; i < seconds * 10; i++) { world.step(0.1, ctx); each(world); } }

test('every animal has its own way of getting about', () => {
  for (const a of ANIMALS) {
    const t = traitsOf(a.id);
    assert.ok(['walk', 'hop', 'fly', 'crawl'].includes(t.move) && t.speed > 0 && t.speed < 2 && t.likes.length > 0, a.id);
  }
  assert.equal(traitsOf('unknown').move, 'walk');
});

test('animals leave their spot, roam the whole land and never step off it', () => {
  const world = new World({ side: 6, random: seeded(1) });
  world.sync([thing('r', 'rabbit', 3, 3), thing('f', 'fox', 2, 4), thing('s', 'snail', 1, 1)]);
  const far = { r: 0, f: 0, s: 0 };
  run(world, 300, {}, w => { for (const a of w.animals.values()) { assert.ok(a.u >= 0.4 && a.u <= 5.6 && a.v >= 0.4 && a.v <= 5.6, `${a.id} is on the land`); far[a.id] = Math.max(far[a.id], Math.hypot(a.u - 3, a.v - 3)); } });
  assert.ok(far.r > 1.5 && far.f > 1.5, 'the rabbit and the fox got around');
  assert.ok(world.animals.get('s').u !== 1 || world.animals.get('s').v !== 1, 'even the snail moved');
});

test('animals greet each other', () => {
  const world = new World({ side: 5, random: seeded(3) });
  world.sync([thing('a', 'rabbit', 2, 2), thing('b', 'cat', 3, 3)]);
  let hearts = 0, closest = 9;
  run(world, 240, {}, w => { const a = w.animals.get('a'), b = w.animals.get('b'); if (a.emote === 'heart' || b.emote === 'heart') { hearts++; closest = Math.min(closest, w.near(a, b)); } });
  assert.ok(hearts > 0, 'a heart was shown');
  assert.ok(closest < 1, `they were side by side when it happened (${closest.toFixed(2)})`);
});

test('animals visit what they like: a frog goes into the pond, a rabbit goes down its burrow', () => {
  const world = new World({ side: 6, random: seeded(5) });
  world.sync([thing('frog', 'frog', 1, 1), thing('rab', 'rabbit', 5, 5), thing('pond', 'pond', 4, 2), thing('hole', 'burrow', 2, 4), thing('oak', 'oak', 3, 3)]);
  let inPond = false, byBurrow = false, drank = false;
  const rustled = new Set();
  run(world, 300, {}, w => {
    const f = w.animals.get('frog'), r = w.animals.get('rab');
    if (f.state === 'enjoy' && f.thing === 'pond' && f.wet && f.act === 'swim' && f.over === 'pond') inPond = true;
    if (f.emote === 'drop') drank = true;
    if (r.state === 'enjoy' && r.thing === 'hole' && r.act === 'hide' && Math.hypot(r.u - 2, r.v - 4) < 0.1) byBurrow = true;
    for (const e of w.events.splice(0)) rustled.add(e.id);
  });
  assert.ok(inPond && drank, 'the frog swam in the pond');
  assert.ok(byBurrow, 'the rabbit went down the burrow');
  assert.ok(rustled.has('pond') && rustled.has('hole'), 'the things they visited reacted');
  assert.equal(rustled.has('oak'), false, 'nobody here cares for the oak');
});

test('birds fly, and perch up in trees', () => {
  const world = new World({ side: 6, random: seeded(8) });
  world.sync([thing('bird', 'robin', 1, 1), thing('oak', 'oak', 4, 4)]);
  let flew = false, perched = false, walked = false;
  run(world, 900, {}, w => { const b = w.animals.get('bird'); if (b.act === 'fly' && b.lift > 0.8) flew = true; if (b.act === 'perch' && b.lift > 1 && b.over === 'oak' && Math.hypot(b.u - 4, b.v - 4) < 0.3) perched = true; if (b.act === 'walk' && b.lift === 0) walked = true; });
  assert.ok(flew && perched, 'it flew to the oak and sat in it');
  assert.ok(walked, 'short trips are made on foot');
});

test('at night day animals sleep where they are and night animals carry on', () => {
  const world = new World({ side: 6, random: seeded(11) });
  world.sync([thing('r', 'rabbit', 2, 2), thing('o', 'owl', 4, 4), thing('bee', 'bee', 3, 3), thing('oak', 'oak', 1, 4)]);
  run(world, 20);
  run(world, 2, { night: true });
  const r = world.animals.get('r'), bee = world.animals.get('bee'), at = [r.u, r.v];
  let owlMoved = false;
  run(world, 120, { night: true }, w => { if (w.animals.get('o').moving) owlMoved = true; });
  assert.equal(r.state, 'sleep');
  assert.equal(r.emote, 'zzz');
  assert.deepEqual([r.u, r.v], at, 'the rabbit did not move all night');
  assert.equal(bee.lift, 0, 'the bee came down to rest');
  assert.ok(owlMoved, 'the owl was up and about');
  run(world, 60);
  assert.notEqual(r.state, 'sleep');
  assert.equal(r.emote === 'zzz', false);
});

test('a hungry animal is slow, keeps close and says so', () => {
  const far = hungry => {
    const world = new World({ side: 8, random: seeded(21) });
    world.sync([thing('d', 'shiba', 4, 4)]);
    let travelled = 0, last = [4, 4], asked = false;
    run(world, 120, { hungry: new Set(hungry ? ['d'] : []) }, w => { const a = w.animals.get('d'); travelled += Math.hypot(a.u - last[0], a.v - last[1]); last = [a.u, a.v]; if (a.emote === 'hungry') asked = true; });
    return { travelled, asked };
  };
  const fed = far(false), hungry = far(true);
  assert.ok(hungry.travelled < fed.travelled * 0.6, `${hungry.travelled.toFixed(1)} against ${fed.travelled.toFixed(1)} tiles`);
  assert.ok(hungry.asked && !fed.asked);
});

test('the world follows the haven: arrivals, departures, a bigger land, and being picked up', () => {
  const world = new World({ side: 5, random: seeded(2) });
  world.sync([thing('a', 'rabbit', 2, 2), thing('p', 'pond', 3, 3)]);
  run(world, 30);
  const a = world.animals.get('a'), where = [a.u, a.v];
  world.sync([thing('a', 'rabbit', 2, 2), thing('b', 'fox', 1, 1)], 6);
  assert.deepEqual([a.u, a.v], where, 'an animal already here stays where it had walked to');
  assert.equal(world.animals.size, 2);
  assert.equal(world.things.size, 0);
  assert.equal(world.side, 6);
  world.drop('a', 99, -3);
  assert.deepEqual([a.u, a.v], [5.6, 0.4], 'dropped back on the land');
  world.emote('a', 'heart', 1);
  assert.equal(a.emote, 'heart');
  run(world, 2);
  assert.equal(a.emote === 'heart', false, 'signs fade');
  world.sync([]);
  assert.equal(world.animals.size, 0);
  world.step(0.1);
});

test('a crowded haven stays lively and nobody ends up on top of anyone', () => {
  const world = new World({ side: 7, random: seeded(13) });
  world.sync([...ANIMALS.map((s, i) => thing('a' + i, s.id, 1 + (i % 6), 1 + Math.floor(i / 6))), thing('pond', 'pond', 3.5, 3.5), thing('oak', 'oak', 2, 5), thing('fire', 'campfire', 5, 2), thing('d', 'daisy', 1, 3)]);
  const seen = new Set();
  run(world, 180, {}, w => { for (const a of w.animals.values()) { seen.add(a.state); if (a.emote) seen.add(a.emote); assert.ok(Number.isFinite(a.u) && Number.isFinite(a.v) && Number.isFinite(a.lift)); } });
  for (const what of ['idle', 'walk', 'enjoy', 'greet', 'chase', 'heart', 'note', 'drop']) assert.ok(seen.has(what), `saw ${what}`);
  const still = [...world.animals.values()].filter(a => !a.moving && a.lift < 0.3);
  for (let i = 0; i < still.length; i++) for (let j = 0; j < i; j++) assert.ok(world.near(still[i], still[j]) > 0.1, 'standing animals are apart');
});

test('animals move with weight: hops rise and fall, walkers gather speed, and nobody walks through a boulder or the pond', () => {
  const world = new World({ side: 8, random: seeded(4) });
  world.sync([thing('r', 'rabbit', 1, 1), thing('d', 'shiba', 1, 6), thing('rock', 'boulder', 4, 4), thing('pond', 'pond', 6, 3)]);
  const r = world.animals.get('r'), d = world.animals.get('d');
  let peak = 0, landed = 0, top = 0, nearest = 9, waded = false;
  const speeds = [];
  for (let i = 0; i < 4000; i++) {
    const before = [d.u, d.v];
    world.step(0.05);
    peak = Math.max(peak, r.lift);
    if (r.act === 'hop') top = Math.max(top, Math.abs(r.tilt));
    for (const e of world.events.splice(0)) if (e.type === 'land' && e.id === 'r') landed++;
    if (d.act === 'walk' || d.act === 'run') speeds.push(Math.hypot(d.u - before[0], d.v - before[1]) / 0.05);
    nearest = Math.min(nearest, Math.hypot(d.u - 4, d.v - 4));
    if (d.wet) waded = true;
  }
  assert.ok(peak > 0.15 && peak < 0.3, `the rabbit leaves the ground when it hops (${peak.toFixed(2)})`);
  assert.ok(landed > 20 && top > 10, 'each hop lands, and the body tips up and down through it');
  assert.equal(r.lift >= 0, true);
  assert.ok(Math.min(...speeds) < 0.5 && Math.max(...speeds) <= 1.1 * 1.5 + 0.01, 'the dog eases in and out of a walk');
  assert.ok(nearest > 0.25, `the dog went round the boulder (${nearest.toFixed(2)})`);
  assert.equal(waded, false, 'and round the pond');
});

test('animals do the right thing in the right place', () => {
  const seen = {};
  const watch = (species, extra, seconds = 400, seed = 6) => {
    const world = new World({ side: 6, random: seeded(seed) });
    world.sync([thing('a', species, 3, 3), ...extra]);
    const a = world.animals.get('a'), acts = new Set(), events = new Set();
    run(world, seconds, {}, w => { acts.add(a.act); for (const e of w.events.splice(0)) events.add(e.type); });
    seen[species] = acts;
    return { acts, events, a };
  };
  const duck = watch('duck', [thing('p', 'pond', 4, 4)]);
  assert.ok(duck.acts.has('swim') && duck.events.has('splash'), 'a duck splashes in and swims');
  const deer = watch('deer', [thing('p', 'pond', 4, 4), thing('c', 'clover', 1, 4)]);
  assert.ok(deer.acts.has('drink') && deer.acts.has('eat') && !deer.acts.has('swim'), 'a deer drinks at the bank and grazes, and stays out of the water');
  assert.ok(deer.events.has('rustle'));
  const cat = watch('cat', [thing('f', 'campfire', 2, 2)]);
  assert.ok(cat.acts.has('sit'), 'a cat sits by the fire');
  const bee = watch('bee', [thing('s', 'sunflower', 2, 4)]);
  assert.deepEqual([...bee.acts], ['fly'], 'a bee is always on the wing');
  const squirrel = watch('squirrel', [thing('o', 'oak', 2, 4)]);
  assert.ok(squirrel.acts.has('perch') && squirrel.acts.has('hop') && squirrel.events.has('leaves'), 'a squirrel bounds to the oak and climbs it');
});

test('animals answer the person: they come when the ground is tapped, eat when fed and jump when petted', () => {
  const world = new World({ side: 6, random: seeded(9) });
  world.sync([thing('a', 'shiba', 1, 1), thing('z', 'snail', 5, 5)]);
  assert.equal(world.attract(2, 2), 1, 'only the dog is near enough');
  const a = world.animals.get('a');
  let ran = false;
  run(world, 1.5, {}, () => { if (a.act === 'run') ran = true; });
  assert.ok(ran && Math.hypot(a.u - 2, a.v - 2) < 0.6, 'the dog ran over');
  world.react('a', 'eat');
  world.step(0.1);
  assert.equal(a.act, 'eat');
  world.react('a', 'joy');
  let jumped = 0;
  run(world, 1, {}, () => { jumped = Math.max(jumped, a.lift); });
  assert.ok(jumped > 0.1, 'a jump for joy');
  run(world, 3);
  assert.equal(a.lift, 0);
});
