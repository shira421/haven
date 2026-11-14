// The two pictures Haven draws: the sky a session passes under, and the island a haven stands on.
// Both are SVG text built from data, so they can be drawn for you, for a friend, or for a test.
import { traitsOf } from './world.js';
import { drawing, tone } from './art.js';
import { speciesById } from './catalog.js';
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
const BUILD = { pond: 1.7, tallgrass: 0.85, stump: 0.85,
  bear: 1.1, panda: 1.05, deer: 1, seal: 0.95, capybara: 0.9, fox: 0.85, otter: 0.85, shiba: 0.8, redpanda: 0.8, raccoon: 0.78, cat: 0.72, penguin: 0.7, fennec: 0.68, turtle: 0.66, rabbit: 0.62, duck: 0.62, squirrel: 0.6, parrot: 0.68, owl: 0.64, lizard: 0.6, hedgehog: 0.58, frog: 0.5, robin: 0.5, snail: 0.42, butterfly: 0.4, ladybug: 0.32, bee: 0.32 };
const GRASS = ['#8fce6e', '#8aca69'], EDGE = '#74b85a', SOIL = '#9a6f4c';

/** The box the land is drawn in, in drawing units: [x, y, width, height]. */
export function landBox(side) {
  return [-(side * W) / 2 - PAD, -HEADROOM, side * W + PAD * 2, side * H + DEPTH + HEADROOM + PAD + 8];
}
/**
 * Where a point on the land is in the picture, as percentages of its box.
 * (u, v) run from 0 to `side` along the two edges of the land; `lift` raises it off the ground.
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
export function widthOf(side, species, size = 2) {
  return ((W * 0.94 * (SCALE[size] || SCALE[2]) * (BUILD[species] || 1)) / landBox(side)[2]) * 100;
}

/** How many drawing units one tile of height is for a thing: what turns an animal's lift into a move of its drawing. */
export function liftScale(species, size = 2) {
  return (H * 100) / (W * 0.94 * (SCALE[size] || SCALE[2]) * (BUILD[species] || 1));
}

/** One plant, animal or nature item standing on the land. */
function entity(side, t, interactive) {
  const s = speciesById(t.species), at = project(side, t.u, t.v);
  const delay = ((Math.round(t.u * 7) + Math.round(t.v * 13)) % 10) * -0.4;
  const tag = interactive && t.id ? 'button' : 'span';
  const label = interactive && t.id ? ` data-action="ent" data-ent="${t.id}" aria-label="${escapeHTML(t.label || s.name)}"` : '';
  const growing = t.stage !== undefined && t.stage < 3;
  const trait = s.kind === 'animal' ? traitsOf(s.id) : null;
  const rig = trait ? `;--gait:${trait.gait || 0.5}s;--sink:${trait.sink || 14};--k:${liftScale(s.id, t.size).toFixed(1)}` : '';
  return `<${tag} class="ent ${s.kind}${trait ? ' m-' + trait.move : ''}${t.withered ? ' withered' : ''}${growing ? ' growing' : ''}${t.cls ? ' ' + t.cls : ''}"${label}${t.stage !== undefined ? ` data-stage="${t.stage}"` : ''} data-species="${s.id}" style="left:${at.left.toFixed(2)}%;top:${at.top.toFixed(2)}%;width:${widthOf(side, s.id, t.size).toFixed(2)}%;z-index:${at.depth};--delay:${delay}s${rig}"><svg class="sprite" viewBox="0 0 100 100" aria-hidden="true"><g class="alive">${drawing(t.species, { kind: s.kind, stage: t.stage ?? 3, withered: t.withered })}</g></svg>${s.kind === 'animal' ? '<i class="emote" aria-hidden="true"></i>' : ''}</${tag}>`;
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

/** Everything standing in a store's haven, as things for worldHTML and the simulation. */
export function thingsFromStore(store) {
  return Object.entries(store.state.haven.spots).map(([id, [u, v]]) => {
    const item = store.item(id);
    return item ? { id, species: item.s, size: item.z, u, v, label: store.nameOf(item) } : null;
  }).filter(Boolean);
}
/** A friend's public card as things. Anything malformed is skipped. Older cards gave tile rows and columns. */
export function thingsFromCard(card) {
  const side = Math.min(10, Math.max(5, Number(card?.side) || 5));
  const whole = (Array.isArray(card?.tiles) ? card.tiles : []).every(t => Array.isArray(t) && Number.isInteger(t[0]) && Number.isInteger(t[1]));
  const things = (Array.isArray(card?.tiles) ? card.tiles : []).slice(0, 100)
    .filter(t => Array.isArray(t) && Number.isFinite(t[0]) && Number.isFinite(t[1]) && t[0] >= 0 && t[1] >= 0 && t[0] <= side && t[1] <= side && speciesById(t[2]))
    .map(([u, v, species, size]) => ({ species, size: [1, 2, 3].includes(size) ? size : 2, u: whole ? Math.min(side - 0.4, u + 0.5) : u, v: whole ? Math.min(side - 0.4, v + 0.5) : v }));
  return { side, things };
}
