// Original drawings of every plant and animal, as SVG built from simple shapes.
// Each is drawn in a 100 × 100 box and stands on the ground at y = 90, centred on x = 50.
// Nothing here touches the DOM: the functions return SVG text, so the same art is used by
// the app, the icon script and the tests.

// ——— Shape helpers ———

const n = v => Math.round(v * 100) / 100;
/** Mix a hex colour with white (k > 0) or black (k < 0). */
export function tone(hex, k) {
  const v = parseInt(hex.slice(1), 16);
  const target = k > 0 ? 255 : 0, a = Math.abs(k);
  const ch = s => Math.round(((v >> s) & 255) * (1 - a) + target * a);
  return '#' + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('');
}
const E = (cx, cy, rx, ry, fill, extra = '') => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}"${extra}/>`;
const C = (cx, cy, r, fill, extra = '') => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}"${extra}/>`;
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const L = (d, stroke, width, extra = '', cap = 'round') => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="${cap}" stroke-linejoin="round"${extra}/>`;
const G = (content, transform) => `<g transform="${transform}">${content}</g>`;
const rot = (content, deg, x, y) => G(content, `rotate(${deg} ${x} ${y})`);
const mirror = content => content + G(content, 'translate(100 0) scale(-1 1)');
const shadow = (rx = 20, cx = 50) => E(cx, 91, rx, rx * 0.2, '#1f2240', ' opacity=".14"');
const INK = '#2a2740';

/** A leaf growing from (x, y), `len` long, pointing up before it is turned by `deg`. */
function leaf(x, y, len, w, deg, fill, vein = false) {
  const d = `M0 0C${n(w)} ${n(-len * 0.25)} ${n(w)} ${n(-len * 0.75)} 0 ${n(-len)}C${n(-w)} ${n(-len * 0.75)} ${n(-w)} ${n(-len * 0.25)} 0 0Z`;
  return G(P(d, fill) + (vein ? L(`M0 ${n(-len * 0.1)}V${n(-len * 0.85)}`, tone(fill, -0.18), 0.8) : ''), `translate(${n(x)} ${n(y)}) rotate(${deg})`);
}
/** Foliage as a cluster of circles with a shaded underside and a lit top. */
function canopy(blobs, fill) {
  const dark = tone(fill, -0.2), light = tone(fill, 0.22);
  return blobs.map(([x, y, r]) => C(x + 1.5, y + 2.5, r, dark)).join('') + blobs.map(([x, y, r]) => C(x, y, r, fill)).join('')
    + blobs.filter((_, i) => i % 2 === 0).map(([x, y, r]) => C(x - r * 0.3, y - r * 0.35, r * 0.4, light, ' opacity=".7"')).join('');
}
function trunk(x, top, w, fill, base = 90) {
  const d = `M${n(x - w)} ${base}C${n(x - w * 0.55)} ${n(base - 10)} ${n(x - w * 0.5)} ${n(top + 8)} ${n(x - w * 0.42)} ${top}H${n(x + w * 0.42)}C${n(x + w * 0.5)} ${n(top + 8)} ${n(x + w * 0.55)} ${n(base - 10)} ${n(x + w)} ${base}Z`;
  const side = `M${n(x + w * 0.1)} ${base}C${n(x + w * 0.1)} ${n(base - 12)} ${n(x + w * 0.05)} ${n(top + 8)} ${n(x + w * 0.05)} ${top}H${n(x + w * 0.42)}C${n(x + w * 0.5)} ${n(top + 8)} ${n(x + w * 0.55)} ${n(base - 10)} ${n(x + w)} ${base}Z`;
  return P(d, fill) + P(side, tone(fill, -0.18));
}
const stem = (x, y, top, colour = '#4f9a54', bend = 0, w = 1.8) => L(`M${n(x)} ${n(y)}Q${n(x + bend)} ${n((y + top) / 2)} ${n(x + bend * 0.6)} ${n(top)}`, colour, w);
function petals(cx, cy, count, rx, ry, dist, fill, offset = 0) {
  let out = '';
  for (let i = 0; i < count; i++) out += rot(E(cx, cy - dist, rx, ry, fill), offset + (360 / count) * i, cx, cy);
  return out;
}
const water = (rx = 34, ry = 9) => E(50, 87, rx, ry, '#7fc4dc') + E(50, 86.2, rx * 0.86, ry * 0.72, '#a5dbea') + L(`M${n(50 - rx * 0.5)} 87q4 -1.6 8 0`, '#e3f5fa', 1) + L(`M${n(50 + rx * 0.2)} 89.5q4 -1.6 8 0`, '#e3f5fa', 1);

// ——— Plants ———

const GREEN = '#58a85c', DEEP = '#3d8750', LIME = '#8cc665', BARK = '#8a5a3c';

const plants = {
  clover() {
    const trefoil = (x, y, s, c) => G([0, 120, 240].map(a => rot(P('M0 0C-5 -3 -6 -9 -2.5 -10.5C-1 -11 0 -10 0 -9C0 -10 1 -11 2.5 -10.5C6 -9 5 -3 0 0Z', c), a, 0, 0)).join('') + C(0, 0, 0.9, tone(c, 0.3)), `translate(${x} ${y}) scale(${s})`);
    return shadow(18) + stem(42, 90, 68, DEEP, -5) + stem(50, 90, 58, DEEP, 1) + stem(58, 90, 70, DEEP, 6) + stem(47, 90, 78, DEEP, -2)
      + trefoil(39, 67, 1.05, LIME) + trefoil(62, 69, 1, GREEN) + trefoil(46, 78, 0.8, GREEN) + trefoil(50.5, 57, 1.25, '#6dba60')
      + C(57, 81, 3.2, '#f6eef5') + C(57, 81, 1.4, '#e9c8de');
  },
  fern() {
    const frond = (deg, len, c) => G(L(`M0 0Q${n(len * 0.18)} ${n(-len * 0.6)} 0 ${-len}`, tone(c, -0.2), 1.3)
      + Array.from({ length: 7 }, (_, i) => { const t = (i + 1) / 8, y = -len * t, x = len * 0.18 * 4 * t * (1 - t) * 0.6, s = (1 - t * 0.75) * len * 0.26; return leaf(x, y, s, s * 0.28, 62, c) + leaf(x, y, s, s * 0.28, -62, c); }).join(''), `translate(50 90) rotate(${deg})`);
    return shadow(22) + frond(-58, 34, DEEP) + frond(58, 34, DEEP) + frond(-30, 44, GREEN) + frond(30, 44, GREEN) + frond(0, 52, '#69b866')
      + L('M44 90q-1 -9 3 -11a2.6 2.6 0 1 1 1 5', '#69b866', 1.6);
  },
  daisy() {
    const flower = (x, y, s) => G(petals(0, 0, 12, 2.4, 5.6, 6, '#fffdf7') + C(0, 0, 4, '#f4b730') + C(-1, -1, 1.6, '#f9d264'), `translate(${x} ${y}) scale(${s})`);
    return shadow(19) + stem(50, 90, 44, DEEP, -2) + stem(40, 90, 60, DEEP, -4) + stem(61, 90, 56, DEEP, 5)
      + leaf(50, 88, 16, 4, -55, GREEN) + leaf(50, 88, 15, 4, 52, GREEN) + leaf(49, 74, 10, 3, 60, LIME)
      + flower(37.5, 58, 0.82) + flower(64, 54, 0.88) + flower(48.8, 40, 1.15);
  },
  tulip() {
    const cup = (x, y, c) => G(P('M-7 0C-8 -8 -5 -13 -4 -15C-2 -12 -1 -11 0 -15C1 -11 2 -12 4 -15C5 -13 8 -8 7 0C5 4 -5 4 -7 0Z', c) + P('M0 -15C1 -11 2 -12 4 -15C5 -13 8 -8 7 0C6 2 3 3 1 3C3 -3 2 -9 0 -15Z', tone(c, -0.14)), `translate(${x} ${y})`);
    return shadow(19) + stem(50, 90, 46, DEEP, 0, 2.2) + stem(36, 90, 58, DEEP, -2, 2.2) + stem(64, 90, 60, DEEP, 2, 2.2)
      + leaf(46, 90, 36, 5, -16, GREEN, true) + leaf(54, 90, 34, 5, 18, '#69b866', true) + leaf(40, 90, 22, 4, -38, GREEN) + leaf(60, 90, 22, 4, 36, GREEN)
      + cup(35, 58, '#f2a33a') + cup(65.2, 60, '#e0567a') + cup(50, 46, '#e3423f');
  },
  cattail() {
    const reed = (x, top, bend) => stem(x, 90, top, '#7a9a4c', bend, 1.7) + rot(E(x + bend * 0.6, top + 9, 2.9, 9, '#7b4b2a') + E(x + bend * 0.6 - 0.8, top + 8, 0.9, 6.5, '#9a6a44'), bend * 1.2, x + bend * 0.6, top + 9) + L(`M${n(x + bend * 0.6)} ${top}v-6`, '#b9a36a', 1);
    return water(30, 7) + leaf(44, 88, 46, 3, -12, '#6f9f4f') + leaf(56, 88, 52, 3, 10, '#7fae55') + leaf(50, 88, 40, 3, 24, '#6f9f4f') + leaf(48, 88, 34, 3, -30, '#7fae55')
      + reed(42, 26, -3) + reed(57, 34, 4) + reed(50, 16, 0);
  },
  toadstool() {
    const shroom = (x, y, s) => G(P('M-5 0C-5 -6 -4 -10 -3.5 -14H3.5C4 -10 5 -6 5 0C3 2 -3 2 -5 0Z', '#f6ecd9') + P('M1 -14H3.5C4 -10 5 -6 5 0C4 1 3 1.4 1.5 1.6C2.5 -4 2 -9 1 -14Z', '#e4d3b6')
      + P('M-17 -13C-17 -28 -8 -34 0 -34C8 -34 17 -28 17 -13C10 -10 -10 -10 -17 -13Z', '#d9453c') + P('M4 -34C10 -33 17 -27 17 -13C13 -11.5 9 -11 5 -10.8C9 -18 9 -27 4 -34Z', '#bf3832')
      + E(0, -13, 17, 2.6, '#f1e3cb') + C(-7, -24, 3, '#fff8ef') + C(4, -28, 2.2, '#fff8ef') + C(9, -19, 2.6, '#fff8ef') + C(-12, -16.5, 1.7, '#fff8ef') + C(-1, -18, 1.6, '#fff8ef'), `translate(${x} ${y}) scale(${s})`);
    return shadow(22) + leaf(30, 90, 10, 2, -30, GREEN) + leaf(72, 90, 12, 2.4, 24, GREEN) + shroom(66, 90, 0.62) + shroom(44, 90, 1.25);
  },
  poppy() {
    const bloom = (x, y, s) => G(petals(0, 0, 4, 7, 7.5, 5.5, '#e5473c', 45) + petals(0, 0, 4, 6, 6.5, 4, '#f0604d') + C(0, 0, 3.2, '#2f2a3a') + C(0, 0, 1.3, '#8c9a4b'), `translate(${x} ${y}) scale(${s})`);
    return shadow(18) + stem(50, 90, 40, '#6c9c55', -3, 1.5) + stem(38, 90, 58, '#6c9c55', -5, 1.5) + stem(62, 90, 52, '#6c9c55', 6, 1.5)
      + leaf(48, 90, 20, 4, -40, '#6fa55a') + leaf(52, 90, 18, 4, 44, '#6fa55a') + E(66, 46, 3, 4.5, '#6c9c55')
      + bloom(35, 55, 0.85) + bloom(48.2, 37, 1.15);
  },
  aloe() {
    const blade = (deg, len, c) => G(P(`M-5 0C-6 ${n(-len * 0.5)} -2 ${n(-len * 0.9)} 0 ${-len}C2 ${n(-len * 0.9)} 6 ${n(-len * 0.5)} 5 0Z`, c) + P(`M0 ${-len}C2 ${n(-len * 0.9)} 6 ${n(-len * 0.5)} 5 0H1C2 ${n(-len * 0.5)} 1 ${n(-len * 0.85)} 0 ${-len}Z`, tone(c, -0.14))
      + [0.25, 0.45, 0.65].map(t => C(-2, -len * t, 0.8, tone(c, 0.35))).join(''), `translate(50 90) rotate(${deg})`);
    return shadow(22) + blade(-62, 26, '#4e9c7c') + blade(62, 26, '#4e9c7c') + blade(-36, 36, '#5aab87') + blade(36, 36, '#5aab87') + blade(-12, 44, '#66b891') + blade(12, 42, '#5aab87') + blade(0, 30, '#74c49c');
  },
  lavender() {
    const spike = (x, top, bend) => stem(x, 90, top + 12, '#7d9e6a', bend, 1.3) + Array.from({ length: 7 }, (_, i) => E(x + bend * 0.6 + (i % 2 ? 1.4 : -1.4), top + 13 - i * 2.6, 2.3 - i * 0.14, 1.9, i % 3 === 0 ? '#9a7ad6' : '#8463c9')).join('');
    return shadow(21) + leaf(44, 90, 18, 2, -34, '#8fae7a') + leaf(56, 90, 18, 2, 34, '#8fae7a') + leaf(50, 90, 16, 2, 8, '#8fae7a')
      + spike(32, 44, -6) + spike(68, 46, 6) + spike(41, 32, -3) + spike(59, 34, 3) + spike(50, 24, 0);
  },
  blueberry() {
    const berry = (x, y) => C(x, y, 3.1, '#4c67c9') + C(x - 0.9, y - 0.9, 1, '#93a6ee') + C(x + 0.6, y + 0.4, 0.7, '#2f437f');
    return shadow(25) + L('M50 90V74M50 82L40 74M50 80L60 72', BARK, 2.2)
      + canopy([[34, 68, 11], [66, 68, 11], [50, 58, 14], [42, 74, 10], [58, 74, 10], [50, 72, 11]], '#4d9a5a')
      + berry(36, 66) + berry(47, 55) + berry(59, 62) + berry(66, 72) + berry(44, 75) + berry(54, 73) + berry(52, 64);
  },
  waterlily() {
    const pad = (x, y, rx, c) => P(`M${x} ${y}L${n(x + rx)} ${n(y - 1.4)}A${rx} ${n(rx * 0.34)} 0 1 0 ${n(x + rx * 0.92)} ${n(y + 1.5)}Z`, c) + L(`M${n(x - rx * 0.6)} ${n(y - 0.6)}L${x} ${y}`, tone(c, -0.15), 0.7);
    return water(40, 10.5) + pad(40, 85, 17, '#4f9f61') + pad(70, 88.5, 10, '#62b06c') + pad(26, 90, 8, '#62b06c')
      + G(petals(0, 0, 9, 3.4, 8.4, 7.4, '#f08db4') + petals(0, 0, 9, 3, 6.6, 5.2, '#f9bdd4', 20) + petals(0, 0, 6, 2.2, 4, 2.6, '#fde3ec', 8) + C(0, 0, 2.8, '#f6c445'), 'translate(42 76) scale(1 .66)');
  },
  sunflower() {
    return shadow(19) + L('M50 90C51 74 49 60 50 44', '#4c9150', 3) + leaf(50, 76, 20, 8, -68, GREEN, true) + leaf(50, 68, 20, 8, 66, '#69b866', true) + leaf(50, 84, 14, 6, 62, GREEN)
      + petals(50, 30, 16, 3.6, 8, 13.5, '#f5b82e', 11) + petals(50, 30, 16, 3.4, 7.5, 12, '#fbd24d') + C(50, 30, 10.5, '#7a4a25') + C(50, 30, 7, '#8f5a2e')
      + [[-3, -3], [3, -2], [0, 3], [-4, 2], [4, 3], [0, -5]].map(([x, y]) => C(50 + x, 30 + y, 0.8, '#5c3519')).join('');
  },
  pricklypear() {
    const padShape = (x, y, rx, ry, deg, c) => rot(E(x, y, rx, ry, c) + E(x + rx * 0.3, y, rx * 0.62, ry * 0.88, tone(c, -0.1), ' opacity=".55"') + [[-0.4, -0.4], [0.3, -0.2], [-0.1, 0.3], [0.4, 0.5], [-0.5, 0.2]].map(([a, b]) => C(x + rx * a, y + ry * b, 0.75, '#f3efc8')).join(''), deg, x, y);
    const fruit = (x, y, deg) => rot(E(x, y, 2.6, 3.8, '#d8477f') + C(x, y - 3.2, 1, '#f08fb3'), deg, x, y);
    return shadow(22) + padShape(50, 74, 13, 17, 0, '#5aa873') + padShape(34, 52, 9, 13, -28, '#66b47e') + padShape(63, 48, 10, 14, 22, '#66b47e') + padShape(50, 34, 7, 10, 4, '#72c089')
      + fruit(29, 39, -28) + fruit(68, 33, 22) + fruit(51, 22.5, 4) + fruit(40, 57, -70);
  },
  cactus() {
    const col = '#4f9d6e', dk = tone(col, -0.16);
    const body = P('M41 90V32C41 20 59 20 59 32V90Z', col) + P('M52 23C56 24 59 27 59 32V90H52Z', dk);
    const armL = P('M41 70H30C24 70 22 66 22 60V50C22 45 30 45 30 50V58C30 61 32 62 34 62H41Z', col) + P('M41 70H30C27 70 25 69 24 67H41Z', dk);
    const armR = P('M59 62H68C72 62 73 60 73 56V44C73 39 80 39 80 44V58C80 66 76 70 70 70H59Z', col) + P('M77 41C79 41.5 80 42.5 80 44V58C80 66 76 70 70 70H59V67H70C74 67 77 64 77 58Z', dk);
    const ribs = [45, 50, 55].map(x => L(`M${x} 28V88`, tone(col, 0.2), 0.8, ' opacity=".7"')).join('');
    return shadow(22) + armL + armR + body + ribs + petals(50, 22, 6, 2, 3.4, 3, '#f7c7da') + C(50, 22, 1.8, '#f4b730') + petals(26, 46, 5, 1.4, 2.4, 2, '#f7c7da') + C(26, 46, 1.2, '#f4b730');
  },
  birch() {
    const marks = [[48, 80, 4], [53, 70, 3], [48.5, 60, 3.5], [52, 50, 3], [49, 40, 2.6]].map(([x, y, w]) => L(`M${x} ${y}h${w}`, '#4a4654', 1.2)).join('');
    return shadow(22) + P('M46 90L47.5 30H52.5L54 90Z', '#f3f1ea') + P('M51 30H52.5L54 90H51.5Z', '#dcd9cf') + marks + L('M50 52L38 40M50 46L62 36', '#e7e4da', 1.8)
      + canopy([[36, 36, 11], [64, 34, 11], [50, 22, 14], [42, 28, 11], [60, 26, 11], [50, 38, 11]], '#9ccc5c');
  },
  monstera() {
    // A split leaf: slits cut into each side, and holes punched through near the midrib.
    const outline = 'M0 0C-9 -2 -16 -7 -18 -13L-8 -13L-19 -18C-19.5 -21 -18.5 -24 -17 -26.5L-7 -21L-13.5 -31C-10 -34.5 -5 -36 0 -34C5 -36 10 -34.5 13.5 -31L7 -21L17 -26.5C18.5 -24 19.5 -21 19 -18L8 -13L18 -13C16 -7 9 -2 0 0Z';
    const holes = [[-5, -9], [5, -15], [-4.5, -26], [5, -27]].map(([x, y]) => `M${x - 1.5} ${y}a1.5 2.3 0 1 0 3 0a1.5 2.3 0 1 0 -3 0Z`).join('');
    const big = (x, y, s, deg, c) => G(P(outline + holes, c, ' fill-rule="evenodd"') + L('M0 -2V-32', tone(c, -0.22), 1), `translate(${x} ${y}) rotate(${deg}) scale(${s})`);
    return shadow(22) + stem(50, 90, 62, '#3f8a56', -9, 2.2) + stem(50, 90, 58, '#3f8a56', 10, 2.2) + stem(50, 90, 48, '#3f8a56', 0, 2.2)
      + big(44, 64, 0.82, -58, '#3a8c59') + big(57, 60, 0.82, 56, '#3f9460') + big(50, 49, 1.05, 0, '#4aa46b');
  },
  bamboo() {
    const cane = (x, top, c) => P(`M${x - 3} 90V${top}H${x + 3}V90Z`, c) + P(`M${x + 0.8} 90V${top}H${x + 3}V90Z`, tone(c, -0.14)) + Array.from({ length: Math.floor((90 - top) / 13) }, (_, i) => L(`M${x - 3.4} ${n(top + 10 + i * 13)}h6.8`, tone(c, -0.3), 1.3)).join('');
    return shadow(22) + cane(38, 30, '#7fb857') + cane(62, 38, '#7fb857') + cane(50, 14, '#8cc665')
      + leaf(53, 26, 16, 3, 62, GREEN) + leaf(53, 26, 14, 3, 28, '#69b866') + leaf(35, 42, 15, 3, -64, GREEN) + leaf(35, 42, 12, 3, -30, '#69b866') + leaf(65, 50, 14, 3, 58, GREEN) + leaf(47, 40, 13, 3, -52, '#69b866');
  },
  pine() {
    const tier = (y, w, h, c) => P(`M50 ${y - h}L${50 + w} ${y}Q50 ${y + 5} ${50 - w} ${y}Z`, c) + P(`M50 ${y - h}L${50 + w} ${y}Q${50 + w * 0.6} ${y + 2.6} ${50 + w * 0.2} ${y + 3.4}Z`, tone(c, -0.16));
    return shadow(22) + trunk(50, 74, 4.5, BARK) + tier(80, 24, 24, '#2f7a57') + tier(64, 19, 22, '#378862') + tier(48, 14, 20, '#40966d') + tier(33, 9, 18, '#4aa478');
  },
  oak() {
    return shadow(26) + trunk(50, 50, 7.5, '#80573a') + L('M50 62L36 50M50 58L64 48', '#80573a', 3.2)
      + canopy([[30, 42, 14], [70, 42, 14], [50, 24, 17], [38, 30, 14], [62, 30, 14], [50, 46, 15], [24, 52, 8], [76, 52, 8]], '#4f9d56')
      + [[40, 52], [61, 55]].map(([x, y]) => E(x, y, 1.9, 2.6, '#b98349') + P(`M${x - 2.2} ${y - 1}a2.2 1.7 0 0 1 4.4 0Z`, '#6c4a2a')).join('');
  },
  palm() {
    // Fronds arch out from the crown and droop at the tip. `dir` −1 draws one to the left.
    const frond = (dir, deg, len, c) => G(P(`M0 0C${n(len * 0.3)} ${n(-len * 0.5)} ${n(len * 0.82)} ${n(-len * 0.4)} ${len} ${n(len * 0.22)}C${n(len * 0.72)} ${n(-len * 0.12)} ${n(len * 0.32)} ${n(-len * 0.14)} 0 0Z`, c)
      + L(`M0 0C${n(len * 0.3)} ${n(-len * 0.34)} ${n(len * 0.78)} ${n(-len * 0.3)} ${len} ${n(len * 0.22)}`, tone(c, -0.2), 0.9), `translate(52 31) scale(${dir} 1) rotate(${deg})`);
    const ring = Array.from({ length: 7 }, (_, i) => { const t = i / 7; return L(`M${n(44.5 + t * 4.5)} ${n(84 - t * 50)}h${n(8 - t * 2)}`, '#7a5433', 1.1); }).join('');
    return shadow(22) + P('M43 90C45 70 47 48 49 30H55C54 48 54 70 55 90Z', '#a67a4d') + P('M52.5 30H55C54 48 54 70 55 90H51C51.5 70 52 48 52.5 30Z', '#8e6540') + ring
      + frond(1, 14, 32, '#3c8f55') + frond(-1, 14, 32, '#3c8f55') + frond(1, -22, 31, '#4aa163') + frond(-1, -22, 31, '#4aa163') + frond(1, -56, 26, '#57b06f') + frond(-1, -56, 26, '#57b06f') + frond(1, -86, 20, '#66bd7c')
      + C(49, 34, 3.2, '#6a4526') + C(55, 35, 3.2, '#5a3a20');
  },
  maple() {
    const leafFall = (x, y, deg, c) => rot(P(`M${x} ${y}l1.6 -2.4l1.8 1l-.4 -2.4l2.2 .2l-1.4 -2l-1.8 .8l-.6 -2.6l-1.4 0l-.6 2.6l-1.8 -.8l-1.4 2l2.2 -.2l-.4 2.4l1.8 -1Z`, c), deg, x, y);
    return shadow(25) + trunk(50, 52, 6.5, '#74503a') + L('M50 62L38 52M50 58L62 50', '#74503a', 2.8)
      + canopy([[32, 42, 13], [68, 42, 13], [50, 24, 16], [39, 30, 13], [61, 30, 13], [50, 44, 14]], '#e0703a')
      + canopy([[40, 34, 6], [62, 40, 6], [52, 26, 5]], '#eda03c') + canopy([[30, 46, 5], [58, 22, 4.5]], '#c94f36')
      + leafFall(26, 76, 20, '#e0703a') + leafFall(72, 84, -30, '#eda03c');
  },
  willow() {
    const strand = (x, top, len, c) => L(`M${x} ${top}q${x < 50 ? -2.4 : 2.4} ${n(len / 2)} 0 ${len}`, c, 2.2);
    const strands = [[22, 42, 30], [28, 36, 40], [34, 32, 44], [40, 30, 38], [60, 30, 38], [66, 32, 44], [72, 36, 40], [78, 42, 30], [46, 30, 30], [54, 30, 30]];
    return shadow(27) + trunk(50, 44, 6.5, '#7b6248') + canopy([[32, 36, 13], [68, 36, 13], [50, 24, 16], [40, 28, 12], [60, 28, 12]], '#7fb463')
      + strands.map(([x, t, l], i) => strand(x, t, l, i % 2 ? '#8fc272' : '#6fa556')).join('');
  },
  pumpkin() {
    const o = '#ee8a2c';
    return shadow(26) + L('M62 62C74 56 80 62 82 70', '#4c9150', 1.6) + L('M82 70c3 1 4 4 1.5 5.5', '#4c9150', 1.2) + leaf(70, 60, 13, 7, 64, GREEN, true)
      + E(50, 72, 26, 18, tone(o, -0.14)) + E(36, 72, 12, 17, o) + E(64, 72, 12, 17, tone(o, -0.07)) + E(50, 72, 11, 18, tone(o, 0.1)) + E(46, 66, 3, 6, tone(o, 0.35), ' opacity=".6"')
      + P('M47 56C47 50 49 47 53 45L56 48C53 50 53 53 53 56Z', '#5f8a43') + P('M51.5 56C51.5 52 52.5 50 56 48L53 45C55 46 56 47 56 48C53.6 50 53 53 53 56Z', '#4a7435');
  },
  lotus() {
    const petal = (deg, len, w, c) => G(P(`M0 0C${-w} ${n(-len * 0.4)} ${n(-w * 0.6)} ${n(-len * 0.85)} 0 ${-len}C${n(w * 0.6)} ${n(-len * 0.85)} ${w} ${n(-len * 0.4)} 0 0Z`, c), `translate(50 74) rotate(${deg})`);
    return water(38, 10) + P('M26 86L41 84.6A15 5.2 0 1 0 39.8 87.5Z', '#4f9f61') + P('M72 88L61 86.9A11 4 0 1 1 62 89.6Z', '#62b06c') + L('M50 86V74', '#5c9f62', 2.2)
      + petal(-66, 20, 6, '#f08db4') + petal(66, 20, 6, '#f08db4') + petal(-40, 25, 6.5, '#f5a3c3') + petal(40, 25, 6.5, '#f5a3c3') + petal(-18, 29, 6.5, '#f9bdd4') + petal(18, 29, 6.5, '#f9bdd4') + petal(0, 31, 6.5, '#fcd5e3')
      + E(50, 70, 5, 3, '#f6c445') + [[-2, 0], [2, 0], [0, -1]].map(([x, y]) => C(50 + x, 69.5 + y, 0.7, '#c78f1c')).join('');
  },
  frostpine() {
    const tier = (y, w, h, c) => P(`M50 ${y - h}L${50 + w} ${y}Q50 ${y + 5} ${50 - w} ${y}Z`, c) + P(`M50 ${y - h}L${50 + w} ${y}Q${50 + w * 0.6} ${y + 2.6} ${50 + w * 0.2} ${y + 3.4}Z`, tone(c, -0.16))
      + P(`M50 ${y - h}L${n(50 + w * 0.62)} ${n(y - h * 0.38)}Q${n(50 + w * 0.36)} ${n(y - h * 0.3)} ${n(50 + w * 0.2)} ${n(y - h * 0.42)}Q50 ${n(y - h * 0.24)} ${n(50 - w * 0.22)} ${n(y - h * 0.42)}Q${n(50 - w * 0.4)} ${n(y - h * 0.3)} ${n(50 - w * 0.62)} ${n(y - h * 0.38)}Z`, '#fbfdff');
    return E(50, 90, 30, 5, '#eef4fa') + shadow(20) + trunk(50, 74, 4.5, '#7a5a48') + tier(80, 24, 24, '#2f6f62') + tier(64, 19, 22, '#377c6e') + tier(48, 14, 20, '#40897a') + tier(33, 9, 18, '#4a9787')
      + [[24, 30], [78, 22], [82, 52], [18, 58]].map(([x, y]) => C(x, y, 1.3, '#dfeaf5')).join('');
  },
  cherry() {
    const petal = (x, y) => E(x, y, 1.7, 1.1, '#f9bfd3', ` transform="rotate(${(x * 7) % 90} ${x} ${y})"`);
    return shadow(26) + P('M44 90C46 78 46 68 44 58L50 54L56 58C54 68 54 78 56 90Z', '#5d4037') + P('M51 55L56 58C54 68 54 78 56 90H51Z', '#4a3029') + L('M47 60L34 46M53 60L67 44', '#5d4037', 3)
      + canopy([[30, 40, 13], [70, 38, 13], [50, 22, 16], [39, 28, 13], [61, 26, 13], [50, 42, 13], [22, 50, 7], [78, 48, 7]], '#f5a9c4')
      + canopy([[42, 30, 5], [60, 36, 5], [32, 44, 4], [66, 26, 4]], '#fbd3e0')
      + petal(24, 70) + petal(74, 66) + petal(30, 84) + petal(68, 80) + petal(80, 86);
  },
  bonsai() {
    return shadow(24) + P('M28 78H72L68 90H32Z', '#4f6f8f') + P('M52 78H72L68 90H52Z', '#3f5a75') + P('M25 74H75V79H25Z', '#5f82a6') + E(50, 75, 22, 2.6, '#6b4c35')
      + L('M48 75C44 66 58 62 52 52C49 46 40 46 36 40', '#6d4a33', 5) + L('M53 58C60 56 66 52 68 46', '#6d4a33', 3.4)
      + canopy([[32, 36, 9], [42, 32, 8], [24, 40, 6]], '#3f8f5b') + canopy([[66, 42, 8], [75, 45, 6], [60, 40, 5]], '#4a9e66') + canopy([[52, 24, 8], [60, 22, 6], [45, 24, 5]], '#57ad72');
  },
};

// ——— Animals ———

const eye = (x, y, r = 2.5) => C(x, y, r, INK) + C(x - r * 0.32, y - r * 0.36, r * 0.36, '#fff');
const eyes = (dx = 8, y = 43, r = 2.5) => eye(50 - dx, y, r) + eye(50 + dx, y, r);
const sleepyEyes = (dx = 8, y = 43) => L(`M${50 - dx - 2.4} ${y}q2.4 2 4.8 0`, INK, 1.4) + L(`M${50 + dx - 2.4} ${y}q2.4 2 4.8 0`, INK, 1.4);
const blush = (dx = 13, y = 49) => C(50 - dx, y, 2.8, '#f48ea0', ' opacity=".4"') + C(50 + dx, y, 2.8, '#f48ea0', ' opacity=".4"');
const smile = (y = 50.5, w = 5) => L(`M50 ${y}q${-w / 2} 3 ${-w} .8M50 ${y}q${w / 2} 3 ${w} .8`, INK, 1.1);

/**
 * A sitting, front-facing animal. Colours and features come from `o`; anything unusual is added
 * through `behind` (drawn first), `mid` (over the body) and `front` (over the face).
 */
function mammal(o) {
  const fur = o.fur, belly = o.belly || tone(fur, 0.55), dark = o.dark || tone(fur, -0.22), inner = o.inner || '#f3a7b5';
  const hy = o.headY ?? 43, hr = o.headR ?? 21, hry = o.headRy ?? hr * 0.9;
  const ears = {
    long: () => mirror(rot(E(41, hy - 28, 6, 17, fur) + E(41, hy - 27, 3, 13, inner), -9, 41, hy - 12)),
    point: () => mirror(P(`M${50 - hr + 2} ${hy - 6}L${50 - hr + 4} ${hy - hry - 12}L${50 - 5} ${hy - hry + 3}Z`, fur) + P(`M${50 - hr + 5.5} ${hy - 9}L${50 - hr + 6.5} ${hy - hry - 6}L${50 - 10} ${hy - hry + 3}Z`, inner)),
    big: () => mirror(P(`M${50 - hr + 4} ${hy - 4}L${50 - hr - 8} ${hy - hry - 22}L${50 - 4} ${hy - hry + 3}Z`, fur) + P(`M${50 - hr + 6} ${hy - 9}L${50 - hr - 3.5} ${hy - hry - 15}L${50 - 9} ${hy - hry + 3}Z`, inner)),
    round: () => mirror(C(50 - hr * 0.72, hy - hry * 0.78, 7.4, o.earFur || fur) + C(50 - hr * 0.72, hy - hry * 0.78, 3.8, o.earIn || inner)),
    small: () => mirror(C(50 - hr * 0.74, hy - hry * 0.76, 4.4, dark) + C(50 - hr * 0.74, hy - hry * 0.76, 2, inner)),
    none: () => '',
  }[o.ears || 'round']();
  const tails = {
    bushy: () => P('M62 82C84 88 94 70 84 54C82 50 78 51 79 55C82 66 74 72 62 72Z', o.tailFur || fur) + P('M84 54C82 50 78 51 79 55C80 58 80 61 79 63C84 63 87 59 84 54Z', o.tip || '#fff'),
    squirrel: () => P('M60 84C84 90 96 60 82 44C76 37 66 42 70 50C76 58 74 70 60 72Z', o.tailFur || fur) + P('M82 44C76 37 66 42 70 50C72 53 73 56 73 59C80 58 86 51 82 44Z', tone(o.tailFur || fur, 0.25)),
    cotton: () => C(69, 80, 5.5, '#fff'),
    thin: () => L('M64 84C80 88 86 72 78 62', fur, 5),
    curl: () => L('M64 76c9 3 14 -4 10 -10c-2 -3 -6 -2 -6 1', o.tailFur || fur, 5.5),
    ringed: () => L('M62 82C80 88 90 74 82 58', o.tailFur || fur, 9) + L('M62 82C80 88 90 74 82 58', o.ring || dark, 9, ' stroke-dasharray="4.5 6.5"', 'butt'),
    thick: () => P('M60 86C76 92 90 86 92 78C80 82 70 78 62 76Z', dark),
    none: () => '',
  }[o.tail || 'none']();
  const feet = o.feet === false ? '' : mirror(E(40.5, 88.5, 7.2, 4, o.feetFur || dark));
  const arms = o.arms === false ? '' : mirror(rot(E(34, 72, 4.8, 8.5, o.armFur || fur), 14, 34, 72));
  return shadow(o.shadow || 22) + (o.behind || '') + tails + ears
    + E(50, 73, 19, 17, fur) + E(50, 76, 12.5, 12.5, belly) + (o.mid || '') + arms + feet
    + E(50, hy, hr, hry, fur) + (o.face || '') + (o.muzzle === false ? '' : E(50, hy + 8, o.muzzleW || 9.5, o.muzzleH || 7, o.muzzleFur || belly))
    + (o.eyes || eyes(8.5, hy)) + E(50, hy + 5.6, 2.7, 2, o.nose || INK) + smile(hy + 7.5, 5) + (o.blush === false ? '' : blush(14, hy + 6)) + (o.front || '');
}

/** A standing bird, front-facing. */
function bird(o) {
  const col = o.col, belly = o.belly || tone(col, 0.5), dark = o.dark || tone(col, -0.2), beak = o.beak || '#f2a33a';
  return shadow(o.shadow || 18) + (o.behind || '') + mirror(L('M45 86v4.5m-3 0h6', o.legs || beak, 1.8))
    + mirror(rot(E(30.5, 64, 7, 15, dark), 12, 30.5, 64)) + E(50, 60, 21, 26, col) + E(50, 67, o.bellyW || 13.5, o.bellyH || 17, belly) + (o.mid || '')
    + (o.eyes || eyes(8, 47, 2.6)) + (o.beakShape || P('M45.5 52.5H54.5L50 59Z', beak) + P('M50 52.5H54.5L50 59Z', tone(beak, -0.15))) + (o.blush === false ? '' : blush(14, 54)) + (o.front || '');
}

const animals = {
  rabbit: () => mammal({ fur: '#efe6da', belly: '#fffaf3', dark: '#dccdbb', ears: 'long', tail: 'cotton', nose: '#e58aa0', muzzleFur: '#fffaf3',
    front: L('M38 49h-6M38 51.5l-5 1.5M62 49h6M62 51.5l5 1.5', '#cbbba6', 0.7) }),
  hedgehog: () => {
    const spikes = Array.from({ length: 13 }, (_, i) => { const a = (-200 + i * (220 / 12)) * Math.PI / 180, r1 = 30, r2 = 38; const m = a + 0.14; return `L${n(50 + Math.cos(a) * r1)} ${n(62 + Math.sin(a) * r1 * 0.86)}L${n(50 + Math.cos(m) * r2)} ${n(62 + Math.sin(m) * r2 * 0.86)}`; }).join('');
    return mammal({ fur: '#e9d3b4', belly: '#f8ead4', dark: '#c9a983', ears: 'small', headY: 52, headR: 17, headRy: 15, shadow: 26, blush: true, muzzleW: 7, muzzleH: 5,
      behind: P(`M22 72${spikes}L78 72Q80 90 50 90Q20 90 22 72Z`, '#7a563c') + P('M50 30L58 24L60 31L68 27L68 35L76 34L74 42L80 44L76 50L80 56L78 72Q80 90 50 90Z', '#684832', ' opacity=".5"'),
      arms: false });
  },
  squirrel: () => mammal({ fur: '#c9703a', belly: '#f6e2c8', ears: 'point', tail: 'squirrel', tailFur: '#b55f2e', headR: 19,
    mid: E(50, 76, 5.2, 6.4, '#a8713c') + P('M44.6 73.5a5.4 4.4 0 0 1 10.8 0Z', '#6e4b28') + L('M50 69.5v-2.4', '#6e4b28', 1.2),
    arms: true, front: mirror(L('M33 20l-2 -5M36 19l0 -5', '#c9703a', 1.2)) }),
  cat: () => mammal({ fur: '#f0a04b', belly: '#fde9cf', ears: 'point', tail: 'thin', nose: '#e58aa0',
    face: L('M46 26v6M50 25v7M54 26v6', '#d27f2c', 1.6) + mirror(L('M31 40l5 2M31 46l5 0', '#d27f2c', 1.5)),
    front: mirror(L('M38 50l-8 -1.5M38 52l-8 1.5', '#fff5e6', 0.8)) }),
  shiba: () => mammal({ fur: '#e2a14e', belly: '#fff6e6', ears: 'point', tail: 'curl', muzzleW: 12, muzzleH: 9,
    face: mirror(E(40, 51, 8, 7.5, '#fff6e6')) + mirror(C(41.5, 38, 1.5, '#fff6e6')), inner: '#f6d7b0' }),
  raccoon: () => mammal({ fur: '#9a9aa6', belly: '#e9e9ee', dark: '#55535f', ears: 'round', earIn: '#55535f', tail: 'ringed', tailFur: '#b9b9c4', ring: '#55535f', blush: false,
    face: mirror(rot(E(40.5, 43.5, 8.5, 5.6, '#4a4855'), -14, 40.5, 43.5)) + E(50, 34, 4, 5, '#e9e9ee') + mirror(E(36, 34, 5, 2.4, '#e9e9ee', ' transform="rotate(-20 36 34)"')),
    eyes: mirror(C(41.5, 43.5, 2.5, '#16151c') + C(40.7, 42.6, 0.9, '#fff')) }),
  fox: () => mammal({ fur: '#e2733a', belly: '#fff3e6', dark: '#4a3a3a', ears: 'point', inner: '#4a3a3a', tail: 'bushy', tip: '#fff3e6', muzzle: false,
    face: P('M29 44C33 58 42 62 50 62C58 62 67 58 71 44C64 48 58 50 50 44C42 50 36 48 29 44Z', '#fff3e6') }),
  fennec: () => mammal({ fur: '#edcf9d', belly: '#fff7e8', dark: '#d2b07c', ears: 'big', inner: '#f6b9a6', tail: 'bushy', tip: '#6e5a48', headR: 19 }),
  deer: () => mammal({ fur: '#c98d55', belly: '#f8e7cf', ears: 'none', tail: 'none', headR: 19, headRy: 18,
    behind: mirror(L('M42 24C40 16 36 12 32 8M39 16C35 16 32 15 29 12M40.5 20C43 16 44 12 43 8', '#8b6238', 2.4)) + mirror(rot(E(27, 34, 4, 8.5, '#c98d55') + E(27, 34.5, 2, 6, '#f3b7a7'), -62, 27, 34)),
    mid: [[40, 68], [46, 63], [57, 65], [62, 71], [38, 76]].map(([x, y]) => C(x, y, 1.5, '#fff7ea')).join(''), muzzleW: 8.5 }),
  redpanda: () => mammal({ fur: '#c8552e', belly: '#3b2a2a', dark: '#3b2a2a', ears: 'point', inner: '#fff5ea', tail: 'ringed', tailFur: '#d9703f', ring: '#8f3a1e', armFur: '#3b2a2a', muzzleFur: '#fff5ea',
    face: mirror(E(38.5, 51, 7, 6, '#fff5ea')) + mirror(E(41, 36.5, 3, 2, '#fff5ea')) + mirror(L('M40 47q-3 5 -1 10', '#a8401f', 1.6)) }),
  otter: () => mammal({ fur: '#8a6248', belly: '#e8d2b6', ears: 'small', tail: 'thick', headR: 19, headRy: 17, muzzleW: 11, muzzleH: 8, arms: false,
    mid: mirror(rot(E(43, 74, 4.2, 8, '#7a563e'), -38, 43, 74)) + E(50, 77.5, 5, 3.6, '#c9ccd6') + L('M47 77.5h6', '#9fa3b0', 0.8),
    front: mirror(L('M40 51l-8 -1M40 53l-8 2', '#f3e6d2', 0.8)) }),
  capybara: () => mammal({ fur: '#b98a5c', belly: '#d7b189', dark: '#8f6741', ears: 'small', tail: 'none', headR: 20, headRy: 17, headY: 44, muzzleW: 13, muzzleH: 9.5, muzzleFur: '#c79a6b', blush: false,
    eyes: sleepyEyes(10, 41), nose: '#5b3f2b',
    front: G(E(50, 24.5, 5.5, 4.5, '#f29a3a') + E(48, 23, 1.6, 1.2, '#f8c27a') + leaf(50, 20.5, 5, 2, 30, '#58a85c'), '') }),
  bear: () => mammal({ fur: '#8f6242', belly: '#c9a27c', ears: 'round', earIn: '#c9a27c', tail: 'none', headR: 22, muzzleW: 11, muzzleH: 8.5, muzzleFur: '#e2c4a2', shadow: 24 }),
  panda: () => mammal({ fur: '#fbfbf7', belly: '#fbfbf7', dark: '#2c2a33', ears: 'round', earFur: '#2c2a33', earIn: '#2c2a33', armFur: '#2c2a33', feetFur: '#2c2a33', tail: 'none', headR: 22, blush: true, muzzleFur: '#fbfbf7',
    face: mirror(rot(E(40.5, 43, 6, 7.4, '#2c2a33'), 22, 40.5, 43)), eyes: mirror(C(41, 43, 2.3, '#fff') + C(41.3, 43.3, 1.4, '#16151c')),
    mid: leaf(62, 80, 16, 3, 20, '#58a85c') + L('M62 82L66 60', '#7fb857', 2.4) }),
  seal: () => shadow(28) + P('M12 84C12 78 20 76 26 80C36 66 40 44 54 38C70 32 84 44 82 62C80 78 66 90 46 90H18C14 90 12 87 12 84Z', '#9aa7b8')
    + P('M40 60C44 76 58 86 46 90H62C74 86 82 74 82 62C78 72 62 82 40 60Z', '#8493a6') + E(60, 74, 13, 11, '#c7d0db', ' opacity=".8"')
    + P('M12 84C8 80 6 76 8 72C12 76 18 78 24 80Z', '#8493a6') + rot(E(44, 82, 9, 4, '#8493a6'), -18, 44, 82) + rot(E(76, 80, 8, 3.6, '#7b899c'), 24, 76, 80)
    + eye(55, 52, 2.7) + eye(72, 52, 2.7) + E(63.5, 58, 7, 5, '#b4bfcc') + E(63.5, 56, 2.4, 1.8, INK) + L('M63.5 58q-2.4 2.6 -4.6 .8M63.5 58q2.4 2.6 4.6 .8', INK, 1)
    + L('M57 58l-7 -1M57 60l-7 2M70 58l7 -1M70 60l7 2', '#eef2f6', 0.8) + [[40, 66], [36, 72], [45, 70]].map(([x, y]) => C(x, y, 1.3, '#8493a6')).join(''),

  robin: () => bird({ col: '#8a6a4e', belly: '#e9703a', dark: '#6f543d', beak: '#4a3b2e', legs: '#7a5a48', bellyW: 14, bellyH: 13,
    mid: E(50, 76, 11, 8.5, '#f5ead8'), behind: P('M58 78L78 86L62 86Z', '#6f543d') }),
  duck: () => bird({ col: '#f8d047', belly: '#fde68a', dark: '#eab93a', legs: '#f08a2c',
    beakShape: E(50, 54.5, 8, 4, '#f08a2c') + L('M43 54.5h14', '#d06f1c', 0.9), eyes: eyes(8.5, 45, 2.5),
    front: L('M48 33q2 -6 6 -5', '#eab93a', 2), behind: P('M62 74L78 70L68 82Z', '#eab93a') }),
  owl: () => bird({ col: '#9a724d', belly: '#e9d2ad', dark: '#7c5a3b', beak: '#f0b03a', blush: false,
    behind: mirror(P('M33 40L30 22L44 36Z', '#7c5a3b')),
    eyes: mirror(C(41, 47, 8.5, '#f2e3c7') + C(41, 47, 5.4, '#f6c445') + C(41, 47, 3, '#16151c') + C(40, 46, 1, '#fff')),
    mid: [[44, 64], [56, 64], [50, 70], [44, 76], [56, 76]].map(([x, y]) => L(`M${x - 2.6} ${y}q2.6 2.6 5.2 0`, '#b9976a', 1.1)).join('') }),
  parrot: () => bird({ col: '#e04b3c', belly: '#f7c948', dark: '#2f7fc1', legs: '#6b6770', bellyW: 11, bellyH: 13,
    behind: P('M46 82L42 98H50Z', '#2f7fc1') + P('M54 82L58 97H50Z', '#3c9a5f'),
    beakShape: P('M44 51C44 46 56 46 56 51C56 58 52 61 49.5 62C51 58 50 55 44 51Z', '#f3ead9') + P('M50 54.5C52 56 52 59 49.5 62C48 60 47.5 58 48.5 56Z', '#3a3640'),
    eyes: mirror(C(41, 45, 4.2, '#fff8ef') + C(41.4, 45.2, 2.2, '#16151c') + C(40.6, 44.4, 0.8, '#fff')), blush: false,
    front: L('M46 34q4 -7 9 -4', '#f7c948', 2.2) }),
  penguin: () => bird({ col: '#34384f', belly: '#fbfbf7', dark: '#272a3d', legs: '#f2a33a', bellyW: 15, bellyH: 20,
    mid: mirror(E(42, 47, 8.5, 9, '#fbfbf7')), eyes: eyes(8, 47, 2.5) }),
  snail: () => shadow(28) + P('M14 90C7 90 7 79 16 79H60C67 79 71 74 72 66C73 55 89 55 89 68C89 82 79 90 64 90Z', '#edd3ae') + P('M14 90C9 90 8 86 10 84.5H66C76 84.5 85 79 88 72C87 83 78 90 64 90Z', '#dcbb8c')
    + L('M77 60L74 46M84 60L87 46', '#edd3ae', 2.4) + C(74, 45, 2.8, INK) + C(87, 45, 2.8, INK) + C(73.2, 44.2, 0.9, '#fff') + C(86.2, 44.2, 0.9, '#fff')
    + C(42, 60, 24, '#b85f2c') + C(41, 59, 22, '#d9783e') + L('M41 59a5.5 5.5 0 1 1 5.5 5.5a11.5 11.5 0 1 1 -11.5 -11.5a17 17 0 0 1 17 17', '#f3b178', 3.2)
    + L('M78 72q2.6 2.4 5 0', INK, 1.1) + C(75, 70, 1.9, '#f48ea0', ' opacity=".45"'),
  ladybug: () => shadow(24) + L('M30 74L22 80M34 82L28 90M66 82L72 90M70 74L78 80M32 64L22 62M68 64L78 62', INK, 2)
    + E(50, 40, 13, 10, INK) + L('M44 32q-4 -8 -9 -8M56 32q4 -8 9 -8', INK, 1.6) + C(35, 24, 1.8, INK) + C(65, 24, 1.8, INK)
    + C(44.5, 38, 3.2, '#fff') + C(55.5, 38, 3.2, '#fff') + C(45, 38.4, 1.6, INK) + C(55, 38.4, 1.6, INK)
    + P('M24 66C24 46 36 40 50 40C64 40 76 46 76 66C76 80 64 88 50 88C36 88 24 80 24 66Z', '#e23d35') + P('M50 40C64 40 76 46 76 66C76 80 64 88 50 88Z', '#c9302c')
    + L('M50 40V88', INK, 1.6) + [[36, 56, 5], [38, 74, 4.2], [64, 56, 5], [62, 74, 4.2], [50, 64, 0]].filter(s => s[2]).map(([x, y, r]) => C(x, y, r, INK)).join('') + E(36, 50, 5, 2.4, '#f58a80', ' opacity=".6" transform="rotate(-30 36 50)"'),
  bee: () => E(50, 91, 14, 2.6, '#1f2240', ' opacity=".12"') + mirror(rot(E(36, 34, 9, 15, '#dff1fb', ' opacity=".85"') + E(36, 34, 9, 15, 'none', ' stroke="#a8cfe6" stroke-width="1"'), -32, 36, 34))
    + P('M50 82L46 74H54Z', INK) + E(50, 58, 20, 19, '#f6c132') + P('M31.5 51C36 47 64 47 68.5 51L69.8 57C62 53 38 53 30.2 57Z', INK) + P('M31 65C38 62 62 62 69 65L66 71C60 68.5 40 68.5 34 71Z', INK)
    + L('M43 41q-3 -8 -8 -8M57 41q3 -8 8 -8', INK, 1.5) + C(35, 33, 1.7, INK) + C(65, 33, 1.7, INK)
    + eye(43, 58.5, 2.6) + eye(57, 58.5, 2.6) + L('M47 63q3 2.6 6 0', INK, 1.1) + C(39, 62.5, 2.2, '#f48ea0', ' opacity=".45"') + C(61, 62.5, 2.2, '#f48ea0', ' opacity=".45"'),
  butterfly: () => E(50, 91, 14, 2.6, '#1f2240', ' opacity=".12"') + mirror(P('M49 52C40 30 20 22 14 34C10 44 24 56 49 56Z', '#5b8def') + P('M49 56C34 56 22 62 24 72C26 82 42 78 49 60Z', '#7aa5f5')
    + C(26, 38, 4.5, '#fff', ' opacity=".8"') + C(35, 46, 2.6, '#f6c445') + C(32, 68, 3, '#fff', ' opacity=".8"') + P('M14 34C10 44 24 56 49 56L49 54C28 52 16 44 14 34Z', '#3f6fd1'))
    + E(50, 56, 3.2, 14, '#3a3550') + C(50, 40, 4, '#3a3550') + L('M48.5 37q-3 -8 -8 -9M51.5 37q3 -8 8 -9', '#3a3550', 1.2) + C(40.5, 28, 1.4, '#3a3550') + C(59.5, 28, 1.4, '#3a3550')
    + C(48.6, 39.6, 0.9, '#fff') + C(51.4, 39.6, 0.9, '#fff'),
  frog: () => shadow(26) + mirror(P('M28 90C18 90 16 80 24 74C30 70 38 76 36 84C40 86 40 90 36 90Z', '#4c9c57')) + E(50, 72, 24, 18, '#5db366') + E(50, 78, 15, 11, '#dff0c6')
    + mirror(C(37, 52, 9, '#5db366') + C(37, 52, 6, '#fff') + C(37.6, 52.6, 3.2, INK) + C(36.4, 51.4, 1.1, '#fff'))
    + L('M36 68q14 9 28 0', INK, 1.5) + mirror(C(34, 68, 2.6, '#f48ea0', ' opacity=".4"')) + mirror(L('M38 88l-3 3M41 88v3.4M44 88l3 3', '#3f8549', 1.6))
    + [[40, 62], [60, 62]].map(([x, y]) => C(x, y, 0.8, '#3f8549')).join(''),
  lizard: () => shadow(26) + L('M54 72C70 84 86 80 86 68C86 60 78 58 76 64', '#5aa873', 6) + mirror(L('M38 54L24 48M38 70L24 78', '#5aa873', 4.5)) + mirror([[22, 46], [20, 50], [24, 44]].map(([x, y]) => C(x, y, 2.2, '#7cc391')).join('') + [[21, 78], [22, 82], [25, 76]].map(([x, y]) => C(x, y, 2.2, '#7cc391')).join(''))
    + E(50, 62, 13, 20, '#5aa873') + E(50, 32, 13.5, 12, '#66b47e') + [[46, 52], [54, 58], [47, 66], [53, 72], [50, 46]].map(([x, y]) => C(x, y, 2, '#f6c445')).join('')
    + mirror(C(39, 28, 5.6, '#66b47e') + C(39, 28, 3.8, '#fff8e6') + E(39.4, 28, 1.3, 3, INK)) + L('M45 37q5 3.4 10 0', INK, 1.2) + mirror(C(41, 36, 2, '#f48ea0', ' opacity=".4"')),
  turtle: () => shadow(29) + E(24, 85, 7.5, 5, '#6fae6a') + E(62, 85, 7.5, 5, '#6fae6a') + P('M6 77l9 -3.4v6.8Z', '#6fae6a')
    + P('M66 78C70 60 78 52 86 52C93 52 96 58 96 64C96 72 90 76 82 76C78 80 72 82 66 78Z', '#7fbd78') + eye(88, 62, 2.6) + L('M88 69q3 1.8 5.6 -.6', INK, 1.1) + C(83, 68, 2.1, '#f48ea0', ' opacity=".45"')
    + P('M10 79C10 54 27 43 43 43C59 43 76 54 76 79Z', '#3f8f6b') + P('M43 43C59 43 76 54 76 79H58C62 65 56 50 43 43Z', '#357a5b') + P('M8 77H78V81C78 84 76 85 72 85H14C10 85 8 84 8 81Z', '#e3c58d')
    + L('M43 45L35 58H51ZM35 58L25 70L21 78M51 58L61 70L65 78M35 58L39 72H47L51 58M39 72L37 79M47 72L49 79', '#8fd0a4', 1.5, ' opacity=".85"'),
};

// ——— Nature ———

const STONE = '#a9adb8';
const nature = {
  tallgrass: () => shadow(22) + [[-50, 26, '#5a9a4c'], [42, 28, '#5a9a4c'], [-30, 38, '#6fae55'], [26, 40, '#6fae55'], [-12, 48, '#7fbd5e'], [10, 46, '#6fae55'], [0, 54, '#8fcf68'], [-64, 16, '#6fae55'], [60, 18, '#7fbd5e']].map(([d, len, c]) => leaf(50 + d * 0.12, 90, len, 3.2, d * 0.5, c)).join('')
    + L('M42 90C40 70 36 58 34 50', '#b9a36a', 1.2) + E(33.5, 46, 2.2, 5, '#d9c78e') + L('M58 90C60 72 63 62 66 56', '#b9a36a', 1.2) + E(66.6, 52, 2, 4.6, '#d9c78e'),
  stump: () => shadow(26) + P('M26 90C22 90 20 86 24 84L30 60H70L76 84C80 86 78 90 74 90Z', '#8a5f41') + P('M54 60H70L76 84C80 86 78 90 74 90H56Z', '#73492f')
    + E(50, 60, 20, 7.5, '#d9b88a') + E(50, 60, 13, 4.8, 'none', ' stroke="#b98f5f" stroke-width="1.2"') + E(50, 60, 6, 2.2, 'none', ' stroke="#b98f5f" stroke-width="1.2"')
    + L('M34 72v10M44 74v12M64 72v8', '#6a4428', 1.2) + leaf(26, 88, 12, 3, -40, GREEN) + leaf(74, 88, 10, 3, 44, LIME) + C(70, 62, 3, '#e8d9c0') + C(73.4, 64, 2, '#e8d9c0'),
  boulder: () => shadow(30) + P('M16 90C12 76 18 58 32 52C44 46 62 44 72 54C84 62 90 76 84 90Z', STONE) + P('M56 46C64 46 70 50 72 54C84 62 90 76 84 90H60C70 78 68 58 56 46Z', tone(STONE, -0.16))
    + P('M28 64C32 58 40 55 46 55C40 58 34 62 30 68Z', tone(STONE, 0.3)) + L('M40 70l6 8l-3 8M62 62l4 10', tone(STONE, -0.28), 1.1) + E(28, 86, 9, 3.4, '#6fae55') + E(70, 87, 7, 2.8, '#5a9a4c') + C(24, 83, 1.4, '#f6c445'),
  log: () => shadow(32) + P('M18 68H74C84 68 88 74 88 80C88 86 84 90 74 90H18Z', '#8a5f41') + P('M18 82H80C84 82 87 81 88 80C88 86 84 90 74 90H18Z', '#73492f')
    + E(18, 79, 8, 11, '#d9b88a') + E(18, 79, 4.6, 6.8, '#4a3122') + P('M30 68C36 62 48 62 54 68Z', '#6fae55') + P('M58 68C62 64 70 64 74 68Z', '#7fbd5e') + L('M40 76h10M58 82h12M34 86h8', '#6a4428', 1.1)
    + C(66, 66, 3.4, '#d9453c') + P('M62.6 66a3.4 3.4 0 0 1 6.8 0Z', '#d9453c') + L('M66 66v4', '#f6ecd9', 1.6) + leaf(84, 90, 9, 2.6, 30, GREEN),
  burrow: () => shadow(30) + P('M14 90C16 72 30 60 50 60C70 60 84 72 86 90Z', '#8fbf62') + P('M50 60C70 60 84 72 86 90H62C68 78 62 66 50 60Z', '#7aab52')
    + P('M34 90C34 78 41 70 50 70C59 70 66 78 66 90Z', '#3d2a20') + P('M38 90C38 80 43 74 50 74C57 74 62 80 62 90Z', '#2a1c16') + E(50, 90, 18, 3, '#a47a57')
    + leaf(22, 84, 9, 2.4, -24, '#5a9a4c') + leaf(78, 84, 10, 2.4, 20, '#5a9a4c') + C(30, 70, 2, '#fffdf7') + C(30, 70, 0.8, '#f4b730') + C(70, 68, 1.8, '#f6a8c6'),
  birdhouse: () => shadow(16) + P('M47.5 90V52H52.5V90Z', '#8a5f41') + P('M50.5 90V52H52.5V90Z', '#73492f') + P('M36 54H64V30H36Z', '#e9c98f') + P('M54 54H64V30H54Z', '#d6b071')
    + P('M30 32L50 14L70 32L66 36L50 22L34 36Z', '#c2553f') + P('M50 14L70 32L66 36L50 22Z', '#a5432f') + C(50, 40, 5, '#4a3122') + L('M44 49h12', '#8a5f41', 1.8) + leaf(46, 90, 8, 2.4, -40, GREEN) + leaf(54, 90, 8, 2.4, 40, LIME),
  beehive: () => shadow(22) + P('M30 90V84H70V90Z', '#8a5f41') + P('M26 84H74V80H26Z', '#a57650')
    + [[18, 80, 26], [16, 70, 24], [12, 60, 20], [8, 50, 14]].map(([y0, y, w], i) => P(`M${50 - w} ${y + 10}C${50 - w - 2} ${y + 4} ${50 - w + 2} ${y} ${50 - w + 6} ${y}H${50 + w - 6}C${50 + w - 2} ${y} ${50 + w + 2} ${y + 4} ${50 + w} ${y + 10}Z`, i % 2 ? '#eeb53c' : '#f6c655') + P(`M${50 + w * 0.3} ${y}H${50 + w - 6}C${50 + w - 2} ${y} ${50 + w + 2} ${y + 4} ${50 + w} ${y + 10}H${50 + w * 0.5}Z`, i % 2 ? '#d99c26' : '#e3ad3a')).reverse().join('')
    + P('M44 50C44 44 56 44 56 50Z', '#f6c655') + E(50, 76, 5, 4, '#4a3122') + E(64, 40, 3, 2.2, '#f6c132') + E(63, 38.6, 2.4, 1.3, '#dff1fb', ' opacity=".9"') + E(34, 54, 3, 2.2, '#f6c132') + E(35, 52.6, 2.4, 1.3, '#dff1fb', ' opacity=".9"'),
  lantern: () => shadow(20) + P('M38 90H62L59 82H41Z', STONE) + P('M45 82H55V62H45Z', tone(STONE, 0.1)) + P('M51 82H55V62H51Z', tone(STONE, -0.14)) + P('M36 62H64L60 56H40Z', STONE)
    + P('M40 56H60V38H40Z', tone(STONE, 0.12)) + `<rect class="glow" x="44" y="41" width="12" height="12" rx="2" fill="#f9d77a"/>` + L('M50 41v12M44 47h12', tone(STONE, -0.2), 1.4)
    + P('M30 40L50 24L70 40L66 42H34Z', tone(STONE, -0.18)) + P('M50 24L70 40L66 42H50Z', tone(STONE, -0.3)) + C(50, 22, 3.4, STONE) + E(36, 88, 8, 2.6, '#6fae55'),
  campfire: () => shadow(28) + [[26, 86], [38, 90], [62, 90], [74, 86], [50, 91]].map(([x, y]) => E(x, y, 6, 4, STONE) + E(x - 1.4, y - 1.2, 2.6, 1.4, tone(STONE, 0.3))).join('')
    + rot(P('M22 78H78V86H22Z', '#8a5f41'), -14, 50, 82) + rot(P('M22 78H78V86H22Z', '#73492f'), 14, 50, 82) + rot(E(76, 82, 3.4, 4, '#d9b88a'), -14, 50, 82) + rot(E(24, 82, 3.4, 4, '#d9b88a'), 14, 50, 82)
    + `<g class="flame">${P('M50 82C36 82 32 68 40 58C42 64 46 64 46 58C46 48 52 44 52 36C62 44 70 56 66 68C64 78 58 82 50 82Z', '#f08a2c') + P('M50 82C42 82 40 72 45 66C47 70 50 68 51 60C57 66 60 72 58 77C56 80 54 82 50 82Z', '#f9c846') + P('M50 82C46 82 45 77 48 74C49 76 51 75 51 72C54 75 55 78 54 80C53 81 52 82 50 82Z', '#fff3bf')}</g>`,
  pond: () => E(50, 80, 46, 14, '#8fbf62') + E(50, 79, 42, 12, '#5aa9cf') + E(50, 78, 38, 10, '#7fc4dc') + E(44, 76, 22, 5, '#a5dbea', ' opacity=".7"') + L('M30 78q5 -2 10 0M56 82q5 -2 10 0', '#e3f5fa', 1.1)
    + E(12, 78, 6, 4, STONE) + E(86, 82, 5, 3.4, tone(STONE, -0.1)) + E(22, 88, 4, 2.6, STONE) + P('M66 76L77 75A11 3.6 0 1 0 76 78Z', '#4f9f61') + C(71, 74.6, 2, '#f6a8c6')
    + leaf(84, 76, 20, 2.4, 8, '#6f9f4f') + leaf(88, 78, 16, 2.4, 24, '#7fae55') + L('M86 77V58', '#7a9a4c', 1.4) + E(86, 60, 2.2, 6, '#7b4b2a') + leaf(10, 76, 14, 2.2, -14, '#7fae55'),
};

/** Every species id → a function returning its drawing. */
export const ART = { ...plants, ...animals, ...nature };

// ——— Stages of growing ———

const mound = E(50, 89, 17, 5, '#8a6245') + E(50, 88, 12, 3, '#a47a57');
const stages = {
  seed: () => shadow(16) + mound + E(50, 85.5, 3.2, 2.4, '#d9b98a') + E(49.2, 85, 1, 0.7, '#f0dcba'),
  sprout: () => shadow(16) + mound + L('M50 87C50 80 50 76 50 71', '#4f9a54', 2) + leaf(50, 73, 11, 4.2, -52, '#69b866') + leaf(50, 73, 10, 4, 50, '#58a85c'),
  tracks: () => shadow(14) + [[40, 86, -14], [52, 80, 10], [44, 72, -12], [56, 66, 12]].map(([x, y, d]) => rot(E(x, y, 2.4, 3.2, '#8b8fab') + [-2.4, 0, 2.4].map(o => C(x + o, y - 4.2, 1, '#8b8fab')).join(''), d, x, y)).join(''),
  patch: () => shadow(20) + E(50, 88, 24, 6.5, '#8a6245') + E(50, 87, 18, 4.2, '#a47a57') + P('M62 88V62H64V88Z', '#8a5f41') + P('M64 63L76 66.5L64 70Z', '#f6b73c') + E(40, 86, 4, 2, '#8f7a66') + E(48, 89, 3, 1.6, '#75624f'),
  bush: () => shadow(24) + canopy([[36, 76, 13], [64, 76, 13], [50, 66, 16], [50, 80, 12]], '#58a85c') + E(50, 70, 11, 6.5, '#2f5a3a') + eye(45, 70, 2.3) + eye(55, 70, 2.3),
};

/** Which stage a session shows at a fraction of its time: 0 seed, 1 sprout, 2 young, 3 grown. */
export function stageAt(fraction) {
  return fraction >= 0.85 ? 3 : fraction >= 0.45 ? 2 : fraction >= 0.15 ? 1 : 0;
}

/** The inside of the SVG for a species at a stage. Nature starts as a marked patch of earth. */
export function drawing(id, { kind = 'plant', stage = 3, withered = false } = {}) {
  const art = ART[id];
  if (!art) return stages.seed();
  if (kind === 'nature') return withered || stage <= 1 ? stages.patch() : stage === 2 ? G(art(), 'translate(50 90) scale(.62) translate(-50 -90)') : art();
  if (withered) {
    if (kind === 'animal') return stages.tracks();
    return `<g filter="url(#hv-wither)">${G(art(), 'rotate(-7 50 90)')}</g>`;
  }
  if (stage <= 0) return kind === 'animal' ? stages.tracks() : stages.seed();
  if (stage === 1) return kind === 'animal' ? stages.bush() : stages.sprout();
  if (stage === 2) return G(art(), 'translate(50 90) scale(.62) translate(-50 -90)');
  return art();
}

/** The colour filter withered plants are drawn through. The page defines it once (see app.js). */
export const WITHER_FILTER = '<filter id="hv-wither" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".42 .38 .12 0 .05  .36 .34 .1 0 .03  .2 .2 .1 0 0  0 0 0 1 0"/></filter>';

/** A complete SVG for a species. */
export function sprite(id, { kind = 'plant', stage = 3, withered = false, label = '', cls = '' } = {}) {
  const a11y = label ? ` role="img" aria-label="${label}"` : ' aria-hidden="true"';
  return `<svg class="sprite${cls ? ' ' + cls : ''}" viewBox="0 0 100 100"${a11y}>${drawing(id, { kind, stage, withered })}</svg>`;
}
