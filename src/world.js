// The life of a haven: where each animal is, what it is doing, and what it does next.
// Animals wander the land, visit the plants and nature they like, greet and chase each other,
// drink at the pond, perch in trees, gather at the fire, and sleep at night.
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
const TRAITS = {
  rabbit: { move: 'hop', speed: 1.0, likes: ['burrow', 'clover', 'tallgrass', 'daisy'] },
  snail: { move: 'crawl', speed: 0.12, likes: ['tallgrass', 'toadstool', 'fern', 'log'] },
  ladybug: { move: 'crawl', speed: 0.3, likes: [...FLOWERS, 'tallgrass'] },
  frog: { move: 'hop', speed: 0.9, likes: [...WATER, 'waterlily', 'lotus', 'cattail'], swim: true },
  bee: { move: 'fly', speed: 1.3, likes: [...FLOWERS, 'beehive', 'lavender'] },
  butterfly: { move: 'fly', speed: 0.9, likes: FLOWERS },
  robin: { move: 'fly', speed: 1.4, likes: PERCHES, perch: true },
  lizard: { move: 'walk', speed: 0.8, likes: ['boulder', 'cactus', 'aloe', 'pricklypear'] },
  duck: { move: 'walk', speed: 0.6, likes: [...WATER, 'cattail'], swim: true },
  hedgehog: { move: 'walk', speed: 0.5, likes: ['log', 'toadstool', ...COVER], nocturnal: true },
  squirrel: { move: 'hop', speed: 1.2, likes: [...TREES, 'stump', 'log'], perch: true },
  turtle: { move: 'crawl', speed: 0.2, likes: [...WATER, 'boulder'], swim: true },
  cat: { move: 'walk', speed: 0.8, likes: ['boulder', 'campfire', 'stump', 'birdhouse'] },
  shiba: { move: 'walk', speed: 1.1, likes: ['campfire', 'log', 'pond'] },
  raccoon: { move: 'walk', speed: 0.8, likes: ['log', 'pond', 'campfire', 'blueberry'], nocturnal: true },
  parrot: { move: 'fly', speed: 1.3, likes: PERCHES, perch: true },
  fox: { move: 'walk', speed: 1.0, likes: ['burrow', 'blueberry', 'tallgrass'], nocturnal: true },
  penguin: { move: 'walk', speed: 0.5, likes: [...WATER, 'frostpine', 'boulder'], swim: true },
  fennec: { move: 'walk', speed: 1.0, likes: ['burrow', 'cactus', 'boulder'], nocturnal: true },
  seal: { move: 'crawl', speed: 0.3, likes: [...WATER, 'boulder'], swim: true },
  deer: { move: 'walk', speed: 0.9, likes: [...TREES, 'tallgrass', 'pond', 'clover'] },
  redpanda: { move: 'walk', speed: 0.7, likes: ['bamboo', ...TREES], perch: true },
  owl: { move: 'fly', speed: 1.1, likes: PERCHES, perch: true, nocturnal: true },
  otter: { move: 'walk', speed: 0.8, likes: [...WATER, 'log'], swim: true },
  capybara: { move: 'walk', speed: 0.5, likes: [...WATER, 'campfire', 'tallgrass'], swim: true },
  bear: { move: 'walk', speed: 0.6, likes: [...TREES, 'beehive', 'blueberry', 'pond'] },
  panda: { move: 'walk', speed: 0.5, likes: ['bamboo', 'boulder', 'pond'] },
};
export const traitsOf = id => TRAITS[id] || { move: 'walk', speed: 0.8, likes: [] };

const MARGIN = 0.4;
const FLY_HEIGHT = 0.9; // how high fliers hover, in tile heights
const PERCH_HEIGHT = 1.25; // how high a percher sits in a tree

export class World {
  /** @param {{side: number, random?: () => number}} o */
  constructor({ side, random = Math.random }) {
    this.side = side;
    this.random = random;
    this.t = 0;
    this.animals = new Map();
    this.things = new Map(); // everything that stands still: id → {id, species, u, v}
    this.events = []; // what the picture should react to: {type: 'rustle', id}
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
      if (kind !== 'animal') { this.things.set(p.id, { id: p.id, species: p.species, u: p.u, v: p.v }); continue; }
      const a = this.animals.get(p.id);
      if (a) { a.u = this.clampU(a.u); a.v = this.clampU(a.v); continue; }
      this.animals.set(p.id, { id: p.id, species: p.species, u: p.u, v: p.v, face: 1, state: 'idle', until: this.t + this.rand(0.3, 3), tu: p.u, tv: p.v, next: 'idle', thing: null, buddy: null, cool: 0, lift: traitsOf(p.species).move === 'fly' ? FLY_HEIGHT : 0, liftTo: null, emote: null, emoteUntil: 0, moving: false });
    }
    for (const id of [...this.animals.keys()]) if (!seen.has(id)) this.animals.delete(id);
    // An animal on its way to something that has gone thinks again.
    for (const a of this.animals.values()) if (a.thing && !this.things.has(a.thing)) { a.thing = null; a.state = 'idle'; a.until = this.t; a.liftTo = null; }
  }

  /** The person picked an animal up and put it down somewhere. */
  drop(id, u, v) {
    const a = this.animals.get(id);
    if (!a) return;
    Object.assign(a, { u: this.clampU(u), v: this.clampU(v), state: 'idle', until: this.t + 1.5, buddy: null, thing: null, liftTo: null, moving: false });
  }

  /** Show a little sign over an animal for a few seconds: heart, note, drop, zzz, sparkle, hungry. */
  emote(id, kind, seconds = 2.5) {
    const a = this.animals.get(id);
    if (a) { a.emote = kind; a.emoteUntil = this.t + seconds; }
  }

  near(a, b) { return Math.hypot(a.u - b.u, a.v - b.v); }

  goTo(a, u, v, next) {
    a.tu = this.clampU(u); a.tv = this.clampU(v); a.next = next; a.state = 'walk';
  }

  /** An animal with nothing to do picks what to do next. */
  decide(a, ctx) {
    const trait = traitsOf(a.species), hungry = ctx.hungry?.has(a.id);
    a.buddy = null; a.thing = null; a.liftTo = null;
    const others = [...this.animals.values()].filter(o => o !== a && o.state !== 'sleep' && o.cool <= this.t && !ctx.hungry?.has(o.id));
    const r = this.random();
    if (!hungry && a.cool <= this.t && others.length && r < 0.2) {
      // Say hello to whoever is nearest.
      const o = others.reduce((best, x) => (this.near(a, x) < this.near(a, best) ? x : best));
      if (this.near(a, o) < 4) {
        const mu = (a.u + o.u) / 2, mv = (a.v + o.v) / 2;
        a.buddy = o.id; o.buddy = a.id; a.cool = o.cool = this.t + 24;
        o.thing = null; o.liftTo = null;
        this.goTo(a, mu + 0.22, mv - 0.22, 'greet');
        this.goTo(o, mu - 0.22, mv + 0.22, 'greet');
        return;
      }
    }
    if (!hungry && trait.move !== 'crawl' && others.length && r < 0.3) {
      // A game of chase: run after someone for a few seconds while they run off.
      const o = others[Math.floor(this.random() * others.length)];
      if (traitsOf(o.species).move !== 'crawl' && this.near(a, o) < 5) {
        a.buddy = o.id; a.state = 'chase'; a.until = this.t + this.rand(4, 7); a.cool = this.t + 18;
        this.emote(a.id, 'note', 2);
        this.goTo(o, this.rand(MARGIN, this.side - MARGIN), this.rand(MARGIN, this.side - MARGIN), 'idle');
        return;
      }
    }
    const liked = [...this.things.values()].filter(t => trait.likes.includes(t.species));
    if (liked.length && r < (hungry ? 0.45 : 0.7)) {
      const t = liked[Math.floor(this.random() * liked.length)];
      a.thing = t.id;
      const inside = (trait.swim && WATER.includes(t.species)) || (trait.perch && PERCHES.includes(t.species)) || (trait.move === 'fly' && !trait.perch);
      const angle = this.rand(0, Math.PI * 2), gap = inside ? this.rand(0, 0.12) : this.rand(0.4, 0.6);
      this.goTo(a, t.u + Math.cos(angle) * gap, t.v + Math.sin(angle) * gap, 'enjoy');
      return;
    }
    const reach = hungry ? 1.2 : this.side;
    this.goTo(a, a.u + this.rand(-reach, reach), a.v + this.rand(-reach, reach), 'idle');
  }

  /** An animal has got where it was going. */
  arrive(a, ctx) {
    const trait = traitsOf(a.species), hungry = ctx.hungry?.has(a.id);
    a.moving = false;
    if (a.next === 'greet') {
      const o = this.animals.get(a.buddy);
      a.state = 'greet'; a.until = this.t + 2.8;
      if (o) { a.face = (o.v - o.u) - (a.v - a.u) >= 0 ? 1 : -1; this.emote(a.id, 'heart', 2.6); }
      return;
    }
    if (a.next === 'enjoy' && this.things.has(a.thing)) {
      const t = this.things.get(a.thing);
      a.state = 'enjoy'; a.until = this.t + this.rand(3.5, 8);
      this.events.push({ type: 'rustle', id: t.id });
      if (trait.perch && PERCHES.includes(t.species)) a.liftTo = PERCH_HEIGHT;
      else if (trait.move === 'fly') a.liftTo = 0.35;
      if (WATER.includes(t.species)) this.emote(a.id, 'drop', 2.4);
      else if (FLOWERS.includes(t.species) && trait.move === 'fly') this.emote(a.id, 'sparkle', 2.4);
      else if (t.species === 'campfire' || this.random() < 0.4) this.emote(a.id, 'note', 2.4);
      return;
    }
    a.state = 'idle'; a.until = this.t + (hungry ? this.rand(4, 9) : this.rand(1.2, 5));
    if (hungry && this.random() < 0.5) this.emote(a.id, 'hungry', 3);
  }

  /**
   * Move everything on by dt seconds.
   * @param {number} dt
   * @param {{night?: boolean, hungry?: Set<string>}} [ctx]
   */
  step(dt, ctx = {}) {
    const step = Math.min(dt, 0.25);
    this.t += step;
    for (const a of this.animals.values()) {
      const trait = traitsOf(a.species), hungry = ctx.hungry?.has(a.id);
      if (a.emote && a.emote !== 'zzz' && this.t >= a.emoteUntil) a.emote = null;
      // Night: everyone who is not a night animal settles down where they are.
      const sleepy = Boolean(ctx.night) && !trait.nocturnal;
      if (sleepy) {
        if (a.state !== 'sleep') { a.state = 'sleep'; a.moving = false; a.buddy = null; a.emote = 'zzz'; if (!(a.liftTo && a.thing)) a.liftTo = null; }
        this.settle(a, trait, step);
        continue;
      }
      if (a.state === 'sleep') { a.state = 'idle'; a.until = this.t + this.rand(0.3, 2.5); a.emote = null; }

      if (a.state === 'chase') {
        const o = this.animals.get(a.buddy);
        if (!o || this.t >= a.until || this.near(a, o) < 0.35) { a.next = 'idle'; this.arrive(a, ctx); if (o && this.near(a, o) < 0.5) this.emote(o.id, 'note', 2); }
        else { a.tu = o.u; a.tv = o.v; this.advance(a, trait, step * 1.25, hungry); }
      } else if (a.state === 'walk') {
        if (this.advance(a, trait, step, hungry)) this.arrive(a, ctx);
      } else if (this.t >= a.until) {
        this.decide(a, ctx);
      }
      this.settle(a, trait, step);
    }
    // Animals standing on the same spot shuffle apart.
    const list = [...this.animals.values()];
    for (let i = 0; i < list.length; i++) for (let j = 0; j < i; j++) {
      const a = list[i], b = list[j], d = this.near(a, b);
      if (d < 0.28 && !a.moving && !b.moving && Math.abs(a.lift - b.lift) < 0.3) {
        const angle = d > 0.001 ? Math.atan2(a.v - b.v, a.u - b.u) : this.rand(0, Math.PI * 2), push = (0.28 - d) / 2 + 0.01;
        a.u = this.clampU(a.u + Math.cos(angle) * push); a.v = this.clampU(a.v + Math.sin(angle) * push);
        b.u = this.clampU(b.u - Math.cos(angle) * push); b.v = this.clampU(b.v - Math.sin(angle) * push);
      }
    }
  }

  /** Take one step toward the target. True when it has arrived. */
  advance(a, trait, dt, hungry) {
    const du = a.tu - a.u, dv = a.tv - a.v, dist = Math.hypot(du, dv);
    const stride = trait.speed * (hungry ? 0.55 : 1) * dt;
    if (dist <= Math.max(stride, 0.03)) { a.u = a.tu; a.v = a.tv; return true; }
    a.u += (du / dist) * stride; a.v += (dv / dist) * stride;
    const across = dv - du; // which way it moves across the screen
    if (Math.abs(across) > 0.02) a.face = across > 0 ? 1 : -1;
    a.moving = true;
    return false;
  }

  /** Ease height toward where the animal should be: in the air, up a tree, or on the ground. */
  settle(a, trait, dt) {
    const base = trait.move === 'fly' && a.state !== 'sleep' ? FLY_HEIGHT : 0;
    const target = a.liftTo ?? base;
    a.lift += (target - a.lift) * Math.min(1, dt * 3);
    if (Math.abs(a.lift - target) < 0.01) a.lift = target;
  }
}
