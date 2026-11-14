// The life of a haven: where each animal is, how it is moving, what it is doing and what it does next.
// Animals walk with weight (they speed up, slow down and steer round what is in the way), hop in
// arcs, fly, swim in the pond, drink at its edge, graze, perch, hide in the burrow, sit by the
// fire, greet and chase each other, and sleep at night.
// This file is only the simulation. It has no DOM, takes its random numbers from outside, and is
// advanced by step(dt), so the same code runs in the app and in tests.
import { speciesById } from './catalog.js';

const FLOWERS = ['clover', 'daisy', 'tulip', 'poppy', 'lavender', 'sunflower', 'waterlily', 'lotus', 'cherry'];
const TREES = ['oak', 'pine', 'birch', 'maple', 'willow', 'cherry', 'palm', 'frostpine', 'bamboo'];
const COVER = ['fern', 'tallgrass', 'blueberry', 'monstera'];
const WATER = ['pond'];
const PERCHES = [...TREES, 'birdhouse'];

// move: how it gets about. speed: tiles a second. likes: what it goes to visit.
// nocturnal: awake at night. perch: sits up in trees. swim: goes into the pond, not beside it.
// graze: stops to eat off the ground. gait: seconds for one stride, hop: [length, height] of a hop.
// sink: how deep it sits in water, in drawing units. den: goes down the burrow.
const TRAITS = {
  rabbit: { move: 'hop', speed: 1.0, likes: ['burrow', 'clover', 'tallgrass', 'daisy'], graze: true, hop: [0.5, 0.24], den: true },
  snail: { move: 'crawl', speed: 0.12, likes: ['tallgrass', 'toadstool', 'fern', 'log'], graze: true, gait: 2.4 },
  ladybug: { move: 'crawl', speed: 0.3, likes: [...FLOWERS, 'tallgrass'], gait: 0.22 },
  frog: { move: 'hop', speed: 0.9, likes: [...WATER, 'waterlily', 'lotus', 'cattail'], swim: true, hop: [0.85, 0.5], sink: 9 },
  bee: { move: 'fly', speed: 1.3, likes: [...FLOWERS, 'beehive', 'lavender'], insect: true },
  butterfly: { move: 'fly', speed: 0.9, likes: FLOWERS, insect: true },
  robin: { move: 'fly', speed: 1.5, likes: PERCHES, perch: true, graze: true, gait: 0.26 },
  lizard: { move: 'walk', speed: 0.8, likes: ['boulder', 'cactus', 'aloe', 'pricklypear'], gait: 0.3 },
  duck: { move: 'walk', speed: 0.6, likes: [...WATER, 'cattail'], swim: true, graze: true, gait: 0.5, sink: 6 },
  hedgehog: { move: 'walk', speed: 0.5, likes: ['log', 'toadstool', ...COVER], nocturnal: true, graze: true, gait: 0.36 },
  squirrel: { move: 'hop', speed: 1.2, likes: [...TREES, 'stump', 'log'], perch: true, graze: true, hop: [0.45, 0.16] },
  turtle: { move: 'crawl', speed: 0.2, likes: [...WATER, 'boulder'], swim: true, graze: true, gait: 1.5, sink: 12 },
  cat: { move: 'walk', speed: 0.8, likes: ['boulder', 'campfire', 'stump', 'birdhouse'], gait: 0.56 },
  shiba: { move: 'walk', speed: 1.1, likes: ['campfire', 'log', 'pond'], gait: 0.5 },
  raccoon: { move: 'walk', speed: 0.8, likes: ['log', 'pond', 'campfire', 'blueberry'], nocturnal: true, graze: true, gait: 0.5 },
  parrot: { move: 'fly', speed: 1.4, likes: PERCHES, perch: true, gait: 0.3 },
  fox: { move: 'walk', speed: 1.0, likes: ['burrow', 'blueberry', 'tallgrass'], nocturnal: true, gait: 0.5, den: true },
  penguin: { move: 'walk', speed: 0.5, likes: [...WATER, 'frostpine', 'boulder'], swim: true, gait: 0.5, sink: 26 },
  fennec: { move: 'walk', speed: 1.0, likes: ['burrow', 'cactus', 'boulder'], nocturnal: true, gait: 0.42, den: true },
  seal: { move: 'crawl', speed: 0.3, likes: [...WATER, 'boulder'], swim: true, gait: 0.9, sink: 12 },
  deer: { move: 'walk', speed: 0.9, likes: [...TREES, 'tallgrass', 'pond', 'clover'], graze: true, gait: 0.7 },
  redpanda: { move: 'walk', speed: 0.7, likes: ['bamboo', ...TREES], perch: true, graze: true, gait: 0.56 },
  owl: { move: 'fly', speed: 1.1, likes: PERCHES, perch: true, nocturnal: true, gait: 0.4 },
  otter: { move: 'walk', speed: 0.8, likes: [...WATER, 'log'], swim: true, gait: 0.4, sink: 10 },
  capybara: { move: 'walk', speed: 0.5, likes: [...WATER, 'campfire', 'tallgrass'], swim: true, graze: true, gait: 0.7, sink: 17 },
  bear: { move: 'walk', speed: 0.6, likes: [...TREES, 'beehive', 'blueberry', 'pond'], graze: true, gait: 0.9 },
  panda: { move: 'walk', speed: 0.5, likes: ['bamboo', 'boulder', 'pond'], graze: true, gait: 0.9 },
};
export const traitsOf = id => TRAITS[id] || { move: 'walk', speed: 0.8, likes: [] };

const MARGIN = 0.4;
const FLY_HEIGHT = 0.9; // how high birds cruise, in tile heights
const INSECT_HEIGHT = 0.55;
const GROW = { 1: 0.8, 2: 0.98, 3: 1.18 }; // how big a thing is drawn at each size
// How high up a percher sits in each thing, and how far round a thing an animal on foot has to go.
// How high the flowers of each plant are, for the insects that land on them.
const SIP = { sunflower: 1.05, cherry: 1.0, lavender: 0.75, tulip: 0.55, poppy: 0.55, daisy: 0.5, clover: 0.28, waterlily: 0.12, lotus: 0.2, beehive: 0.5 };
const PERCH = { oak: 1.15, pine: 1.3, birch: 1.4, maple: 1.25, willow: 1.15, cherry: 1.15, palm: 1.5, frostpine: 1.25, bamboo: 1.3, birdhouse: 0.98 };
const SOLID = { boulder: 0.3, stump: 0.22, log: 0.32, campfire: 0.26, lantern: 0.16, beehive: 0.2, birdhouse: 0.1, burrow: 0.3, cactus: 0.2, pricklypear: 0.2, bonsai: 0.18, pumpkin: 0.18, ...Object.fromEntries(TREES.map(t => [t, 0.17])) };
const SOFT = [...FLOWERS, ...COVER, 'cattail', 'toadstool', 'aloe'].filter(s => !SOLID[s]);

/** The water of a pond: its middle, and how far it reaches across and down the picture. */
const pondOf = t => ({ u: t.u - 0.36 * t.k, v: t.v - 0.36 * t.k, across: 1.22 * t.k, down: 0.62 * t.k });
const inPond = (pond, u, v, grow = 1) => {
  const d = (v - pond.v) - (u - pond.u), s = (u - pond.u) + (v - pond.v);
  return (d / (pond.across * grow)) ** 2 + (s / (pond.down * grow)) ** 2 <= 1;
};
/** A point of a pond, given how far across (−1 to 1), how far down (−1 to 1). */
const pondPoint = (pond, x, y) => { const d = x * pond.across, s = y * pond.down; return [pond.u + (s - d) / 2, pond.v + (s + d) / 2]; };

export class World {
  /** @param {{side: number, random?: () => number}} o */
  constructor({ side, random = Math.random }) {
    this.side = side;
    this.random = random;
    this.t = 0;
    this.animals = new Map();
    this.things = new Map(); // everything that stands still: id → {id, species, u, v, k, solid, soft, pond}
    this.events = []; // what the picture should react to: rustle, land, splash, leaves
  }

  rand(lo, hi) { return lo + this.random() * (hi - lo); }
  clampU(n) { return Math.min(this.side - MARGIN, Math.max(MARGIN, n)); }

  /** Bring the world in line with what stands in the haven. Animals already here keep their place. */
  sync(placed, side = this.side) {
    this.side = side;
    const seen = new Set();
    this.things.clear();
    for (const p of placed) {
      const kind = speciesById(p.species)?.kind;
      if (!kind) continue;
      seen.add(p.id);
      if (kind !== 'animal') {
        const t = { id: p.id, species: p.species, u: p.u, v: p.v, k: GROW[p.size] || GROW[2], cool: 0 };
        t.solid = (SOLID[p.species] || 0) * t.k;
        t.soft = SOFT.includes(p.species);
        if (WATER.includes(p.species)) t.pond = pondOf(t);
        this.things.set(p.id, t);
        continue;
      }
      const a = this.animals.get(p.id);
      if (a) { a.u = this.clampU(a.u); a.v = this.clampU(a.v); continue; }
      const insect = traitsOf(p.species).insect;
      this.animals.set(p.id, {
        id: p.id, species: p.species, u: p.u, v: p.v, vu: 0, vv: 0, face: 1, state: 'idle', act: 'idle', doing: null, until: this.t + this.rand(0.3, 3),
        tu: p.u, tv: p.v, next: 'idle', thing: null, over: null, buddy: null, cool: 0, lift: insect ? INSECT_HEIGHT : 0, liftTo: null, wob: 0, tilt: 0,
        flying: Boolean(insect), wet: false, air: false, hop: null, rest: 0, rush: 0, deadline: 0, phase: this.rand(0, 6.28), emote: null, emoteUntil: 0, moving: false,
      });
    }
    for (const id of [...this.animals.keys()]) if (!seen.has(id)) this.animals.delete(id);
    // An animal on its way to something that has gone thinks again.
    for (const a of this.animals.values()) if (a.thing && !this.things.has(a.thing)) this.release(a);
  }

  /** Stop what it is doing and stand where it is. */
  release(a, pause = 0) {
    Object.assign(a, { thing: null, over: null, buddy: null, state: 'idle', doing: null, until: this.t + pause, liftTo: null, moving: false, hop: null, air: false, vu: 0, vv: 0 });
  }

  /** The person picked an animal up and put it down somewhere. */
  drop(id, u, v) {
    const a = this.animals.get(id);
    if (!a) return;
    Object.assign(a, { u: this.clampU(u), v: this.clampU(v) });
    this.release(a, 1.5);
    if (!traitsOf(a.species).insect) { a.lift = 0; a.flying = false; }
    this.events.push({ type: 'land', id, u: a.u, v: a.v });
  }

  /** Show a little sign over an animal for a few seconds: heart, note, drop, zzz, sparkle, hungry. */
  emote(id, kind, seconds = 2.5) {
    const a = this.animals.get(id);
    if (a) { a.emote = kind; a.emoteUntil = this.t + seconds; }
  }

  /** The person did something to an animal: it stops to eat, or jumps for joy. */
  react(id, what) {
    const a = this.animals.get(id);
    if (!a || a.state === 'sleep' || a.flying && !traitsOf(a.species).insect) return;
    const keep = a.over;
    this.release(a);
    a.over = keep;
    a.state = 'enjoy'; a.doing = what === 'eat' ? 'eat' : 'joy'; a.until = this.t + (what === 'eat' ? 2.6 : 1.3); a.joyAt = this.t;
  }

  /** The person tapped the ground: whoever is near and awake comes over to look. */
  attract(u, v) {
    const near = [...this.animals.values()].filter(a => a.state !== 'sleep' && a.state !== 'greet' && Math.hypot(a.u - u, a.v - v) < 3)
      .sort((a, b) => Math.hypot(a.u - u, a.v - v) - Math.hypot(b.u - u, b.v - v)).slice(0, 3);
    near.forEach((a, i) => {
      this.release(a);
      const angle = this.rand(0, Math.PI * 2);
      this.goTo(a, u + Math.cos(angle) * 0.3 * (i + 0.4), v + Math.sin(angle) * 0.3 * (i + 0.4), 'idle');
      a.rush = this.t + 2.5;
    });
    return near.length;
  }

  near(a, b) { return Math.hypot(a.u - b.u, a.v - b.v); }

  goTo(a, u, v, next) {
    const trait = traitsOf(a.species);
    a.tu = this.clampU(u); a.tv = this.clampU(v); a.next = next; a.state = 'walk';
    // Nobody on foot heads for the middle of a boulder, and only swimmers head into the water.
    if (trait.move !== 'fly') for (const t of this.things.values()) {
      if (t.id === a.thing) continue;
      if (t.pond && !trait.swim && inPond(t.pond, a.tu, a.tv, 1.15)) {
        const d = (a.tv - t.pond.v) - (a.tu - t.pond.u), s = (a.tu - t.pond.u) + (a.tv - t.pond.v), x = d / t.pond.across, y = s / t.pond.down, r = Math.hypot(x, y) || 1;
        const [pu, pv] = pondPoint(t.pond, (x / r) * 1.25, ((y || 1) / r) * 1.25);
        a.tu = this.clampU(pu); a.tv = this.clampU(pv);
      } else if (t.solid) {
        const gu = a.tu - t.u, gv = a.tv - t.v, d = Math.hypot(gu, gv), room = t.solid + 0.25;
        if (d < room) { const ang = d > 0.001 ? Math.atan2(gv, gu) : this.rand(0, 6.28); a.tu = this.clampU(t.u + Math.cos(ang) * room); a.tv = this.clampU(t.v + Math.sin(ang) * room); }
      }
    }
    const dist = Math.hypot(a.tu - a.u, a.tv - a.v);
    a.deadline = this.t + dist / Math.max(0.05, trait.speed * 0.5) + 4;
    // Birds walk short distances and fly long ones or up to a perch. Insects always fly.
    if (trait.move === 'fly' && !trait.insect) a.flying = a.flying || dist > 1.1 || next === 'perch' || a.lift > 0.3;
    if (!a.flying && a.over && !a.wet) { a.over = null; a.liftTo = null; }
  }

  /** An animal with nothing to do picks what to do next. */
  decide(a, ctx) {
    const trait = traitsOf(a.species), hungry = ctx.hungry?.has(a.id);
    const was = { thing: a.thing, over: a.over, liftTo: a.liftTo, doing: a.doing };
    a.buddy = null; a.thing = null; a.doing = null;
    if (!a.wet) { a.over = null; a.liftTo = null; }
    const others = [...this.animals.values()].filter(o => o !== a && o.state !== 'sleep' && o.cool <= this.t && !ctx.hungry?.has(o.id) && o.doing !== 'hide');
    const r = this.random();
    if (!hungry && a.cool <= this.t && others.length && r < 0.2) {
      // Say hello to whoever is nearest.
      const o = others.reduce((best, x) => (this.near(a, x) < this.near(a, best) ? x : best));
      if (this.near(a, o) < 4) {
        const mu = (a.u + o.u) / 2, mv = (a.v + o.v) / 2;
        this.release(o);
        a.buddy = o.id; o.buddy = a.id; a.cool = o.cool = this.t + 24;
        this.goTo(a, mu + 0.24, mv - 0.24, 'greet');
        this.goTo(o, mu - 0.24, mv + 0.24, 'greet');
        return;
      }
    }
    if (!hungry && trait.move !== 'crawl' && others.length && r < 0.3) {
      // A game of chase: run after someone for a few seconds while they run off.
      const o = others[Math.floor(this.random() * others.length)];
      if (traitsOf(o.species).move !== 'crawl' && this.near(a, o) < 5) {
        this.release(o);
        a.buddy = o.id; a.state = 'chase'; a.until = this.t + this.rand(4, 7); a.cool = this.t + 18; a.deadline = a.until;
        if (trait.move === 'fly') a.flying = true;
        a.next = 'idle';
        this.emote(a.id, 'note', 2);
        this.goTo(o, this.rand(MARGIN, this.side - MARGIN), this.rand(MARGIN, this.side - MARGIN), 'idle');
        o.rush = a.until;
        return;
      }
    }
    // A bird that has just come down potters about on foot for a bit before it flies again.
    if (trait.move === 'fly' && !trait.insect && a.lift < 0.05 && (a.potter || 0) < 2 && r > 0.35) {
      a.potter = (a.potter || 0) + 1;
      this.goTo(a, a.u + this.rand(-0.7, 0.7), a.v + this.rand(-0.7, 0.7), 'idle');
      return;
    }
    const liked = [...this.things.values()].filter(t => trait.likes.includes(t.species));
    if (liked.length && r < (hungry ? 0.45 : 0.7)) {
      const t = liked[Math.floor(this.random() * liked.length)];
      // Already settled in the very thing it would go to: stay a while longer.
      if (t.id === was.thing && was.over === t.id) { Object.assign(a, was); a.state = 'enjoy'; a.until = this.t + this.rand(4, 8); if (was.doing === 'swim') a.paddleAt = this.t; return; }
      this.visit(a, trait, t);
      return;
    }
    if (trait.graze && !a.wet && !a.flying && a.lift < 0.05 && r > 0.86) { a.state = 'enjoy'; a.doing = 'eat'; a.until = this.t + this.rand(2.5, 5); return; }
    const reach = hungry ? 1.2 : this.side;
    this.goTo(a, a.u + this.rand(-reach, reach), a.v + this.rand(-reach, reach), 'idle');
  }

  /** Set off for something it likes, to the right spot for what it will do there. */
  visit(a, trait, t) {
    a.thing = t.id;
    const angle = this.rand(0, Math.PI * 2);
    if (t.pond && trait.swim) { const [u, v] = pondPoint(t.pond, this.rand(-0.7, 0.7), this.rand(-0.6, 0.6)); this.goTo(a, u, v, 'swim'); return; }
    if (t.pond) {
      // Drink from the near bank, facing the water.
      const x = this.rand(-0.85, 0.85), [u, v] = pondPoint(t.pond, x * 1.12, Math.sqrt(1 - x * x) * 1.25 + 0.1);
      this.goTo(a, u, v, 'drink');
      return;
    }
    if (trait.perch && PERCH[t.species]) { const d = this.rand(-0.16, 0.16); this.goTo(a, t.u + 0.04 - d, t.v + 0.04 + d, 'perch'); return; }
    if (trait.insect) { this.goTo(a, t.u + Math.cos(angle) * 0.06, t.v + Math.sin(angle) * 0.06, 'sip'); return; }
    if (trait.den && t.species === 'burrow') { this.goTo(a, t.u + 0.02, t.v + 0.02, 'hide'); return; }
    const gap = (t.solid || 0.12) + (t.species === 'campfire' ? this.rand(0.45, 0.6) : this.rand(0.3, 0.42));
    this.goTo(a, t.u + Math.cos(angle) * gap, t.v + Math.sin(angle) * gap, t.species === 'campfire' ? 'sit' : speciesById(t.species)?.kind === 'plant' && trait.graze ? 'eat' : 'rest');
  }

  /** An animal has got where it was going. */
  arrive(a, ctx) {
    const trait = traitsOf(a.species), hungry = ctx.hungry?.has(a.id), t = this.things.get(a.thing);
    a.moving = false; a.vu = 0; a.vv = 0; a.hop = null; a.air = false; a.rush = 0;
    if (a.flying) a.potter = 0;
    if (a.next === 'greet') {
      const o = this.animals.get(a.buddy);
      a.state = 'greet'; a.until = this.t + 2.8;
      if (o) { this.faceTo(a, o.u, o.v); this.emote(a.id, 'heart', 2.6); }
      if (a.flying && !trait.insect) { a.flying = false; }
      return;
    }
    if (t && a.next !== 'idle') {
      a.state = 'enjoy'; a.doing = a.next; a.until = this.t + this.rand(4, 9);
      this.events.push({ type: 'rustle', id: t.id });
      if (a.next !== 'swim') this.faceTo(a, t.pond ? t.pond.u : t.u, t.pond ? t.pond.v : t.v);
      if (a.next === 'perch') { a.over = t.id; a.liftTo = PERCH[t.species] * t.k; a.flying = false; this.events.push({ type: 'leaves', id: t.id, u: t.u, v: t.v, lift: a.liftTo }); if (this.random() < 0.5) this.emote(a.id, 'note', 2.4); }
      else if (a.next === 'sip') { a.over = t.id; a.liftTo = (SIP[t.species] ?? 0.45) * t.k; this.emote(a.id, 'sparkle', 2.4); }
      else if (a.next === 'swim') { a.over = t.id; a.until = this.t + this.rand(8, 16); a.paddleAt = this.t + this.rand(1, 3); this.emote(a.id, 'drop', 2.4); }
      else if (a.next === 'drink') this.emote(a.id, 'drop', 2.4);
      else if (a.next === 'hide') { a.over = t.id; a.until = this.t + this.rand(5, 10); }
      else if (a.next === 'sit' || this.random() < 0.4) this.emote(a.id, 'note', 2.4);
      if (a.flying && !trait.insect && a.next !== 'perch') a.flying = false;
      return;
    }
    a.state = 'idle'; a.doing = null; a.until = this.t + (hungry ? this.rand(4, 9) : this.rand(1.2, 5));
    if (a.flying && !trait.insect) a.flying = false;
    if (hungry && this.random() < 0.5) this.emote(a.id, 'hungry', 3);
  }

  faceTo(a, u, v) {
    const across = (v - u) - (a.v - a.u);
    if (Math.abs(across) > 0.02) a.face = across > 0 ? 1 : -1;
  }

  /**
   * Move everything on by dt seconds.
   * @param {number} dt
   * @param {{night?: boolean, hungry?: Set<string>}} [ctx]
   */
  step(dt, ctx = {}) {
    const step = Math.min(dt, 0.25);
    this.t += step;
    const ponds = [...this.things.values()].filter(t => t.pond);
    for (const a of this.animals.values()) {
      const trait = traitsOf(a.species), hungry = ctx.hungry?.has(a.id);
      if (a.emote && a.emote !== 'zzz' && this.t >= a.emoteUntil) a.emote = null;
      // Night: everyone who is not a night animal settles down where they are.
      const sleepy = Boolean(ctx.night) && !trait.nocturnal;
      if (sleepy) {
        if (a.state !== 'sleep') {
          const up = a.doing === 'perch' && a.liftTo ? [a.over, a.liftTo] : null, den = a.doing === 'hide' ? a.over : null;
          this.release(a);
          a.state = 'sleep'; a.emote = 'zzz'; a.flying = false;
          if (up) { a.over = up[0]; a.liftTo = up[1]; a.doing = 'perch'; }
          if (den) { a.over = den; a.doing = 'hide'; }
        }
        this.settle(a, trait, step);
        this.finish(a, trait, ponds);
        continue;
      }
      if (a.state === 'sleep') { a.state = 'idle'; a.doing = null; a.until = this.t + this.rand(0.3, 2.5); a.emote = null; if (trait.insect) a.flying = true; }

      if (a.state === 'chase') {
        const o = this.animals.get(a.buddy);
        if (!o || this.t >= a.until || this.near(a, o) < 0.35) { a.next = 'idle'; a.thing = null; this.arrive(a, ctx); if (o && this.near(a, o) < 0.5) this.emote(o.id, 'note', 2); }
        else { a.tu = o.u; a.tv = o.v; this.advance(a, trait, step, hungry, 1.3); }
      } else if (a.state === 'walk') {
        if (this.advance(a, trait, step, hungry, a.rush > this.t ? 1.5 : 1) || this.t > a.deadline) this.arrive(a, ctx);
      } else if (a.state === 'enjoy' && a.doing === 'swim' && this.things.get(a.thing)?.pond) {
        // Paddle about the pond rather than floating on one spot.
        const pond = this.things.get(a.thing).pond;
        if (a.paddle) { a.tu = a.paddle[0]; a.tv = a.paddle[1]; if (this.advance(a, trait, step, hungry, 0.5)) { a.paddle = null; a.moving = false; a.vu = a.vv = 0; a.paddleAt = this.t + this.rand(1.5, 4); } }
        else if (this.t >= a.paddleAt) a.paddle = pondPoint(pond, this.rand(-0.72, 0.72), this.rand(-0.62, 0.62));
        if (this.t >= a.until) { a.paddle = null; this.decide(a, ctx); }
      } else if (this.t >= a.until) {
        this.decide(a, ctx);
      }
      this.settle(a, trait, step);
      this.finish(a, trait, ponds);
    }
    // Animals standing on the same spot shuffle apart.
    const list = [...this.animals.values()];
    for (let i = 0; i < list.length; i++) for (let j = 0; j < i; j++) {
      const a = list[i], b = list[j], d = this.near(a, b);
      if (d < 0.28 && !a.moving && !b.moving && Math.abs(a.lift - b.lift) < 0.3 && a.doing !== 'hide' && b.doing !== 'hide') {
        const angle = d > 0.001 ? Math.atan2(a.v - b.v, a.u - b.u) : this.rand(0, Math.PI * 2), push = (0.28 - d) / 2 + 0.01;
        a.u = this.clampU(a.u + Math.cos(angle) * push); a.v = this.clampU(a.v + Math.sin(angle) * push);
        b.u = this.clampU(b.u - Math.cos(angle) * push); b.v = this.clampU(b.v - Math.sin(angle) * push);
      }
    }
  }

  /** Take one step toward the target. True when it has arrived. */
  advance(a, trait, dt, hungry, pace = 1) {
    const du = a.tu - a.u, dv = a.tv - a.v, dist = Math.hypot(du, dv);
    const speed = trait.speed * (hungry ? 0.55 : 1) * pace * (a.wet ? 0.55 : 1) * (trait.move === 'fly' && !a.flying ? 0.3 : 1);
    a.moving = true;

    if (a.flying) {
      // In the air: climb to cruising height, come down as the target gets near.
      const final = a.next === 'perch' && this.things.has(a.thing) ? PERCH[this.things.get(a.thing).species] * this.things.get(a.thing).k : a.next === 'sip' && this.things.has(a.thing) ? (SIP[this.things.get(a.thing).species] ?? 0.45) * this.things.get(a.thing).k : trait.insect ? INSECT_HEIGHT : 0;
      const cruise = trait.insect ? INSECT_HEIGHT : Math.max(FLY_HEIGHT, final);
      a.liftTo = dist > 0.75 ? cruise : final;
      if (dist <= Math.max(speed * dt, 0.04)) { a.u = a.tu; a.v = a.tv; return Math.abs(a.lift - final) < 0.1; }
      const want = Math.min(1, dist / 0.5 + 0.25) * speed, k = Math.min(1, dt * 5);
      // Butterflies never fly straight: they drift from side to side.
      const drift = trait.insect ? Math.sin(this.t * (a.species === 'butterfly' ? 2.6 : 7) + a.phase) * (a.species === 'butterfly' ? 0.55 : 0.2) : 0;
      a.vu += ((du / dist) * want - (dv / dist) * want * drift - a.vu) * k; a.vv += ((dv / dist) * want + (du / dist) * want * drift - a.vv) * k;
      this.move(a, dt);
      return false;
    }

    if (trait.move === 'hop' && !a.wet) {
      // A hop: sit, spring, sail, land.
      const [hopLen, hopH] = trait.hop, air = 0.24 + hopH * 0.5, cycle = hopLen / speed;
      if (!a.hop) {
        if (dist <= 0.05) { a.u = a.tu; a.v = a.tv; return true; }
        a.rest -= dt;
        if (a.rest > 0) return false;
        const reach = Math.min(dist, hopLen);
        a.hop = { p: 0, air, du: (du / dist) * reach, dv: (dv / dist) * reach, h: hopH * Math.max(0.45, reach / hopLen) };
        this.faceTo(a, a.tu, a.tv);
      }
      const h = a.hop, was = h.p;
      h.p = Math.min(1, h.p + dt / h.air);
      a.u = this.clampU(a.u + h.du * (h.p - was)); a.v = this.clampU(a.v + h.dv * (h.p - was));
      a.lift = h.h * 4 * h.p * (1 - h.p); a.air = h.p < 1; a.tilt = -(1 - 2 * h.p) * 16;
      if (h.p >= 1) { a.hop = null; a.lift = 0; a.tilt = 0; a.rest = Math.max(0.07, cycle - air); this.events.push({ type: 'land', id: a.id, u: a.u, v: a.v, soft: hopH < 0.3 }); }
      return false;
    }

    // On foot, or paddling: build up speed, ease off on arriving, and steer round what is in the way.
    if (dist <= 0.05) { a.u = a.tu; a.v = a.tv; return true; }
    let wu = du / dist, wv = dv / dist;
    for (const t of this.things.values()) {
      const gu = a.u - t.u, gv = a.v - t.v;
      if (t.soft) {
        if (t.cool <= this.t && Math.abs(gu) < 0.2 && Math.abs(gv) < 0.2) { t.cool = this.t + 2.5; this.events.push({ type: 'rustle', id: t.id }); }
        continue;
      }
      if (t.pond) {
        if (trait.swim || !inPond(t.pond, a.u + wu * 0.25, a.v + wv * 0.25, 1.08)) continue;
        // Walk round the water: turn along the bank, on the side nearer the target.
        const ou = a.u - t.pond.u, ov = a.v - t.pond.v, on = Math.hypot(ou, ov) || 1, side = (-ov * wu + ou * wv) >= 0 ? 1 : -1;
        wu = (-ov / on) * side * 0.9 + (ou / on) * 0.45; wv = (ou / on) * side * 0.9 + (ov / on) * 0.45;
        continue;
      }
      if (!t.solid || t.id === a.thing) continue;
      const d = Math.hypot(gu, gv), room = t.solid + 0.22;
      if (d < room && d > 0.001) {
        const push = (room - d) / 0.22, side = (-gv * wu + gu * wv) >= 0 ? 1 : -1;
        wu += (gu / d) * push * 1.4 + (-gv / d) * side * push * 0.8; wv += (gv / d) * push * 1.4 + (gu / d) * side * push * 0.8;
      }
    }
    const wn = Math.hypot(wu, wv) || 1, want = Math.min(1, dist / 0.4 + 0.2) * speed, k = Math.min(1, dt * (trait.move === 'crawl' ? 3 : 7));
    a.vu += ((wu / wn) * want - a.vu) * k; a.vv += ((wv / wn) * want - a.vv) * k;
    this.move(a, dt);
    return false;
  }

  move(a, dt) {
    a.u = this.clampU(a.u + a.vu * dt); a.v = this.clampU(a.v + a.vv * dt);
    const across = a.vv - a.vu; // which way it moves across the screen
    if (Math.abs(across) > 0.08) a.face = across > 0 ? 1 : -1;
  }

  /** Ease height toward where the animal should be: in the air, up a tree, or on the ground. */
  settle(a, trait, dt) {
    if (a.hop) return;
    if (a.state === 'enjoy' && a.doing === 'joy' && !trait.insect) { a.lift = Math.abs(Math.sin((this.t - a.joyAt) * 7)) * 0.22 * Math.max(0, 1 - (this.t - a.joyAt) / 1.3); return; }
    const base = trait.insect && a.state !== 'sleep' ? INSECT_HEIGHT : 0;
    const target = a.liftTo ?? base, was = a.lift;
    a.lift += (target - a.lift) * Math.min(1, dt * (a.flying ? 2.2 : 3));
    if (Math.abs(a.lift - target) < 0.01) a.lift = target;
    // Nose up on the way up, down on the way down.
    a.tilt = a.flying && a.moving ? Math.max(-22, Math.min(22, -((a.lift - was) / dt) * 26)) : 0;
  }

  /** Work out what the picture needs: whether it is in water, the little bob of flight, and what it is doing. */
  finish(a, trait, ponds) {
    const wet = Boolean(trait.swim) && a.lift < 0.05 && ponds.some(t => inPond(t.pond, a.u, a.v, 0.94));
    if (wet && !a.wet) this.events.push({ type: 'splash', id: a.id, u: a.u, v: a.v });
    if (wet) { const t = ponds.find(p => inPond(p.pond, a.u, a.v, 0.94)); a.over = t.id; } else if (a.wet && a.over && this.things.get(a.over)?.pond) a.over = null;
    a.wet = wet;
    a.wob = a.flying && a.state !== 'sleep' ? Math.sin(this.t * (a.species === 'butterfly' ? 5 : trait.insect ? 9 : 3) + a.phase) * (a.species === 'butterfly' ? 0.09 : trait.insect ? 0.03 : 0.04) : 0;
    a.act = a.doing === 'hide' && !a.moving ? 'hide'
      : a.state === 'sleep' ? 'sleep'
      : a.flying && (a.moving || trait.insect || a.lift > 0.08 && !a.over) ? 'fly'
      : a.wet ? 'swim'
      : a.moving ? (a.hop || a.air || trait.move === 'hop' ? 'hop' : a.state === 'chase' || a.rush > this.t ? 'run' : 'walk')
      : a.state === 'enjoy' ? (a.doing === 'rest' ? 'sit' : a.doing === 'sip' ? 'fly' : a.doing || 'idle')
      : a.state === 'greet' ? 'greet' : 'idle';
  }
}
