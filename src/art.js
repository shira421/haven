// Original drawings of every plant and animal, as SVG built from simple shapes.
// Each is drawn in a 100 × 100 box and stands on the ground at y = 90, centred on x = 50.
// Nothing here touches the DOM: the functions return SVG text, so the same art is used by
// the app, the icon script and the tests.

import { n, tone, E, C, P, L, G, rot, mirror, shadow, INK } from './shapes.js';
import { animals } from './creatures.js';
import { artOf } from './catalog.js';
export { tone };


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
  lily() {
    // Six petals curling back from a long throat, with stamens reaching out.
    const bloom = (x, y, s, deg, c) => {
      const petal = a => rot(P('M0 0C-3 -4 -3.4 -11 0 -17C3.4 -11 3 -4 0 0Z', c) + L('M0 -2V-13', tone(c, -0.14), 0.6, ' opacity=".7"'), a, 0, 0);
      const spots = [[-2, -6], [2, -7], [-1, -9], [1.6, -4.4]].map(([a, b]) => C(a, b, 0.45, tone(c, -0.4))).join('');
      return G([-150, -100, -50, 50, 100, 150].map(petal).join('') + petal(-15) + petal(15) + spots + C(0, 0, 2, tone(c, -0.2))
        + [-14, 0, 14].map(a => rot(L('M0 0V-12', '#7da25a', 0.6) + E(0, -12.4, 0.7, 1.4, '#b35a2c'), a, 0, 0)).join(''), `translate(${x} ${y}) rotate(${deg}) scale(${s})`);
    };
    const bud = (x, y, deg) => rot(E(x, y, 2.2, 6, '#f6d8e2') + E(x + 0.6, y, 1.2, 5.4, '#eebccc'), deg, x, y);
    return shadow(19) + stem(50, 90, 30, DEEP, -2, 2) + stem(50, 90, 46, DEEP, 9, 1.8)
      + leaf(50, 86, 16, 2.6, -48, GREEN) + leaf(50, 80, 15, 2.4, 56, LIME) + leaf(49.5, 70, 14, 2.2, -60, GREEN) + leaf(49, 60, 12, 2, 58, LIME) + leaf(48.6, 48, 10, 1.8, -54, GREEN)
      + bud(56, 42, 24) + bloom(46.5, 31, 1.15, -18, '#fbeef2') + bloom(62, 47, 0.9, 30, '#f7c7d6');
  },
  bougainvillea() {
    // A woody shrub covered in clusters of three papery bracts, each round a tiny white flower.
    const bract = (x, y, s, deg, c) => G([0, 120, 240].map(a => rot(P('M0 0C-4 -2 -5 -7 0 -9C5 -7 4 -2 0 0Z', c) + L('M0 -1.4V-7', tone(c, -0.16), 0.5), a, 0, 0)).join('') + C(0, 0, 1.1, '#fffbe8'), `translate(${n(x)} ${n(y)}) rotate(${deg}) scale(${s})`);
    const pinks = ['#d6338a', '#e24c9b', '#c72a7c', '#ee6aad'];
    const spots = [[30, 52, 0.95], [40, 40, 1.1], [52, 32, 1.15], [64, 38, 1.05], [72, 52, 0.95], [44, 56, 1], [58, 50, 1.1], [36, 66, 0.85], [66, 64, 0.85], [50, 44, 0.9], [24, 64, 0.8], [77, 64, 0.8], [58, 26, 0.85], [44, 28, 0.85]];
    return shadow(27) + L('M50 90C49 80 46 74 40 66M50 90C51 80 55 74 62 64M47 78C44 72 34 70 28 62M53 76C58 70 68 70 74 60', '#7a5238', 2.4)
      + canopy([[34, 58, 10], [66, 58, 10], [50, 44, 14], [40, 46, 11], [60, 44, 11], [50, 60, 10], [26, 66, 7], [74, 66, 7]], '#4f9454')
      + spots.map(([x, y, k], i) => bract(x, y, k, i * 37, pinks[i % pinks.length])).join('');
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
  bush: () => shadow(24) + canopy([[36, 76, 13], [64, 76, 13], [50, 66, 16], [50, 80, 12]], '#58a85c') + E(50, 70, 11, 6.5, '#2f5a3a') + C(45, 70, 2.3, INK) + C(44.3, 69.2, .8, '#fff') + C(55, 70, 2.3, INK) + C(54.3, 69.2, .8, '#fff'),
};

/** Which stage a session shows at a fraction of its time: 0 seed, 1 sprout, 2 young, 3 grown. */
export function stageAt(fraction) {
  return fraction >= 0.85 ? 3 : fraction >= 0.45 ? 2 : fraction >= 0.15 ? 1 : 0;
}

/** The inside of the SVG for a species at a stage. Nature starts as a marked patch of earth. */
export function drawing(id, { kind = 'plant', stage = 3, withered = false } = {}) {
  const art = ART[id] || ART[artOf(id)];
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
