// The two pictures Haven draws: the sky a session passes under, and the island a haven stands on.
// Both are SVG text built from data, so they can be drawn for you, for a friend, or for a test.
import { drawing, tone } from './art.js';
import { speciesById } from './catalog.js';

// ——— Sky ———

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, k) => { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join(''); };

// A session is a day: it starts at sunrise and ends at sunset.
const DAY = [
  [0, '#f4a184', '#fddfc0'],
  [0.16, '#8cc3ef', '#dbeefb'],
  [0.5, '#5fb0ee', '#cbe9fc'],
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

// ——— Island ———

const W = 100, H = 50, DEPTH = 26;
const SCALE = { 1: 0.8, 2: 0.98, 3: 1.18 };
const GRASS = ['#8fce6e', '#86c766'], EDGE = '#74b85a';

/**
 * A haven as an isometric island.
 * @param {object} o
 * @param {number} o.side tiles along each edge
 * @param {{r:number,c:number,species:string,size?:number,stage?:number,withered?:boolean,id?:string}[]} o.tiles what stands where
 * @param {boolean} [o.interactive] tiles become buttons (data-action="tile")
 * @param {string|null} [o.selected] "r,c" of the tile to mark
 * @param {string} [o.label] what a screen reader calls the picture
 */
export function islandSVG({ side, tiles = [], interactive = false, selected = null, label = '', cls = '' }) {
  const half = (side * W) / 2, mid = ((side - 1) * H) / 2, top = -H / 2, bottom = side * H - H / 2;
  const headroom = 96, pad = 6;
  const vb = [-half - pad, top - headroom, side * W + pad * 2, side * H + DEPTH + headroom + pad + 8];
  const cx = (r, c) => ((c - r) * W) / 2, cy = (r, c) => ((c + r) * H) / 2;
  const diamond = (x, y) => `${x} ${y - H / 2} ${x + W / 2} ${y} ${x} ${y + H / 2} ${x - W / 2} ${y}`;
  const occupied = new Map(tiles.map(t => [`${t.r},${t.c}`, t]));
  let ground = '';
  for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) {
    const key = `${r},${c}`, t = occupied.get(key);
    const poly = `<polygon points="${diamond(cx(r, c), cy(r, c))}" fill="${GRASS[(r + c) % 2]}"${key === selected ? ' class="picked"' : ''}/>`;
    if (!interactive) { ground += poly; continue; }
    const name = t ? speciesById(t.species)?.name || 'Something' : 'Empty';
    ground += `<g class="tile" role="button" tabindex="0" data-action="tile" data-r="${r}" data-c="${c}" aria-label="Row ${r + 1}, column ${c + 1}: ${name}"${key === selected ? ' aria-pressed="true"' : ''}>${poly}</g>`;
  }
  const order = [...tiles].filter(t => t.r < side && t.c < side && speciesById(t.species)).sort((a, b) => a.r + a.c - (b.r + b.c) || a.c - b.c);
  const things = order.map(t => {
    const s = speciesById(t.species), w = W * 0.94 * (SCALE[t.size] || SCALE[2]);
    const x = cx(t.r, t.c) - w / 2, y = cy(t.r, t.c) - w * 0.9 + 2;
    const delay = ((t.r * 7 + t.c * 13) % 10) * -0.4;
    return `<svg class="thing ${s.kind}${t.withered ? ' withered' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${w.toFixed(1)}" viewBox="0 0 100 100" overflow="visible" style="--delay:${delay}s"><g class="alive">${drawing(t.species, { kind: s.kind, stage: t.stage ?? 3, withered: t.withered })}</g></svg>`;
  }).join('');
  const soil = '#9a6f4c';
  return `<svg class="island${cls ? ' ' + cls : ''}" viewBox="${vb.join(' ')}"${label ? ` role="group" aria-label="${label}"` : ' aria-hidden="true"'}>
<polygon points="${-half} ${mid} 0 ${bottom} 0 ${bottom + DEPTH} ${-half} ${mid + DEPTH}" fill="${soil}"/>
<polygon points="${half} ${mid} 0 ${bottom} 0 ${bottom + DEPTH} ${half} ${mid + DEPTH}" fill="${tone(soil, -0.2)}"/>
<polygon points="${-half} ${mid} 0 ${bottom} 0 ${bottom + 6} ${-half} ${mid + 6}" fill="${EDGE}"/>
<polygon points="${half} ${mid} 0 ${bottom} 0 ${bottom + 6} ${half} ${mid + 6}" fill="${tone(EDGE, -0.14)}"/>
<g class="ground">${ground}</g><g class="things">${things}</g></svg>`;
}

/** Turn a store's haven into island tiles. */
export function tilesFromStore(store) {
  return Object.entries(store.state.haven.tiles).map(([key, id]) => {
    const item = store.item(id), [r, c] = key.split(',').map(Number);
    return item ? { r, c, species: item.s, size: item.z, id } : null;
  }).filter(Boolean);
}
/** Turn a friend's public card into island tiles. Anything malformed is skipped. */
export function tilesFromCard(card) {
  const side = Math.min(10, Math.max(5, Number(card?.side) || 5));
  const tiles = (Array.isArray(card?.tiles) ? card.tiles : []).slice(0, 100)
    .filter(t => Array.isArray(t) && Number.isInteger(t[0]) && Number.isInteger(t[1]) && t[0] >= 0 && t[1] >= 0 && t[0] < side && t[1] < side && speciesById(t[2]))
    .map(([r, c, species, size]) => ({ r, c, species, size: [1, 2, 3].includes(size) ? size : 2 }));
  return { side, tiles };
}
