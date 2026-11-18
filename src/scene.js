// The two pictures Haven draws: the sky a session passes under, and the island a haven stands on.
// Both are SVG text built from data, so they can be drawn for you, for a friend, or for a test.
import { traitsOf } from './world.js';
import { drawing, tone } from './art.js';
import { n, E, C, P, L } from './shapes.js';
import { speciesById, artOf } from './catalog.js';
import { escapeHTML } from './core.js';

// ——— Sky ———

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, k) => { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join(''); };

// A session is a day: it starts at sunrise and ends at sunset.
const DAY = [
  [0, '#f4a184', '#fddfc0'],
  [0.16, '#8cc3ef', '#dbeefb'],
  [0.5, '#5fb0ee', '#cbe9fc'],
  [0.7, '#74b6ec', '#dcecf4'],
  [0.82, '#f0a05f', '#fbdcae'],
  [1, '#6f5aa5', '#f1957a'],
];
const NIGHT = ['#191b42', '#3f3d7c'];

/** Sky colours at a point of the day, 0 (sunrise) to 1 (sunset). `night` gives the night sky. */
export function skyAt(t, night = false) {
  if (night) return { top: NIGHT[0], bottom: NIGHT[1], night: true, light: true };
  const x = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < DAY.length - 2 && x > DAY[i + 1][0]) i++;
  const [t0, a0, b0] = DAY[i], [t1, a1, b1] = DAY[i + 1];
  const k = (x - t0) / (t1 - t0);
  return { top: mix(a0, a1, k), bottom: mix(b0, b1, k), night: false, light: x > 0.93 };
}
/** The sky outside right now: day from 6 am to 6:30 pm, night otherwise. */
export function skyNow(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h < 6 || h >= 18.5) return { ...skyAt(0, true), t: null };
  const t = (h - 6) / 12.5;
  return { ...skyAt(t), t };
}

// The sun's path, in percent of the scene: it rises from behind the hills on the left, passes
// under the clock, and sets on the right. Percentages keep it right on any screen shape.
const ARC = { x0: 8, x1: 92, base: 78, peak: 37 };
const ARC_CONTROL = (ARC.peak - 0.5 * ARC.base) / 0.5;
/** Where the sun is at t (0 to 1), as percentages of the scene's width and height. */
export function sunAt(t) {
  const x = Math.min(1, Math.max(0, t));
  return { x: ARC.x0 + (ARC.x1 - ARC.x0) * x, y: (1 - x) ** 2 * ARC.base + 2 * (1 - x) * x * ARC_CONTROL + x ** 2 * ARC.base };
}

const STARS = [[10, 12], [23, 26], [33, 9], [44, 30], [56, 14], [68, 27], [80, 11], [90, 31], [16, 40], [75, 43], [50, 5], [38, 45], [62, 41]];
const hills = sky => ({ far: mix(sky.night ? '#2d4a55' : '#8ec49a', sky.bottom, sky.night ? 0.25 : 0.42), near: mix(sky.night ? '#264a43' : '#6fb27a', sky.bottom, sky.night ? 0.1 : 0.16) });
const CLOUD = '<svg class="cloud" viewBox="-28 -20 56 30" style="left:{x}%;top:{y}%;width:{w}px;opacity:{o}"><g fill="#fff"><ellipse cx="0" cy="0" rx="26" ry="9"/><ellipse cx="-10" cy="-6" rx="12" ry="9"/><ellipse cx="8" cy="-8" rx="14" ry="11"/></g></svg>';
const cloud = (x, y, w, o) => CLOUD.replace('{x}', x).replace('{y}', y).replace('{w}', w).replace('{o}', o);

/** The sky: gradient, the sun on its path (or a moon and stars), clouds, and two lines of hills. */
export function skyHTML({ t = 0.5, night = false, showArc = true } = {}) {
  const sky = skyAt(t, night), sun = sunAt(t), h = hills(sky);
  const arc = showArc ? `<svg class="sky-arc" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M${ARC.x0} ${ARC.base}Q50 ${ARC_CONTROL} ${ARC.x1} ${ARC.base}" vector-effect="non-scaling-stroke"/></svg>` : '';
  const body = night
    ? `<svg class="sky-arc stars" viewBox="0 0 100 100" preserveAspectRatio="none">${STARS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".35"/>`).join('')}</svg><span class="moon"></span>`
    : `<span class="sun" style="left:${sun.x.toFixed(2)}%;top:${sun.y.toFixed(2)}%"></span>${cloud(16, 30, 84, 0.75)}${cloud(84, 46, 66, 0.6)}${cloud(58, 56, 50, 0.45)}`;
  return `<div class="sky" aria-hidden="true" style="background:linear-gradient(${sky.top},${sky.bottom})">${arc}${body}
<svg class="hills" viewBox="0 0 400 100" preserveAspectRatio="none"><path class="hill-far" d="M0 46C50 14 104 14 150 36C196 8 262 0 320 28C350 16 380 16 400 24V100H0Z" fill="${h.far}"/><path class="hill-near" d="M0 72C60 44 120 50 180 66C240 46 320 44 400 64V100H0Z" fill="${h.near}"/></svg></div>`;
}
/** Move a drawn daytime sky on to time t without redrawing it. */
export function skyUpdate(el, t) {
  if (!el) return;
  const sky = skyAt(t), sun = sunAt(t), h = hills(sky), dot = el.querySelector('.sun');
  el.style.background = `linear-gradient(${sky.top},${sky.bottom})`;
  if (dot) { dot.style.left = sun.x.toFixed(2) + '%'; dot.style.top = sun.y.toFixed(2) + '%'; }
  el.querySelector('.hill-far')?.setAttribute('fill', h.far);
  el.querySelector('.hill-near')?.setAttribute('fill', h.near);
}

// ——— The land ———

const W = 100, H = 50, DEPTH = 26, HEADROOM = 104, PAD = 6;
const SCALE = { 1: 0.8, 2: 0.98, 3: 1.18 };
// Some things are drawn larger or smaller than a standard tile-wide sprite.
const BUILD = { pond: 1.7, tallgrass: 0.85, stump: 0.85, bougainvillea: 1.05,
  elephant: 1.45, giraffe: 1.25, bear: 1.1, panda: 1.05, deer: 1, seal: 0.95, capybara: 0.9, fox: 0.85, otter: 0.85,
  dog: 0.8, 'dog:golden': 0.86, 'dog:husky': 0.86, 'dog:dalmatian': 0.86, 'dog:corgi': 0.72, 'dog:dachshund': 0.74, 'dog:shiba': 0.8, redpanda: 0.8, raccoon: 0.78, cat: 0.72, penguin: 0.7, fennec: 0.68, turtle: 0.66, rabbit: 0.62, duck: 0.62, squirrel: 0.6, parrot: 0.68, owl: 0.64, lizard: 0.6, hedgehog: 0.58, frog: 0.5, robin: 0.5, snail: 0.42, butterfly: 0.4, ladybug: 0.32, bee: 0.32 };
const GRASS = ['#8fce6e', '#8aca69'], EDGE = '#74b85a', SOIL = '#9a6f4c';

// A land is `side` tiles each way, or [U, V] tiles for a land that is longer one way (a sanctuary).
const dims = side => (Array.isArray(side) ? side : [side, side]);

/** The box the land is drawn in, in drawing units: [x, y, width, height]. */
export function landBox(side) {
  const [U, V, room = 0] = dims(side);
  const top = HEADROOM + room;
  return [-(U * W) / 2 - PAD, -top, ((U + V) * W) / 2 + PAD * 2, ((U + V) * H) / 2 + DEPTH + top + PAD + 8];
}
/** How wide the great tree is drawn, in drawing units, for a clearing of `size` tiles. */
const treeWidth = size => size * W * 0.95;
/**
 * A sanctuary's size as [U, V, room]: `room` is the extra sky above the land so the
 * great tree's crown is never cut off at the top.
 */
export function sanctuarySide(plots, tree) {
  const U = Math.max(...plots.map(p => p.u0 + p.size)), V = Math.max(...plots.map(p => p.v0 + p.size));
  const commons = plots.find(p => p.commons);
  if (!tree || !commons) return [U, V];
  const top = ((tree.u + tree.v) * H) / 2 - treeWidth(commons.size) * (240 / 200) * 0.94;
  return [U, V, Math.max(0, Math.ceil(-top - HEADROOM + 10))];
}
/**
 * Where a point on the land is in the picture, as percentages of its box.
 * (u, v) run from 0 to the land's size along its two edges; `lift` raises it off the ground.
 */
export function project(side, u, v, lift = 0) {
  const [x0, y0, w, h] = landBox(side);
  const x = ((v - u) * W) / 2, y = ((u + v) * H) / 2;
  return { left: ((x - x0) / w) * 100, top: ((y - lift * H - y0) / h) * 100, depth: Math.round(y) };
}
/** The point on the land under a place in the picture, given as fractions (0 to 1) of its box. */
export function unproject(side, fx, fy) {
  const [x0, y0, w, h] = landBox(side);
  const x = x0 + fx * w, y = y0 + fy * h;
  return { u: y / H - x / W, v: y / H + x / W };
}
/** How wide a thing is drawn, as a percentage of the picture's width. */
const build = id => BUILD[id] || BUILD[String(id).split(':')[0]] || 1;
export function widthOf(side, species, size = 2) {
  return ((W * 0.94 * (SCALE[size] || SCALE[2]) * build(species)) / landBox(side)[2]) * 100;
}

/** How many drawing units one tile of height is for a thing: what turns an animal's lift into a move of its drawing. */
export function liftScale(species, size = 2) {
  return (H * 100) / (W * 0.94 * (SCALE[size] || SCALE[2]) * build(species));
}

/** One plant, animal or nature item standing on the land. */
function entity(side, t, interactive) {
  const s = speciesById(t.species), at = project(side, t.u, t.v);
  const delay = ((Math.round(t.u * 7) + Math.round(t.v * 13)) % 10) * -0.4;
  const tag = interactive && t.id ? 'button' : 'span';
  const label = interactive && t.id ? ` data-action="${t.action || 'ent'}" data-ent="${t.id}" aria-label="${escapeHTML(t.label || s.name)}"` : t.id ? ` data-ent="${t.id}"` : '';
  const growing = t.stage !== undefined && t.stage < 3;
  const trait = s.kind === 'animal' ? traitsOf(s.id) : null;
  const art = t.art || artOf(t.species);
  const rig = trait ? `;--gait:${trait.gait || 0.5}s;--sink:${trait.sink || 14};--k:${liftScale(art, t.size).toFixed(1)}` : '';
  return `<${tag} class="ent ${s.kind}${trait ? ' m-' + trait.move : ''}${t.withered ? ' withered' : ''}${growing ? ' growing' : ''}${t.cls ? ' ' + t.cls : ''}"${label}${t.stage !== undefined ? ` data-stage="${t.stage}"` : ''} data-species="${s.id}" style="left:${at.left.toFixed(2)}%;top:${at.top.toFixed(2)}%;width:${widthOf(side, art, t.size).toFixed(2)}%;z-index:${at.depth};--delay:${delay}s${rig}"><svg class="sprite" viewBox="0 0 100 100" aria-hidden="true"><g class="alive">${drawing(art, { kind: s.kind, stage: t.stage ?? 3, withered: t.withered })}</g></svg>${s.kind === 'animal' ? '<i class="emote" aria-hidden="true"></i>' : ''}</${tag}>`;
}

/**
 * A haven: the land floating in the sky and everything standing on it.
 * @param {object} o
 * @param {number} o.side tiles along each edge of the land
 * @param {{id?:string,species:string,size?:number,u:number,v:number,stage?:number,withered?:boolean,label?:string}[]} o.things
 * @param {boolean} [o.interactive] things can be tapped and dragged (they become buttons)
 * @param {string} [o.label] what a screen reader calls the picture
 */
export function worldHTML({ side, things = [], interactive = false, label = '', cls = '' }) {
  const [x0, y0, w, h] = landBox(side), half = (side * W) / 2, mid = (side * H) / 2, bottom = side * H;
  let ground = '';
  for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) {
    const x = ((c - r) * W) / 2, y = ((c + r + 1) * H) / 2;
    ground += `<polygon points="${x} ${y - H / 2} ${x + W / 2} ${y} ${x} ${y + H / 2} ${x - W / 2} ${y}" fill="${GRASS[(r + c) % 2]}"/>`;
  }
  // A scatter of grass tufts and tiny flowers, the same every time for the same land.
  let tufts = '', seed = side * 7919;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < side * side * 1.6; i++) {
    const u = 0.2 + rand() * (side - 0.4), v = 0.2 + rand() * (side - 0.4), x = ((v - u) * W) / 2, y = ((u + v) * H) / 2, pick = rand();
    tufts += pick < 0.75 ? `<path d="M${x.toFixed(1)} ${y.toFixed(1)}l-2 -5M${x.toFixed(1)} ${y.toFixed(1)}l0 -6.500M${x.toFixed(1)} ${y.toFixed(1)}l2.500 -4.500" stroke="#6fb257" stroke-width="1.100" stroke-linecap="round" fill="none"/>` : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.500" fill="${pick < 0.88 ? '#fff8e6' : '#f9d264'}"/>`;
  }
  const order = things.filter(t => speciesById(t.species));
  return `<div class="world${interactive ? ' interactive' : ''}${cls ? ' ' + cls : ''}" data-side="${side}" style="aspect-ratio:${w} / ${h}"${label ? ` role="group" aria-label="${label}"` : ''}>
<svg class="land" viewBox="${x0} ${y0} ${w} ${h}" aria-hidden="true">
<polygon points="${-half} ${mid} 0 ${bottom} 0 ${bottom + DEPTH} ${-half} ${mid + DEPTH}" fill="${SOIL}"/>
<polygon points="${half} ${mid} 0 ${bottom} 0 ${bottom + DEPTH} ${half} ${mid + DEPTH}" fill="${tone(SOIL, -0.2)}"/>
<polygon points="${-half} ${mid} 0 ${bottom} 0 ${bottom + 6} ${-half} ${mid + 6}" fill="${EDGE}"/>
<polygon points="${half} ${mid} 0 ${bottom} 0 ${bottom + 6} ${half} ${mid + 6}" fill="${tone(EDGE, -0.14)}"/>
${ground}${tufts}</svg>${order.map(t => entity(side, t, interactive)).join('')}</div>`;
}

/**
 * A sanctuary: several havens joined into one land. Each plot is a member's haven, `size` tiles
 * each way, with its corner at (u0, v0). Plots sit on a grid; where the grid is not full the land
 * has a bay. Things are given in the sanctuary's own coordinates.
 */
export function sanctuaryHTML({ plots, things = [], label = '', tree = null }) {
  const side = sanctuarySide(plots, tree), [U, V] = side;
  const [x0, y0, w, h] = landBox(side);
  const at = (u, v) => [((v - u) * W) / 2, ((u + v) * H) / 2];
  const has = (u, v) => plots.some(p => u >= p.u0 && u < p.u0 + p.size && v >= p.v0 && v < p.v0 + p.size);
  let faces = '', ground = '', tufts = '';
  plots.forEach((p, i) => {
    const grass = p.commons ? ['#a9d97c', '#a3d477'] : i % 2 ? ['#93cf71', '#8ecb6c'] : GRASS;
    // The two sides of soil that face the viewer, where no other plot covers them.
    const [ax, ay] = at(p.u0 + p.size, p.v0), [bx, by] = at(p.u0 + p.size, p.v0 + p.size), [cx, cy] = at(p.u0, p.v0 + p.size);
    if (!has(p.u0 + p.size + 0.5, p.v0 + 0.5)) faces += `<polygon points="${ax} ${ay} ${bx} ${by} ${bx} ${by + DEPTH} ${ax} ${ay + DEPTH}" fill="${SOIL}"/><polygon points="${ax} ${ay} ${bx} ${by} ${bx} ${by + 6} ${ax} ${ay + 6}" fill="${EDGE}"/>`;
    if (!has(p.u0 + 0.5, p.v0 + p.size + 0.5)) faces += `<polygon points="${cx} ${cy} ${bx} ${by} ${bx} ${by + DEPTH} ${cx} ${cy + DEPTH}" fill="${tone(SOIL, -0.2)}"/><polygon points="${cx} ${cy} ${bx} ${by} ${bx} ${by + 6} ${cx} ${cy + 6}" fill="${tone(EDGE, -0.14)}"/>`;
    for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) {
      const [x, y] = at(p.u0 + r, p.v0 + c);
      ground += `<polygon points="${x} ${y} ${x + W / 2} ${y + H / 2} ${x} ${y + H} ${x - W / 2} ${y + H / 2}" fill="${grass[(r + c) % 2]}"/>`;
    }
    let seed = (i + 1) * 7919 + p.size;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let k = 0; k < p.size * p.size * 1.2; k++) {
      const [x, y] = at(p.u0 + 0.2 + rand() * (p.size - 0.4), p.v0 + 0.2 + rand() * (p.size - 0.4)), pick = rand();
      tufts += pick < 0.75 ? `<path d="M${x.toFixed(1)} ${y.toFixed(1)}l-2 -5M${x.toFixed(1)} ${y.toFixed(1)}l0 -6.5M${x.toFixed(1)} ${y.toFixed(1)}l2.5 -4.5" stroke="#6fb257" stroke-width="1.1" stroke-linecap="round" fill="none"/>` : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.5" fill="${pick < 0.88 ? '#fff8e6' : '#f9d264'}"/>`;
    }
  });
  // A path of stepping stones where two havens meet, so it reads as one land.
  let paths = '';
  for (const p of plots) for (const q of plots) {
    if (q.u0 === p.u0 + p.size && q.v0 === p.v0) for (let c = 0.5; c < p.size; c += 1.5) { const [x, y] = at(q.u0, p.v0 + c); paths += `<ellipse cx="${x}" cy="${y}" rx="7" ry="3.4" fill="#e7dcc4" opacity=".85"/>`; }
    if (q.v0 === p.v0 + p.size && q.u0 === p.u0) for (let r = 0.5; r < p.size; r += 1.5) { const [x, y] = at(p.u0 + r, q.v0); paths += `<ellipse cx="${x}" cy="${y}" rx="7" ry="3.4" fill="#e7dcc4" opacity=".85"/>`; }
  }
  // A name sign at the back of each plot, never wider than most of its plot, so signs do not run into each other.
  const signs = plots.filter(p => !p.commons).map(p => { const pos = project(side, p.u0 + 0.35, p.v0 + p.size / 2); return `<span class="plot-sign" style="left:${pos.left.toFixed(2)}%;top:${pos.top.toFixed(2)}%;max-width:${((p.size * W * 0.8) / w * 100).toFixed(1)}%">${escapeHTML(p.name)}</span>`; }).join('');
  const order = things.filter(t => speciesById(t.species));
  // The great tree stands in the middle of the clearing, wider and taller as the week goes on.
  const commons = plots.find(p => p.commons);
  let great = '';
  if (tree && commons) {
    const at = project(side, tree.u, tree.v), wide = treeWidth(commons.size) / w * 100;
    great = `<div class="great-tree" data-stage="${tree.stage}" style="left:${at.left.toFixed(2)}%;top:${at.top.toFixed(2)}%;width:${wide.toFixed(2)}%;z-index:${at.depth}" role="img" aria-label="The great tree: ${escapeHTML(treeStageName(tree.stage).toLowerCase())}">${greatTreeSVG(tree.stage)}</div>`;
  }
  return `<div class="world sanctuary-land" data-u="${U}" data-v="${V}" style="aspect-ratio:${w} / ${h}"${label ? ` role="group" aria-label="${escapeHTML(label)}"` : ''}>
<svg class="land" viewBox="${x0} ${y0} ${w} ${h}" aria-hidden="true">${faces}${ground}${paths}${tufts}</svg>${signs}${great}${order.map(t => entity(side, t, Boolean(t.action))).join('')}</div>`;
}

/**
 * Lay out members' havens as plots on a near-square grid round a clearing in the middle, where the
 * great tree grows (and a campfire burns while one is lit). Each plot is as big as the biggest haven,
 * and each haven sits in the middle of its plot. Returns the plots, the clearing, and every thing in
 * sanctuary coordinates, with ids made unique per member.
 */
export function sanctuaryLayout(members, { fire = false } = {}) {
  const cells = members.length + 1, cols = Math.ceil(Math.sqrt(cells)), rows = Math.ceil(cells / cols);
  const middle = Math.floor((rows - 1) / 2) * cols + Math.floor((cols - 1) / 2);
  const cards = members.map(m => ({ m, ...thingsFromCard(m.card) }));
  const size = Math.max(5, ...cards.map(c => c.side));
  const plots = [], things = [], place = i => ({ u0: Math.floor(i / cols) * size, v0: (i % cols) * size });
  const commons = { ...place(middle), size, commons: true, name: 'The great tree', id: 'commons' };
  let cell = 0;
  cards.forEach(({ m, side, things: own }) => {
    if (cell === middle) cell++;
    const { u0, v0 } = place(cell++), off = (size - side) / 2;
    plots.push({ u0, v0, size, name: m.name, id: m.id });
    own.forEach((t, k) => things.push({ ...t, id: `${m.id}-${k}`, owner: m.id, u: u0 + off + t.u, v: v0 + off + t.v }));
  });
  const tree = { u: commons.u0 + size / 2, v: commons.v0 + size / 2 };
  if (fire) things.push({ id: 'campfire', species: 'campfire', size: 2, u: tree.u + 1.3, v: tree.v + 1.3, label: 'The campfire' });
  const all = [...plots, commons];
  return { plots: all, things, tree, commons, dims: sanctuarySide(all, tree) };
}

const TREE_STAGES = ['A seed in the ground', 'A sprout', 'A sapling', 'A young tree', 'A great tree', 'In full bloom'];
export const treeStageName = stage => TREE_STAGES[Math.max(0, Math.min(5, stage | 0))];

/** The great tree at one of its six stages, from a seed to full bloom. */
export function greatTreeSVG(stage = 0) {
  stage = Math.max(0, Math.min(5, stage | 0));
  const base = 224, cx = 100, BARK = '#7c5436', DARK = tone(BARK, -0.25), LIGHT = tone(BARK, 0.16);
  const ground = rx => E(cx, base + 2, rx, rx * 0.17, '#1f2240', ' opacity=".16"');
  if (stage === 0) {
    // A mound of fresh earth with a seedling just through it.
    return `<svg viewBox="0 0 200 240" aria-hidden="true">${ground(30)}${E(cx, base - 1, 24, 7, '#8f6440')}${E(cx - 4, base - 3, 12, 3.5, '#a77950')}
${L(`M${cx} ${base - 4}c0-6 1-10 4-13`, '#4f9a54', 2.6)}${P(`M${cx + 4} ${base - 17}c-7-1-11-5-12-10 7 0 11 4 12 10Z`, '#6fbf5a')}${P(`M${cx + 4} ${base - 17}c6-3 9-8 9-13-6 1-9 6-9 13Z`, '#5cae4c')}</svg>`;
  }
  // From a sapling on, everything scales with k: a wider stance, a taller trunk and a broader crown.
  const k = [0, 0.3, 0.5, 0.7, 0.88, 1][stage];
  const girth = stage === 1 ? 5 : 7 + 40 * k, top = base - (34 + 86 * k), wide = 52 + 132 * k, high = wide * 0.6;
  const crownY = top - high * 0.28;

  // The trunk flares at the foot, and separate roots snake out over the ground from the flare.
  const half = girth / 2, waist = half * 0.6, flare = stage >= 2 ? half * (1.25 + 0.35 * k) : half, SHADE = tone(BARK, -0.16);
  // Each root drops steeply off the flare, then runs low along the ground and tapers to a point.
  const root = (side, len, thick, down = 0) => {
    const x0 = cx + side * half * 0.5, tip = cx + side * (flare + len), mid = cx + side * (flare + len * 0.35);
    return P(`M${n(x0)} ${n(base - thick * 1.8)}C${n(x0 + side * len * 0.3)} ${n(base - thick * 1.1)} ${n(x0 + side * len * 0.45)} ${n(base - thick * 0.7)} ${n(mid)} ${n(base - thick * 0.62)}`
      + `S${n(tip - side * len * 0.18)} ${n(base - thick * 0.2 + down * 0.5)} ${n(tip)} ${n(base + 1 + down)}Q${n(cx + side * (flare + len * 0.45))} ${n(base + 2.4 + down * 0.5)} ${n(x0 - side * 2)} ${n(base + 2)}Z`, side > 0 ? SHADE : BARK)
      + (side < 0 ? L(`M${n(x0 - 1.5)} ${n(base - thick * 1.5)}C${n(x0 - len * 0.18)} ${n(base - thick * 0.8)} ${n(x0 - len * 0.3)} ${n(base - thick * 0.62)} ${n(mid + len * 0.05)} ${n(base - thick * 0.52)}`, LIGHT, n(0.6 + 0.6 * k), ' opacity=".55"') : '');
  };
  const roots = stage < 2 ? '' : root(-1, 14 + 32 * k, 4 + 6 * k) + root(1, 16 + 34 * k, 4 + 6 * k)
    + root(-1, 6 + 14 * k, 2.6 + 3.4 * k, 3) + root(1, 7 + 15 * k, 2.6 + 3.4 * k, 3);

  const foot = base - 30 - 30 * k;
  const trunk = P(`M${n(cx - flare)} ${n(base + 1)}C${n(cx - half * 0.8)} ${n(base - 4)} ${n(cx - waist)} ${n(base - 18 - 22 * k)} ${n(cx - waist)} ${n(foot)}`
      + `C${n(cx - waist)} ${n(top + 30)} ${n(cx - waist * 0.9)} ${n(top + 10)} ${n(cx - waist * 0.8)} ${n(top)}H${n(cx + waist * 0.8)}`
      + `C${n(cx + waist * 0.9)} ${n(top + 10)} ${n(cx + waist)} ${n(top + 30)} ${n(cx + waist)} ${n(foot)}C${n(cx + waist)} ${n(base - 18 - 22 * k)} ${n(cx + half * 0.8)} ${n(base - 4)} ${n(cx + flare)} ${n(base + 1)}Z`, BARK)
    + P(`M${n(cx + waist * 0.2)} ${n(base + 1)}C${n(cx + waist * 0.25)} ${n(base - 30)} ${n(cx + waist * 0.3)} ${n(top + 18)} ${n(cx + waist * 0.32)} ${n(top)}H${n(cx + waist * 0.8)}`
      + `C${n(cx + waist * 0.9)} ${n(top + 10)} ${n(cx + waist)} ${n(top + 30)} ${n(cx + waist)} ${n(foot)}C${n(cx + waist)} ${n(base - 18 - 22 * k)} ${n(cx + half * 0.8)} ${n(base - 4)} ${n(cx + flare)} ${n(base + 1)}Z`, DARK, ' opacity=".5"')
    + (stage >= 3 ? L(`M${n(cx - waist * 0.5)} ${n(base - 10)}c2 -${n(30 * k)} -2 -${n(55 * k)} 1 -${n(80 * k)}`, DARK, n(1 + k), ' opacity=".45"')
      + L(`M${n(cx - waist * 0.05)} ${n(base - 16)}c-2 -${n(24 * k)} 2 -${n(40 * k)} 0 -${n(62 * k)}`, LIGHT, n(0.8 + k * 0.8), ' opacity=".5"') : '')
    + (stage >= 4 ? E(cx - waist * 0.25, base - 50 * k, 3.8 * k, 5.4 * k, DARK) + E(cx - waist * 0.25, base - 50 * k + 0.8, 2.6 * k, 4 * k, '#3a2618') : '');
  const bough = (dx, dy, w) => L(`M${n(cx + dx * 0.15)} ${n(top + 8)}Q${n(cx + dx * 0.55)} ${n(top - dy * 0.3)} ${n(cx + dx)} ${n(top - dy)}`, BARK, n(w));
  const boughs = stage < 2 ? '' : bough(-wide * 0.3, high * 0.36, girth * 0.3) + bough(wide * 0.28, high * 0.4, girth * 0.28) + bough(-wide * 0.06, high * 0.6, girth * 0.24) + bough(wide * 0.12, high * 0.62, girth * 0.2);

  // The crown in three layers, back to front, each shaded below and lit above.
  const layer = (blobs, fill) => {
    const at = ([x, y, r]) => [cx + x * wide / 2, crownY + y * high / 2, r * wide / 2];
    const list = blobs.map(at);
    return list.map(([x, y, r]) => C(x + r * 0.08, y + r * 0.14, r, tone(fill, -0.18))).join('') + list.map(([x, y, r]) => C(x, y, r, fill)).join('')
      + list.filter((_, i) => i % 2 === 0).map(([x, y, r]) => C(x - r * 0.28, y - r * 0.34, r * 0.42, tone(fill, 0.2), ' opacity=".6"')).join('');
  };
  const BACK = [[-0.62, 0.12, 0.34], [0.62, 0.12, 0.34], [-0.36, -0.42, 0.36], [0.36, -0.42, 0.36], [0, -0.66, 0.36], [-0.9, 0.42, 0.22], [0.9, 0.42, 0.22]];
  const MID = [[-0.5, 0.22, 0.3], [0.5, 0.22, 0.3], [-0.2, -0.24, 0.34], [0.22, -0.26, 0.33], [0, 0.18, 0.32], [-0.8, 0.06, 0.22], [0.8, 0.06, 0.22]];
  const FRONT = [[-0.3, 0.46, 0.24], [0.32, 0.46, 0.24], [0, -0.02, 0.26], [-0.62, 0.46, 0.18], [0.64, 0.44, 0.18]];
  const count = stage === 1 ? 0 : stage === 2 ? 4 : stage === 3 ? 6 : 7;
  const crown = stage === 1
    ? P(`M${cx} ${n(top + 16)}c-17 -2 -27 -12 -29 -24 16 0 27 9 29 24Z`, '#6fbf5a') + P(`M${cx} ${n(top + 8)}c16 -5 23 -16 24 -29 -15 2 -23 12 -24 29Z`, '#5cae4c') + P(`M${cx} ${n(top + 3)}c-4 -10 -1 -17 4 -22 4 7 1 15 -4 22Z`, '#7ccb63')
    : layer(BACK.slice(0, count), '#3f8d4c') + layer(MID.slice(0, count), '#4f9f50') + (stage >= 3 ? layer(FRONT.slice(0, stage === 3 ? 3 : 5), '#62b357') : '');

  // In full bloom: blossom over the crown, a few petals drifting down, and lanterns in the boughs.
  const flower = (x, y, c) => [0, 72, 144, 216, 288].map(a => C(x + Math.cos(a * Math.PI / 180) * 2.2, y + Math.sin(a * Math.PI / 180) * 2.2, 2, c)).join('') + C(x, y, 1.3, '#ffd36a');
  const bloom = stage === 5 ? Array.from({ length: 26 }, (_, i) => { const a = i * 2.39996, r = Math.sqrt((i + 0.5) / 26) * 0.92; return flower(cx + Math.cos(a) * r * wide * 0.46, crownY + Math.sin(a) * r * high * 0.46, i % 3 ? '#f7b3cc' : '#fff1f5'); }).join('')
    + [[-0.55, 0.9], [0.4, 1.05], [0.75, 0.7], [-0.2, 1.2]].map(([x, y], i) => E(cx + x * wide / 2, crownY + y * high / 2 + 20, 2.4, 1.4, '#f7b3cc', ` transform="rotate(${i * 50 - 40} ${n(cx + x * wide / 2)} ${n(crownY + y * high / 2 + 20)})"`)).join('') : '';
  const lantern = (x, y, len) => L(`M${n(x)} ${n(y)}v${len}`, '#5a4030', 0.8) + P(`M${n(x - 3.2)} ${n(y + len + 1)}h6.4l-1 7.5h-4.4Z`, '#ffcf5a') + P(`M${n(x - 3.6)} ${n(y + len)}h7.2v1.4h-7.2Z`, '#7a4a2a');
  const lanterns = stage === 5 ? `<g class="lanterns">${lantern(cx - wide * 0.3, top - high * 0.2, 10)}${lantern(cx + wide * 0.27, top - high * 0.22, 14)}${lantern(cx - wide * 0.05, top - high * 0.06, 8)}</g>` : '';
  // Small things that gather round an old tree: mushrooms and flowers between the roots.
  const shroom = (x, s) => P(`M${n(x - 1.2 * s)} ${base}v-${n(4 * s)}h${n(2.4 * s)}v${n(4 * s)}Z`, '#f3e6d4') + P(`M${n(x - 4 * s)} ${n(base - 4 * s)}a${n(4 * s)} ${n(3 * s)} 0 0 1 ${n(8 * s)} 0Z`, '#d9534f') + C(x - s, base - 5.6 * s, 0.7 * s, '#fff');
  const undergrowth = stage >= 4 ? shroom(cx - girth * 0.9 - 6, 1) + shroom(cx + girth * 1.1 + 4, 1.2) + (stage === 5 ? shroom(cx + girth * 0.5 + 22, 0.8) : '') : '';
  return `<svg viewBox="0 0 200 240" aria-hidden="true">${ground(26 + 70 * k)}${boughs}${trunk}${roots}<g class="crown">${crown}${bloom}</g>${lanterns}${undergrowth}</svg>`;
}

/** Everything standing in a store's haven, as things for worldHTML and the simulation. */
export function thingsFromStore(store) {
  return Object.entries(store.state.haven.spots).map(([id, [u, v]]) => {
    const item = store.item(id);
    return item ? { id, species: item.s, art: artOf(item.s, item.breed), size: item.z, u, v, label: store.nameOf(item) } : null;
  }).filter(Boolean);
}
/** A friend's public card as things. Anything malformed is skipped. Older cards gave tile rows and columns. */
export function thingsFromCard(card) {
  const side = Math.min(10, Math.max(5, Number(card?.side) || 5));
  const whole = (Array.isArray(card?.tiles) ? card.tiles : []).every(t => Array.isArray(t) && Number.isInteger(t[0]) && Number.isInteger(t[1]));
  const things = (Array.isArray(card?.tiles) ? card.tiles : []).slice(0, 100)
    .filter(t => Array.isArray(t) && Number.isFinite(t[0]) && Number.isFinite(t[1]) && t[0] >= 0 && t[1] >= 0 && t[0] <= side && t[1] <= side && speciesById(t[2]))
    .map(([u, v, species, size, breed, item, fed]) => ({
      species: speciesById(species).id, art: artOf(species, typeof breed === 'string' ? breed : null), size: [1, 2, 3].includes(size) ? size : 2,
      u: whole ? Math.min(side - 0.4, u + 0.5) : u, v: whole ? Math.min(side - 0.4, v + 0.5) : v,
      // Since 1.5 a card also says which of its owner's things each one is, and when an animal last ate.
      ...(typeof item === 'string' && /^[\w-]{1,40}$/.test(item) ? { item } : {}), ...(Number.isFinite(fed) ? { fed } : {}),
    }));
  return { side, things };
}
