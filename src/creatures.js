// Every animal, drawn from the side and built from parts that can move.
// Each faces right in a 100 × 100 box and stands on the ground at y = 90. The page flips it to face left.
//
// A drawing is: a ground shadow (.shade), then .lifted (raised when the animal is off the ground),
// then .rig (the whole body) holding the parts: .tail, .leg (.fl front, .hl hind, .far the pair
// on the other side), .head, .ear, .eye, .wing. Each part carries its own pivot, so the
// stylesheet can swing legs, flap wings and dip heads without knowing any animal's shape.
import { n, tone, E, C, P, L, rot, INK } from './shapes.js';

/** A part that moves about a pivot given in drawing units. */
const part = (cls, x, y, content, extra = '') => `<g class="${cls}"${cls.includes(' fly') ? ' display="none"' : ''} style="transform-origin:${n(x)}px ${n(y)}px${extra}">${content}</g>`;
/** An eye that can blink and close: the open eye, and a lid line shown when asleep. */
const eye = (x, y, r = 1.6, iris = '') => part('eye', x, y, (iris ? C(x, y, r * 1.75, iris) : '') + C(x, y, r, INK) + C(x + r * 0.32, y - r * 0.36, r * 0.34, '#fff'))
  + L(`M${n(x - r * 1.1)} ${n(y + 0.2)}q${n(r * 1.1)} ${n(r)} ${n(r * 2.2)} 0`, INK, 0.9, ' class="lid" display="none"');
const shade = (rx, cx = 50) => `<ellipse class="shade" cx="${cx}" cy="91" rx="${n(rx)}" ry="${n(rx * 0.2)}" fill="#1f2240" opacity=".16" style="transform-origin:${cx}px 91px"/>`;
/** Put a drawing together: shadow on the ground, everything else able to leave it. */
const creature = (shadowRx, cx, body, k = 1, legs = 0, cls = '') => shade(shadowRx * k, cx) + `<g class="lifted">${part('rig' + cls, cx, 90, k === 1 ? body : `<g transform="translate(${cx} 90) scale(${k}) translate(${-cx} -90)">${body}</g>`, `;--legs:${n(legs)}`)}</g>`;

// ——— Four-legged animals ———

/**
 * A four-legged animal in profile. Sizes are in drawing units:
 * len and bh are half the body's length and height, legH how far the belly is off the ground,
 * head the head's radius, snout how far the muzzle sticks out, neckU and neckF how far the
 * head is carried up and forward. `mid` and `face` add markings; they are given the geometry.
 */
function quad(o) {
  const fur = o.fur, belly = o.belly ?? tone(fur, 0.5), dark = o.dark ?? tone(fur, -0.22), legFur = o.legFur ?? fur;
  const { len, bh, legH } = o, cx = o.cx ?? 47;
  const by = 90 - legH - bh * 0.7, hipY = by + bh * 0.3, lw = o.legW ?? 4;
  const g = { cx, by, len, bh, fur, belly, dark, sx: cx + len * 0.64, sy: by - bh * 0.22 };

  const leg = (x, hind, isFar) => {
    const col = isFar ? tone(legFur, -0.18) : legFur, paw = isFar ? tone(o.paw ?? legFur, -0.18) : (o.paw ?? legFur), drop = 88 - hipY;
    const d = hind && drop > 9
      ? `M${n(x)} ${n(hipY)}L${n(x + 1.4)} ${n(hipY + drop * 0.42)}L${n(x - 2.4)} ${n(hipY + drop * 0.74)}L${n(x - 0.8)} 88`
      : `M${n(x)} ${n(hipY)}L${n(x + 0.5)} 88`;
    const haunch = hind ? E(x - 0.5, hipY + 0.5, lw * (o.haunch ?? 1.2), lw * (o.haunch ?? 1.2) * 1.2, isFar ? tone(o.haunchFur ?? fur, -0.18) : (o.haunchFur ?? fur)) : '';
    return part(`leg ${hind ? 'hl' : 'fl'}${isFar ? ' far' : ''}`, x, hipY, haunch + L(d, col, lw) + E(x + (hind ? 0.4 : 1.5), 88.5, lw * 0.75, 1.8, paw));
  };
  const frontX = cx + len * 0.62, hindX = cx - len * 0.6;

  // Tail, drawn pointing back from where it joins the body.
  const tx = cx - len * 0.92, ty = by - bh * 0.1, tailFur = o.tailFur ?? fur, Lt = o.tailL ?? 24, th = o.tailW ?? 8;
  const tail = {
    bushy: () => rot(P(`M${n(tx + 2)} ${n(ty - th * 0.4)}C${n(tx - Lt * 0.35)} ${n(ty - th)} ${n(tx - Lt * 0.8)} ${n(ty - th * 0.9)} ${n(tx - Lt)} ${n(ty)}C${n(tx - Lt * 0.8)} ${n(ty + th * 0.8)} ${n(tx - Lt * 0.3)} ${n(ty + th * 0.8)} ${n(tx + 2)} ${n(ty + th * 0.4)}Z`, tailFur)
      + P(`M${n(tx - Lt * 0.68)} ${n(ty - th * 0.8)}C${n(tx - Lt * 0.86)} ${n(ty - th * 0.8)} ${n(tx - Lt * 0.97)} ${n(ty - th * 0.4)} ${n(tx - Lt)} ${n(ty)}C${n(tx - Lt * 0.95)} ${n(ty + th * 0.45)} ${n(tx - Lt * 0.85)} ${n(ty + th * 0.7)} ${n(tx - Lt * 0.68)} ${n(ty + th * 0.7)}C${n(tx - Lt * 0.6)} ${n(ty + th * 0.2)} ${n(tx - Lt * 0.6)} ${n(ty - th * 0.3)} ${n(tx - Lt * 0.68)} ${n(ty - th * 0.8)}Z`, o.tip ?? '#fff'), o.tailA ?? 0, tx, ty),
    squirrel: () => P(`M${n(tx + 3)} ${n(ty + 4)}C${n(tx - 13)} ${n(ty + 7)} ${n(tx - 21)} ${n(ty - 9)} ${n(tx - 14)} ${n(ty - 24)}C${n(tx - 9)} ${n(ty - 35)} ${n(tx + 6)} ${n(ty - 36)} ${n(tx + 9)} ${n(ty - 27)}C${n(tx + 3)} ${n(ty - 29)} ${n(tx - 3)} ${n(ty - 25)} ${n(tx - 3)} ${n(ty - 17)}C${n(tx - 3)} ${n(ty - 9)} ${n(tx + 3)} ${n(ty - 5)} ${n(tx + 5)} ${n(ty - 3)}Z`, tailFur)
      + L(`M${n(tx - 9)} ${n(ty - 3)}C${n(tx - 14)} ${n(ty - 12)} ${n(tx - 11)} ${n(ty - 24)} ${n(tx - 2)} ${n(ty - 29)}`, tone(tailFur, 0.28), 2.4, ' opacity=".8"'),
    cotton: () => C(tx - 0.5, ty + 1, 4.2, '#fff') + C(tx - 1.5, ty, 2.4, '#fff'),
    thin: () => L(`M${n(tx + 2)} ${n(ty)}C${n(tx - 9)} ${n(ty + 3)} ${n(tx - 16)} ${n(ty - 7)} ${n(tx - 12)} ${n(ty - 18)}`, tailFur, 2.8),
    curl: () => L(`M${n(tx + 3)} ${n(ty + 1)}c-7 -1 -11 -9 -6 -13c4 -3 9 1 6 5`, tailFur, 4.6) + L(`M${n(tx - 2.6)} ${n(ty - 11.6)}c3 -1.6 5.6 .6 4.4 3.2`, o.tip ?? tone(tailFur, 0.5), 2.2),
    ringed: () => L(`M${n(tx + 3)} ${n(ty)}C${n(tx - 8)} ${n(ty + 5)} ${n(tx - 18)} ${n(ty + 5)} ${n(tx - 25)} ${n(ty - 3)}`, tailFur, th) + L(`M${n(tx + 3)} ${n(ty)}C${n(tx - 8)} ${n(ty + 5)} ${n(tx - 18)} ${n(ty + 5)} ${n(tx - 25)} ${n(ty - 3)}`, o.ring ?? dark, th, ' stroke-dasharray="3.4 4.6" stroke-dashoffset="-3"', 'butt'),
    thick: () => P(`M${n(tx + 4)} ${n(ty - 4)}C${n(tx - 10)} ${n(ty - 3)} ${n(tx - 22)} ${n(ty + 7)} ${n(tx - 28)} ${n(ty + 14)}C${n(tx - 17)} ${n(ty + 14)} ${n(tx - 5)} ${n(ty + 10)} ${n(tx + 4)} ${n(ty + 5)}Z`, tailFur),
    stub: () => E(tx - 0.5, ty, 3.2, 2.4, o.tip ?? dark),
    rope: () => L(`M${n(tx + 2)} ${n(ty)}C${n(tx - 3)} ${n(ty + 4)} ${n(tx - 4)} ${n(ty + 9)} ${n(tx - 3.4)} ${n(ty + Lt * 0.6)}`, tailFur, 1.6) + E(tx - 3.4, ty + Lt * 0.6 + 1.6, 1.4, 2.6, o.tip ?? dark),
    none: () => '',
  }[o.tail ?? 'none']();

  // Head and neck.
  const hr = o.head, sx = cx + len * 0.64, sy = by - bh * 0.22;
  const hx = cx + len * 0.86 + (o.neckF ?? 0) + hr * 0.3, hy = by - bh * 0.45 - (o.neckU ?? 0);
  Object.assign(g, { hx, hy, hr });
  const neck = L(`M${n(sx)} ${n(sy)}L${n(hx - hr * 0.3)} ${n(hy + hr * 0.2)}`, o.neckFur ?? fur, o.neckW ?? hr * 1.5);
  const sl = o.snout ?? 4, sh = o.snoutH ?? hr * 0.5, snoutY = hy + hr * 0.3, tipX = hx + hr * 0.75 + sl, snoutFur = o.snoutFur ?? fur;
  const snout = P(`M${n(hx + hr * 0.2)} ${n(snoutY - sh)}C${n(hx + hr * 0.7 + sl * 0.6)} ${n(snoutY - sh)} ${n(tipX)} ${n(snoutY - sh * 0.75)} ${n(tipX)} ${n(snoutY - sh * 0.1)}C${n(tipX)} ${n(snoutY + sh * 0.7)} ${n(hx + hr * 0.5)} ${n(snoutY + sh)} ${n(hx - hr * 0.1)} ${n(snoutY + sh)}Z`, snoutFur);
  const noseR = o.noseR ?? 1.5;
  const nose = E(tipX - noseR * 0.5, snoutY - sh * 0.42, noseR, noseR * 0.8, o.nose ?? INK);
  const mouth = L(`M${n(tipX - 0.8)} ${n(snoutY + sh * 0.3)}q${n(-sl * 0.4 - 1)} ${n(sh * 0.4)} ${n(-sl * 0.8 - 2.4)} ${n(sh * 0.1)}`, tone(snoutFur, -0.45), 0.7, ' opacity=".7"');
  const ex = hx - hr * 0.3, ey = hy - hr * 0.72, inner = o.inner ?? '#e8a9a6', earFur = o.earFur ?? fur, eh = o.earH ?? hr * 1.05, ew = o.earW ?? hr * 0.85;
  const ear = isFar => {
    const col = isFar ? tone(earFur, -0.2) : earFur, x = isFar ? ex + hr * 0.5 : ex, y = isFar ? ey - 0.4 : ey;
    const shape = {
      point: () => P(`M${n(x - ew / 2)} ${n(y + 3)}L${n(x - ew * 0.2)} ${n(y - eh)}L${n(x + ew / 2)} ${n(y + 2)}Z`, col) + (isFar ? '' : P(`M${n(x - ew * 0.22)} ${n(y + 2)}L${n(x - ew * 0.12)} ${n(y - eh * 0.68)}L${n(x + ew * 0.28)} ${n(y + 1.6)}Z`, inner)),
      round: () => C(x, y + 0.5, eh * 0.5, col) + (isFar ? '' : C(x + 0.3, y + 0.8, eh * 0.26, inner)),
      long: () => rot(E(x, y - eh / 2 + 2, ew / 2, eh / 2, col) + (isFar ? '' : E(x + 0.3, y - eh / 2 + 2.6, ew * 0.24, eh * 0.38, inner)), isFar ? -8 : -22, x, y + 2),
      leaf: () => rot(E(x, y - eh / 2 + 2, ew / 2, eh / 2, col) + (isFar ? '' : E(x, y - eh / 2 + 2.6, ew * 0.22, eh * 0.34, inner)), isFar ? -30 : -58, x, y + 2),
      small: () => C(x, y + 1.6, eh * 0.3, isFar ? tone(dark, -0.1) : dark),
      // Hanging down the side of the head, like a retriever's.
      drop: () => rot(P(`M${n(x - ew * 0.45)} ${n(y + 1)}C${n(x - ew * 0.6)} ${n(y + eh * 0.5)} ${n(x - ew * 0.35)} ${n(y + eh)} ${n(x + ew * 0.05)} ${n(y + eh)}C${n(x + ew * 0.45)} ${n(y + eh * 0.9)} ${n(x + ew * 0.5)} ${n(y + eh * 0.4)} ${n(x + ew * 0.4)} ${n(y + 0.5)}Z`, col), isFar ? 8 : 16, x, y + 1),
      // A big flap behind the head, like an elephant's.
      flap: () => isFar ? '' : P(`M${n(x + ew * 0.1)} ${n(y - eh * 0.1)}C${n(x - ew * 0.8)} ${n(y - eh * 0.25)} ${n(x - ew * 0.95)} ${n(y + eh * 0.5)} ${n(x - ew * 0.55)} ${n(y + eh * 0.95)}C${n(x - ew * 0.3)} ${n(y + eh * 1.15)} ${n(x + ew * 0.05)} ${n(y + eh * 1)} ${n(x + ew * 0.25)} ${n(y + eh * 0.7)}Z`, col)
        + P(`M${n(x - ew * 0.05)} ${n(y + eh * 0.06)}C${n(x - ew * 0.6)} ${n(y + eh * 0.02)} ${n(x - ew * 0.72)} ${n(y + eh * 0.5)} ${n(x - ew * 0.45)} ${n(y + eh * 0.82)}C${n(x - ew * 0.3)} ${n(y + eh * 0.92)} ${n(x - ew * 0.05)} ${n(y + eh * 0.8)} ${n(x + ew * 0.08)} ${n(y + eh * 0.6)}Z`, inner, ' opacity=".55"'),
    }[o.ears ?? 'round']();
    return part(`ear${isFar ? ' far' : ''}`, x, y + 2, shape);
  };
  const cheek = o.cheek ? E(hx + hr * 0.12, hy + hr * 0.5, hr * 0.72, hr * 0.46, o.cheek) : '';
  const eyeX = hx + hr * 0.3, eyeY = hy - hr * 0.14;
  Object.assign(g, { eyeX, eyeY, tipX, snoutY });
  const head = part('head', sx, sy + bh * 0.25, ear(true) + neck + (o.ruff ? o.ruff(g) : '') + C(hx, hy, hr, o.headFur ?? fur) + cheek + snout + nose + mouth
    + (o.face ? o.face(g) : '') + eye(eyeX, eyeY, o.eyeR ?? 1.6) + ear(false) + (o.crown ? o.crown(g) : ''), `;--dip:${o.dip ?? 36}deg`);

  const body = (o.hump ? E(cx + len * 0.32, by - bh * 0.3, len * 0.55, bh * 0.9, fur) : '')
    + E(cx, by, len, bh, fur) + E(cx - len * 0.5, by + bh * 0.04, len * 0.55, bh * (o.rump ?? 1), fur) + E(cx + len * 0.56, by + bh * 0.04, len * 0.46, bh * 0.94, fur)
    + E(cx + len * 0.06, by + bh * 0.56, len * 0.74, bh * 0.4, belly);
  return creature(o.shadow ?? len * 1.15, cx, part('tail', tx + 2, ty, tail) + leg(hindX + 3.2, true, true) + leg(frontX + 3, false, true)
    + part('torso', cx, by, body + (o.mid ? o.mid(g) : '')) + leg(hindX, true, false) + leg(frontX, false, false) + head, o.k ?? 1.3, Math.max(0, legH - bh * 0.3 - 1) * (o.k ?? 1.3), ' quad');
}

const spots = (g, list, fill, r = 1.3) => list.map(([dx, dy]) => C(g.cx + g.len * dx, g.by + g.bh * dy, r, fill, ' opacity=".85"')).join('');
const stripes = (g, list, stroke, w = 1.3) => list.map(dx => L(`M${n(g.cx + g.len * dx)} ${n(g.by - g.bh * 0.96)}q${n(-1.6)} ${n(g.bh * 0.45)} ${n(0.4)} ${n(g.bh * 0.8)}`, stroke, w, ' opacity=".55"')).join('');

const mammals = {
  rabbit: () => quad({ k: 1.45, fur: '#c2aa8f', belly: '#f1e7d8', len: 14, bh: 10.5, legH: 6, legW: 4, haunch: 2.1, rump: 1.08, head: 8, snout: 3.2, snoutH: 4.4, neckU: 4, neckF: -1, ears: 'long', earH: 19, earW: 6.4, inner: '#eab9ae', tail: 'cotton', nose: '#c98a86', noseR: 1.2, eyeR: 1.8, dip: 34, cheek: '#d9c6ad' }),
  squirrel: () => quad({ k: 1.45, fur: '#b5623a', belly: '#f3e0c6', len: 11.5, bh: 8.5, legH: 5, legW: 3.4, haunch: 2, head: 7, snout: 3.4, snoutH: 3.8, neckU: 4, ears: 'point', earH: 6, earW: 4.6, tail: 'squirrel', tailFur: '#a5542f', cheek: '#f3e0c6', eyeR: 1.7, dip: 34, cx: 50 }),
  cat: () => quad({ k: 1.32, fur: '#de9647', belly: '#f8e3c5', len: 16, bh: 8, legH: 14, legW: 3.6, head: 8.2, snout: 2.4, snoutH: 4, neckU: 5, ears: 'point', earH: 8, earW: 7, tail: 'thin', cheek: '#f8e3c5', nose: '#d98592', noseR: 1.1, paw: '#f8e3c5', dip: 40,
    mid: g => stripes(g, [-0.55, -0.25, 0.05, 0.35], '#a8642a'), face: g => L(`M${n(g.hx - 2)} ${n(g.hy - g.hr + 1.2)}v3M${n(g.hx + 1)} ${n(g.hy - g.hr + 0.8)}v3`, '#a8642a', 1, ' opacity=".6"') + L(`M${n(g.tipX - 1)} ${n(g.snoutY)}l5 -1.2M${n(g.tipX - 1)} ${n(g.snoutY + 1)}l5 .6`, '#fff', 0.4, ' opacity=".8"') }),
  // Dogs: one animal, several breeds. "dog" is the mixed breed a new dog starts as.
  dog: () => quad({ k: 1.3, fur: '#a8754a', belly: '#f6ece0', len: 16, bh: 9, legH: 14, legW: 4, head: 8.6, snout: 5.6, snoutH: 4.2, snoutFur: '#f6ece0', neckU: 7, neckF: 1, ears: 'drop', earH: 10, earW: 6.4, earFur: '#6e4a2f', tail: 'thin', tailFur: '#a8754a', cheek: '#f6ece0', paw: '#f6ece0', dip: 46,
    mid: g => E(g.cx - g.len * 0.3, g.by - g.bh * 0.35, g.len * 0.32, g.bh * 0.5, '#f6ece0', ' opacity=".9"'), face: g => E(g.eyeX - 0.2, g.eyeY, g.hr * 0.42, g.hr * 0.36, '#6e4a2f', ' opacity=".55"') }),
  'dog:shiba': () => quad({ k: 1.32, fur: '#d8934a', belly: '#fff4e0', len: 16, bh: 9, legH: 15, legW: 4, head: 8.6, snout: 5.4, snoutH: 4.2, snoutFur: '#fff4e0', neckU: 7, neckF: 1, ears: 'point', earH: 8, earW: 6.5, inner: '#f1c9a5', tail: 'curl', cheek: '#fff4e0', paw: '#fff4e0', dip: 46 }),
  'dog:golden': () => quad({ k: 1.28, fur: '#dba65c', belly: '#f2d29c', len: 17, bh: 9.6, legH: 15, legW: 4.2, head: 8.8, snout: 6, snoutH: 4.4, neckU: 7, neckF: 1, ears: 'drop', earH: 11, earW: 7, earFur: '#c98f45', tail: 'bushy', tailL: 17, tailW: 6, tailA: -34, tip: '#e8bb73', tailFur: '#d39a4f', cheek: '#e8bb73', dip: 46,
    ruff: g => P(`M${n(g.hx - 3)} ${n(g.hy + g.hr * 0.5)}l-4 8l4 -1.6l1 4l4 -6Z`, '#e8bb73') }),
  'dog:corgi': () => quad({ k: 1.34, fur: '#dc8a40', belly: '#fff6ea', len: 16, bh: 9, legH: 5.5, legW: 4.2, haunch: 1.4, head: 8.6, snout: 5, snoutH: 4, snoutFur: '#fff6ea', neckU: 6, neckF: 1, ears: 'point', earH: 11, earW: 8, inner: '#f3c49d', tail: 'stub', tip: '#dc8a40', cheek: '#fff6ea', paw: '#fff6ea', dip: 34,
    face: g => L(`M${n(g.hx - 1)} ${n(g.hy - g.hr + 0.4)}l1.6 ${n(g.hr * 0.9)}`, '#fff6ea', 2, ' opacity=".9"') }),
  'dog:husky': () => quad({ k: 1.28, fur: '#7d8592', belly: '#f4f5f7', len: 17, bh: 9.4, legH: 15, legW: 4.2, head: 8.8, snout: 5.8, snoutH: 4.2, snoutFur: '#f4f5f7', neckU: 7, neckF: 1, ears: 'point', earH: 9, earW: 7, inner: '#f4f5f7', tail: 'curl', tip: '#f4f5f7', cheek: '#f4f5f7', paw: '#f4f5f7', dip: 46,
    face: g => E(g.eyeX - 0.6, g.eyeY - 2.8, 2.4, 1.3, '#f4f5f7') + C(g.eyeX, g.eyeY, 2.6, '#9fd0f0') }),
  'dog:dalmatian': () => quad({ k: 1.26, fur: '#f7f5f0', belly: '#f7f5f0', len: 17, bh: 9, legH: 17, legW: 3.8, head: 8.4, snout: 6, snoutH: 4, neckU: 8, neckF: 1, ears: 'drop', earH: 10, earW: 6, earFur: '#2b2a30', tail: 'thin', tailFur: '#f7f5f0', dip: 48,
    mid: g => spots(g, [[-0.7, -0.4], [-0.45, -0.7], [-0.2, -0.2], [0.05, -0.6], [0.3, -0.25], [0.5, -0.65], [-0.6, 0.1], [0.15, 0.1], [0.65, -0.1]], '#2b2a30', 1.5),
    face: g => C(g.hx - 2.6, g.hy - 2.4, 1.1, '#2b2a30') + C(g.hx + 1.6, g.hy + 2.6, 0.9, '#2b2a30') }),
  'dog:dachshund': () => quad({ k: 1.34, fur: '#8c4a25', belly: '#a65d33', len: 20, bh: 7.4, legH: 5.5, legW: 3.8, haunch: 1.3, head: 7.6, snout: 6.8, snoutH: 3.6, neckU: 5, neckF: 1, ears: 'drop', earH: 12, earW: 6.4, earFur: '#6e3618', tail: 'thin', tailFur: '#8c4a25', dip: 30, cx: 49 }),
  raccoon: () => quad({ k: 1.25, fur: '#8d8b95', belly: '#d6d5dc', dark: '#3d3b46', legFur: '#4c4a55', len: 15, bh: 10.5, legH: 8, legW: 4, hump: true, head: 8.4, snout: 5, snoutH: 3.8, snoutFur: '#efedf2', neckU: 1, ears: 'round', earH: 7, inner: '#efedf2', tail: 'ringed', tailW: 7.5, tailFur: '#a9a7b1', ring: '#3d3b46', dip: 30,
    face: g => E(g.eyeX - 0.4, g.eyeY + 0.6, g.hr * 0.52, g.hr * 0.36, '#3d3b46') + L(`M${n(g.eyeX - 4)} ${n(g.eyeY - 3.4)}q4 -2 8 -.4`, '#efedf2', 1.6) }),
  fox: () => quad({ k: 1.15, fur: '#d8662e', belly: '#fff1e0', legFur: '#3b2f33', haunchFur: '#d8662e', len: 17, bh: 8.2, legH: 14, legW: 3.4, head: 7.8, snout: 7.6, snoutH: 3.6, neckU: 6, neckF: 1, ears: 'point', earH: 10.5, earW: 7, inner: '#3b2f33', tail: 'bushy', tailL: 26, tailW: 9.5, tailA: -10, cheek: '#fff1e0', dip: 46, cx: 50,
    ruff: g => P(`M${n(g.hx - 2)} ${n(g.hy + g.hr * 0.6)}l-5 7l6 -2l1 5l5 -8Z`, '#fff1e0') }),
  fennec: () => quad({ k: 1.4, fur: '#e6c48f', belly: '#fff6e4', len: 13, bh: 7, legH: 11, legW: 3, head: 7, snout: 5, snoutH: 3.2, neckU: 5, ears: 'point', earH: 17, earW: 9.5, inner: '#f0b3a0', tail: 'bushy', tailL: 17, tailW: 6.5, tailA: -14, tip: '#4a3a33', cheek: '#fff6e4', eyeR: 1.7, dip: 44, cx: 50 }),
  deer: () => quad({ k: 1.15, fur: '#b67e4b', belly: '#f3e2c8', len: 17, bh: 9, legH: 27, legW: 2.7, haunch: 1.9, paw: '#3f3029', head: 6.8, snout: 6.4, snoutH: 3.6, neckU: 17, neckF: 4, neckW: 7, ears: 'leaf', earH: 10, earW: 5, tail: 'stub', tip: '#fff', dip: 104, shadow: 17,
    mid: g => spots(g, [[-0.6, -0.5], [-0.3, -0.62], [0, -0.55], [-0.45, -0.15], [-0.1, -0.2], [0.25, -0.5], [-0.75, -0.1]], '#f8ecd8', 1.2),
    crown: g => L(`M${n(g.hx - 1)} ${n(g.hy - g.hr + 1)}c-1 -6 -4 -9 -3 -14M${n(g.hx - 2.6)} ${n(g.hy - g.hr - 5)}l4 -4M${n(g.hx - 3.6)} ${n(g.hy - g.hr - 9)}l-4 -3`, '#8a6a4a', 1.5) }),
  redpanda: () => quad({ k: 1.22, fur: '#c2512b', belly: '#30242a', legFur: '#30242a', haunchFur: '#c2512b', len: 16, bh: 10, legH: 8, legW: 4.4, head: 9, snout: 3.6, snoutH: 3.8, snoutFur: '#fff3e3', neckU: 2, ears: 'point', earH: 7.5, earW: 7.5, inner: '#fff3e3', tail: 'ringed', tailW: 9, tailFur: '#c2512b', ring: '#eda676', cheek: '#fff3e3', dip: 30,
    face: g => E(g.eyeX - 0.6, g.eyeY - 3.2, 2.2, 1.4, '#fff3e3') + L(`M${n(g.eyeX - 0.5)} ${n(g.eyeY + 1.8)}q-1 3 -3.4 4.4`, '#8f3519', 1.3) }),
  otter: () => quad({ k: 1.2, fur: '#7d5a44', belly: '#dcc4a6', len: 20, bh: 7, legH: 5, legW: 4, head: 7.4, snout: 3.4, snoutH: 3.8, snoutFur: '#dcc4a6', neckU: 7, neckF: 1, neckW: 9, ears: 'small', earH: 6, tail: 'thick', tailFur: '#6c4c39', cheek: '#dcc4a6', noseR: 1.7, dip: 30, cx: 52,
    face: g => L(`M${n(g.tipX - 2)} ${n(g.snoutY + 0.4)}l5.4 -.6M${n(g.tipX - 2)} ${n(g.snoutY + 1.4)}l5 1.2`, '#fff', 0.4, ' opacity=".8"') }),
  capybara: () => quad({ k: 1.3, fur: '#a97c52', belly: '#c79b6f', len: 19, bh: 12, legH: 9, legW: 4.4, paw: '#6f4f35', head: 9, snout: 8, snoutH: 6.4, neckU: 1, neckF: 1, ears: 'small', earH: 7, tail: 'none', noseR: 1.8, nose: '#4a3628', dip: 26, cx: 44 }),
  bear: () => quad({ k: 1.25, fur: '#7d573b', belly: '#8f6746', len: 20, bh: 13.5, legH: 12, legW: 6.6, hump: true, head: 10, snout: 5.6, snoutH: 5, snoutFur: '#c9a27c', neckU: 1, neckF: 2, ears: 'round', earH: 7.5, inner: '#5d3f2a', tail: 'stub', noseR: 2, dip: 34, cx: 44 }),
  panda: () => quad({ k: 1.25, fur: '#f7f6f1', belly: '#ecebe4', dark: '#2a2830', legFur: '#2a2830', len: 19, bh: 13.5, legH: 11, legW: 6.6, head: 10.5, snout: 4, snoutH: 4.6, neckU: 1, neckF: 2, ears: 'round', earH: 8, earFur: '#2a2830', inner: '#2a2830', tail: 'stub', tip: '#f7f6f1', noseR: 1.9, dip: 34, cx: 44,
    mid: g => rot(E(g.cx + g.len * 0.6, g.by - g.bh * 0.02, g.len * 0.25, g.bh * 0.99, '#2a2830'), 8, g.cx + g.len * 0.6, g.by),
    face: g => rot(E(g.eyeX - 0.2, g.eyeY + 0.6, 3, 3.8, '#2a2830'), 24, g.eyeX, g.eyeY) }),
  giraffe: () => quad({ k: 1, fur: '#e6b968', belly: '#f3dcb0', len: 15, bh: 9, legH: 32, legW: 2.6, haunch: 1.6, paw: '#3f3029', head: 5.4, snout: 6.2, snoutH: 3.2, snoutFur: '#efd2a0', neckU: 34, neckF: 8, neckW: 6, ears: 'leaf', earH: 7, earW: 3.6, inner: '#f3dcb0', tail: 'rope', tailL: 22, tip: '#5a3a26', eyeR: 1.4, dip: 62, shadow: 15,
    mid: g => [[-0.62, -0.48, 2.3], [-0.28, -0.66, 2.4], [0.06, -0.58, 2.4], [0.4, -0.6, 2.2], [-0.48, -0.02, 2.2], [-0.12, -0.16, 2.4], [0.24, -0.12, 2.2], [0.56, -0.12, 1.9], [-0.8, -0.12, 1.8]].map(([dx, dy, r], i) => rot(P(`M${-r} ${-r * 0.5}L${-r * 0.2} ${-r}L${r} ${-r * 0.6}L${r * 0.8} ${r * 0.7}L${-r * 0.3} ${r}L${-r} ${r * 0.4}Z`, '#a8622e'), i * 23, 0, 0).replace('<g', `<g transform="translate(${n(g.cx + g.len * dx)} ${n(g.by + g.bh * dy)})"><g`) + '</g>').join(''),
    ruff: g => {
      const pts = [0.15, 0.32, 0.5, 0.68, 0.84].map(t => [g.sx + (g.hx - g.sx) * t, g.sy + (g.hy - g.sy) * t]);
      return L(`M${n(g.sx - 2)} ${n(g.sy - 1)}L${n(g.hx - 3.6)} ${n(g.hy + 1)}`, '#8a5530', 2.2) + pts.map(([x, y], i) => E(x + (i % 2 ? 0.8 : -0.6), y, 1.7, 1.3, '#a8622e')).join('');
    },
    crown: g => L(`M${n(g.hx - 1.6)} ${n(g.hy - g.hr + 0.6)}l-.6 -4.2M${n(g.hx + 0.8)} ${n(g.hy - g.hr + 0.4)}l.2 -4.2`, '#8a5530', 1.4) + C(g.hx - 2.2, g.hy - g.hr - 3.8, 1, '#3f3029') + C(g.hx + 1, g.hy - g.hr - 3.9, 1, '#3f3029') }),
  elephant: () => quad({ k: 1, fur: '#9ea0aa', belly: '#9497a2', len: 22, bh: 15, legH: 14, legW: 7.4, haunch: 1.1, paw: '#8a8c96', hump: true, head: 11, snout: 2.4, snoutH: 6, neckU: 1, neckF: -2, neckW: 14, ears: 'flap', earH: 22, earW: 17, inner: '#c9a7ad', tail: 'rope', tailL: 18, noseR: 0.01, nose: '#9ea0aa', eyeR: 1.4, dip: 24, cx: 44, shadow: 26,
    face: g => L(`M${n(g.tipX - 2)} ${n(g.snoutY - 1)}C${n(g.tipX + 3)} ${n(g.snoutY + 6)} ${n(g.tipX + 2)} ${n(g.snoutY + 15)} ${n(g.tipX - 1)} ${n(g.snoutY + 21)}`, '#9ea0aa', 5.4)
      + L(`M${n(g.tipX - 1)} ${n(g.snoutY + 21)}q2 2 4 .6`, '#8a8c96', 3)
      + L(`M${n(g.tipX)} ${n(g.snoutY + 6)}c1 4 1 8 0 11`, '#868893', 0.6, ' opacity=".6"')
      + P(`M${n(g.hx + g.hr * 0.5)} ${n(g.snoutY + 3)}c3 1 6 3 7.4 6c-3 0 -6 -1.6 -8.4 -4Z`, '#f6f1e2') }),
  hedgehog: () => creature(20, 48, part('leg hl far', 36, 84, E(37, 87.6, 3, 2.2, '#b99a78')) + part('leg fl far', 58, 84, E(59, 87.6, 3, 2.2, '#b99a78'))
    + part('torso', 46, 80, P('M22 84C22 70 32 62 46 62C58 62 66 70 67 82C60 88 30 90 22 84Z', '#5f4a3c')
      + [[24, 78, -150], [25, 71, -130], [30, 65, -115], [37, 61.5, -100], [45, 60.5, -88], [53, 62, -72], [60, 66, -55], [65, 72, -40]].map(([x, y, a]) => rot(P(`M${x - 2.4} ${y}L${x + 6} ${y}L${x} ${y + 3}Z`, '#4a382d'), a, x, y)).join('')
      + L('M30 76l-3 -4M37 72l-2 -5M45 70l0 -5M53 72l2 -5M36 80l-3 -3M44 78l-1 -4M52 79l2 -4M60 77l2 -4', '#e8dcc6', 1, ' opacity=".8"')
      + P('M26 84C36 90 58 90 66 82C62 80 34 80 26 84Z', '#e6cfae'))
    + part('leg hl', 32, 84, E(33, 88.2, 3.4, 2.2, '#d7b993')) + part('leg fl', 54, 84, E(55, 88.2, 3.4, 2.2, '#d7b993'))
    + part('head', 58, 80, P('M56 70C64 68 72 72 80 79C81 81 79 83 76 83C68 86 60 86 56 84Z', '#e6cfae') + C(80, 79.6, 1.8, INK) + C(62, 71, 2.6, '#cfae86') + eye(69, 75, 1.5), ';--dip:16deg'), 1.25),
};

// ——— Birds ———

/** A pair of spread wings, hidden until the bird is in the air. They flap about the shoulder. */
const wings = (sx, sy, len, col, dark, extra = '') => {
  const d = `M${n(sx + 5)} ${n(sy + 1)}C${n(sx + 3)} ${n(sy - len * 0.55)} ${n(sx - len * 0.25)} ${n(sy - len * 0.98)} ${n(sx - len * 0.6)} ${n(sy - len * 1.02)}C${n(sx - len * 0.52)} ${n(sy - len * 0.62)} ${n(sx - len * 0.5)} ${n(sy - len * 0.26)} ${n(sx - 8)} ${n(sy + 2)}Z`;
  return [part('wing fly far', sx, sy, P(d, tone(dark, -0.12))), part('wing fly', sx, sy, P(d, col) + extra)];
};
const birdLeg = (x, top, col, far = false) => part(`leg${far ? ' far' : ''}`, x, top, L(`M${x} ${top}V88.4M${x - 2.4} 89h6.4`, far ? tone(col, -0.2) : col, 1.5));

const birds = {
  robin: () => {
    const [farW, nearW] = wings(47, 63, 25, '#7d6047', '#6a5040');
    return creature(13, 48, farW + part('tail', 36, 70, P('M37 67L19 74L21 79L38 73Z', '#5d4636')) + birdLeg(50, 78, '#6b4f40', true) + birdLeg(45, 78, '#7c5c4a')
      + part('torso', 47, 68, rot(E(47, 68, 15, 11.5, '#8a6a4e'), -14, 47, 68) + E(55.5, 68.5, 9, 9.5, '#e2632c') + E(49, 76, 9, 4.2, '#f1e9dc')
        + part('wing fold', 46, 64, rot(E(40.5, 67, 11.5, 6.4, '#6f543d') + L('M33 68q7 3 14 0M32 65.5q7 2.6 15 .4', '#5d4636', 0.8), -20, 40.5, 67)))
      + part('head', 54, 62, C(59, 55, 8.4, '#8a6a4e') + E(62, 57.6, 6, 6, '#e2632c') + P('M66.6 53.4L73.4 56L66.6 58Z', '#4a3b2e') + eye(61.6, 53, 1.6), ';--dip:50deg') + nearW);
  },
  parrot: () => {
    const [farW, nearW] = wings(47, 61, 28, '#d9412f', '#2f7fc1', P('M40 44C36 40 33 37 31 33C33 40 36 48 40 56Z', '#f7c948'));
    return creature(13, 48, farW + part('tail', 36, 70, P('M37 68L6 86L10 90L40 76Z', '#2f7fc1') + P('M37 66L13 79L16 83L39 72Z', '#d9412f')) + birdLeg(50, 77, '#55525c', true) + birdLeg(45, 77, '#6b6770')
      + part('torso', 47, 66, rot(E(47, 66, 15, 11, '#d9412f'), -18, 47, 66)
        + part('wing fold', 46, 62, rot(E(41, 65, 11.5, 6.6, '#f7c948') + E(38, 67.4, 9.6, 4.6, '#2f7fc1') + E(44, 62.6, 8, 3.4, '#d9412f'), -24, 41, 65)))
      + part('head', 54, 60, C(60, 52, 9, '#d9412f') + E(63, 52.4, 5.2, 4.8, '#fbf6ea') + P('M66 46.4C74.4 45.4 78 52 73.6 60C72.6 55.6 70 53.4 66 53.4Z', '#f1e6cf') + P('M66 54.4C69 54.4 71.4 56.4 71.4 59.6C68.4 60.4 66 58.4 66 54.4Z', '#3a3340') + eye(63.4, 51, 1.5), ';--dip:46deg') + nearW);
  },
  owl: () => {
    const [farW, nearW] = wings(46, 60, 30, '#8f6a47', '#7c5a3b', L('M40 50l-7 -12M43 46l-5 -12', '#7c5a3b', 1));
    const disc = x => C(x, 45, 6.6, '#ecd9b6') + part('eye', x, 45, C(x, 45, 3.8, '#f2bd3a') + C(x + 0.4, 45, 2.1, INK) + C(x + 1, 44.2, 0.7, '#fff')) + L(`M${x - 3.4} 45.4q3.4 2.6 6.8 0`, INK, 1.1, ' class="lid" display="none"');
    return creature(13, 50, farW + part('tail', 44, 84, P('M40 82L36 92H52L50 82Z', '#7c5a3b')) + birdLeg(53, 84, '#b98a3a', true) + birdLeg(46, 84, '#d9a53f')
      + part('torso', 49, 70, E(49, 68, 14.5, 19, '#9a724d') + E(51.5, 72, 10, 14, '#e9d2ad') + L('M46 66l3 2.4l3 -2.4M50 72l3 2.4l3 -2.4M45 77l3 2.4l3 -2.4M52 80l2.6 2l2.6 -2', '#b08a5c', 1.1)
        + part('wing fold', 40, 60, P('M36 58C32 66 33 80 39 88C42 80 43 68 41 57Z', '#7c5a3b')))
      + part('head', 50, 56, P('M39 37L37 27L46 33Z', '#7c5a3b') + P('M61 37L64 27L55 33Z', '#7c5a3b') + C(50, 44, 13.5, '#9a724d') + disc(45) + disc(56.4) + P('M49 47.6H52.6L50.8 52Z', '#e9a13b'), ';--dip:30deg') + nearW);
  },
  duck: () => creature(20, 46, part('tail', 24, 70, P('M26 68L13 62L18 75Z', '#34333a') + P('M26 71L16 70L20 76Z', '#f2efe8'))
    + part('leg far', 49, 84, L('M49 83V88.6', '#c9741f', 1.8) + P('M47 89.6L55 89.6L49 87Z', '#c9741f')) + part('leg', 43, 84, L('M43 83V88.6', '#ec8c2c', 1.8) + P('M41 89.6L49.4 89.6L43 87Z', '#ec8c2c'))
    + part('torso', 45, 73, P('M22 72C22 64 34 60 48 60C61 60 69 66 69 74C69 82 58 86 44 86C30 86 22 80 22 72Z', '#c4beb2') + E(60.5, 74, 8.6, 9.4, '#7a4a35') + E(44, 81, 16, 4.4, '#e9e5dc')
      + part('wing fold', 44, 68, P('M27 70C30 63 42 61 55 64C54 72 44 77 30 75Z', '#a39c90') + P('M31 72.6L44 73.6L42 76.2L32 75.4Z', '#3f6fb5') + L('M31 72.2L44.4 73.2', '#fff', 0.8)))
    + part('head', 62, 68, L('M62 69C64.4 61 62.4 55 64.4 50', '#2f6b4f', 7) + L('M60.4 63.6L67.4 62.6', '#f4f1ea', 1.8) + C(65.4, 47, 7.4, '#2f6b4f') + C(63, 44.4, 3, '#3c8663', ' opacity=".7"')
      + P('M71 45.4C77 45 82.6 47.4 82.6 49.6C80.6 52 75 51.6 71 51.4Z', '#e6b83a') + L('M76.4 47.6h1.4', '#8a6a1e', 0.8) + eye(67.4, 45.6, 1.4), ';--dip:52deg')),
  penguin: () => creature(15, 50, part('leg far', 55, 86, E(57, 89, 5.4, 2, '#d9861f')) + part('leg', 44, 86, E(46, 89, 5.4, 2, '#f2a33a'))
    + part('tail', 38, 84, P('M38 80L30 89L42 88Z', '#252839'))
    + part('torso', 49, 68, P('M35 88C30 70 34 47 49 43C64 47 67 70 63 88Z', '#2e3147') + P('M44 88C40 72 44 54 55 50C65 56 66 74 62 88Z', '#fbfbf7') + E(55.4, 54, 6, 3, '#f7d774', ' opacity=".75"')
      + part('wing fold', 42, 54, rot(E(40.4, 66, 4.6, 14, '#232637'), 7, 42, 54)))
    + part('head', 50, 48, C(50, 38, 10.4, '#262939') + E(54.6, 40.6, 5, 4.6, '#fbfbf7') + P('M58.4 35.4L68.4 38.6L58.4 41Z', '#f2a33a') + L('M58.6 38.4L67 38.6', '#b9741c', 0.7) + eye(54.6, 36, 1.5), ';--dip:30deg')),
};

// ——— Small things, and the ones that are neither bird nor beast ———

const small = {
  snail: () => creature(22, 50, part('torso foot', 20, 88, P('M14 89C10 89 10 82 17 82H58C66 82 70 78 72 71C73 66 80 66 80 72C80 83 72 89 62 89Z', '#cbb293') + L('M18 88.4H64', '#b39a7c', 1))
    + part('stalk far', 76, 70, L('M76 69L79 55', '#b89d7e', 1.6) + C(79, 54.4, 1.8, '#b89d7e'))
    + part('stalk', 74, 69, L('M74 69L73 53', '#cbb293', 1.8) + C(73, 52.4, 2.1, INK) + C(73.5, 51.8, 0.6, '#fff'))
    + part('shell', 42, 82, C(42, 66, 19, '#c8793f') + C(42, 66, 19, 'none', ' stroke="#8f5127" stroke-width="1.6"') + L('M42 66m-12 0a12 12 0 1 0 12 -12a8 8 0 1 0 8 8a4.6 4.6 0 1 0 -4.6 4.6', '#8f5127', 2.2) + L('M30 54q6 -6 14 -6', '#e9a56a', 2, ' opacity=".7"'))
    + L('M73 78q2 1.4 4 .4', '#8a7257', 0.8)),
  ladybug: () => creature(18, 50, [[36, 0, 'far'], [50, 1, 'far'], [62, 0, 'far'], [34, 0, ''], [48, 1, ''], [60, 0, '']].map(([x, k, far], i) => part(`leg ${i % 2 ? 'hl' : 'fl'}${far ? ' far' : ''}`, x, 82, L(`M${x} 82l${k ? 0 : (x < 48 ? -3 : 3)} 4.4l${x < 48 ? -2 : 2} 2.6`, INK, 1.4))).join('')
    + part('head', 68, 78, E(71, 79, 8, 7.4, INK) + C(73, 76, 2, '#fff') + L('M74 73q3 -5 7 -5M71 72q1 -6 5 -8', INK, 1) + C(75.4, 78.6, 1, '#fff', ' opacity=".9"'), ';--dip:8deg')
    + part('torso', 46, 84, P('M22 84C22 66 34 56 48 56C62 56 72 66 72 84Z', '#d83a32') + P('M48 56C62 56 72 66 72 84H66C66 70 58 60 48 56Z', '#b92c28') + L('M47 56.4C44 66 44 76 46 84', '#7a1d1c', 1.1)
      + [[32, 74, 3.4], [40, 64, 3], [54, 68, 3.6], [60, 79, 2.8], [34, 81.4, 2], [48, 79, 2.6]].map(([x, y, r]) => C(x, y, r, INK)).join('') + L('M30 66q6 -7 14 -8', '#f08a7e', 2, ' opacity=".8"'))),
  bee: () => creature(9, 50, part('wing buzz far', 50, 62, rot(E(44, 50, 6.4, 13, '#cfe8f6', ' opacity=".7"'), -34, 50, 62))
    + L('M46 76l-2 6M52 77l0 6M58 76l3 5', INK, 1.1)
    + part('torso', 50, 68, P('M22 70L16 68L22 72Z', INK) + E(36, 69, 15, 10.4, '#f5c130') + P('M30 59.6C27 64 27 74 30 78.6L35 79.6C32 74 32 64 35 59Z', INK) + P('M40 59.4C38 65 38 73 40 79L45 77.6C43.4 72 43.4 66 45 60.4Z', INK) + P('M22.6 66C22 68.6 22 71 22.8 73.4L25.6 75.6C24.6 72 24.6 68 25.6 63.6Z', INK)
      + C(56, 67, 9.4, '#e9b021') + C(53, 64, 4, '#f7d35c', ' opacity=".7"'))
    + part('head', 62, 68, C(68, 69, 7, '#2f2b3c') + E(70.6, 68, 2.6, 3.4, '#11101a') + C(71.4, 66.8, 0.8, '#fff') + L('M68 62.6q2 -6 7 -6.4M71 63.4q3 -4 7.4 -3', INK, 1), ';--dip:10deg')
    + part('wing buzz', 52, 62, rot(E(47, 48, 7.4, 15, '#e6f4fc', ' opacity=".85" stroke="#b9d6e8" stroke-width=".6"'), -20, 52, 62))),
  butterfly: () => creature(9, 50, part('wing flap far', 50, 70, P('M50 70C40 48 22 36 15 46C10 56 28 68 50 70Z', '#c9631b') + P('M50 70C34 70 22 76 24 84C28 90 42 82 50 70Z', '#b85a1a'))
    + L('M47 74l-1.6 5M52 74.6l.4 5M57 74l2.4 4.4', INK, 0.9)
    + part('torso', 50, 71, P('M30 72C30 70 34 69 52 68.6C60 68.4 66 69 66 71C66 73 60 74 52 74C34 74 30 74 30 72Z', '#2a2733') + C(68, 70.4, 3.2, '#2a2733') + C(69.2, 69.6, 0.9, '#fff') + L('M69 67.6q2 -7 7 -8.4M70.6 68q4 -5 8.6 -4.6', INK, 0.9))
    + part('wing flap', 50, 70, P('M52 69C46 44 28 26 17 34C8 44 26 64 52 69Z', '#ee8a2b') + P('M52 69C40 34 30 28 20 33C24 31 40 36 52 69Z', '#f6ad55', ' opacity=".7"') + P('M52 70C36 70 24 78 27 87C32 93 46 84 52 70Z', '#e77a22')
      + L('M52 69C44 54 32 40 20 36M52 69C40 58 26 50 16 44M52 70C42 74 32 80 28 86', '#2a2733', 1) + P('M17 34C8 44 26 64 52 69C30 62 16 46 20 33Z', '#2a2733', ' opacity=".85"') + [[17, 41, 1.2], [20, 49, 1.1], [26, 56, 1], [30, 84, 1.1], [35, 87, 1]].map(([x, y, r]) => C(x, y, r, '#fff')).join(''))),
  frog: () => creature(19, 48, part('leg hl far', 36, 76, L('M38 76L27 84L40 88.4', '#3f8a4c', 5))
    + part('torso', 46, 80, P('M26 84C24 72 36 62 52 60C64 59 72 66 72 74C72 82 62 88 46 88C36 88 28 88 26 84Z', '#5fae5c') + part('throat', 60, 78, P('M44 86C52 88 64 84 70 77C66 82 54 84 44 80Z', '#dfe9a8')) + [[36, 70, 2], [44, 66, 1.6], [34, 78, 1.4]].map(([x, y, r]) => C(x, y, r, '#3f8a4c', ' opacity=".6"')).join(''))
    + part('head', 60, 70, C(62, 60, 6, '#5fae5c') + part('eye', 63, 59.4, C(63, 59.4, 3.8, '#f1d86a') + E(63.6, 59.4, 2.2, 2.6, INK) + C(64.4, 58.4, 0.7, '#fff')) + L('M59.4 60q3.6 2.6 7.4 0', INK, 1.1, ' class="lid" display="none"') + L('M58 76q8 2 13.4 -3', '#2f6b3c', 1) + C(70.6, 68.6, 0.6, '#2f6b3c'), ';--dip:12deg')
    + part('leg fl', 60, 80, L('M60 80L62 88.4M59 89h7', '#4c9a55', 3.4))
    + part('leg hl', 36, 76, P('M30 70C38 68 46 74 44 82L30 84C24 80 24 72 30 70Z', '#4c9a55') + L('M34 84L44 88.6M40 89.6h9', '#4c9a55', 3.6))),
  lizard: () => creature(24, 50, part('tail', 34, 84, L('M36 84C24 86 12 88 6 80C4 76 8 74 10 77', '#4f9e68', 4.4))
    + part('leg hl far', 40, 84, L('M40 83l-5 2l-1 4', '#3f8355', 2.6)) + part('leg fl far', 60, 84, L('M60 83l5 1.6l2 4', '#3f8355', 2.6))
    + part('torso', 48, 84, P('M30 84C32 78 42 76 54 76C62 76 68 79 70 83C66 88 40 90 30 84Z', '#5fb37a') + P('M32 85C42 89 62 88 69 84C60 85 44 86 32 85Z', '#d7e9b2') + L('M36 79.4q10 -3 24 -1.4', '#3f8355', 1.4, ' stroke-dasharray="2 3"'))
    + part('head', 68, 83, P('M66 78C74 76 84 79 88 83C86 87 76 88 68 87Z', '#5fb37a') + P('M70 86.4C78 87 84 86 87.4 83.6C82 85 76 85.4 70 85Z', '#d7e9b2') + eye(78, 81, 1.4), ';--dip:8deg')
    + part('leg hl', 38, 85, L('M38 84l-6 2.4l-1 3M31 89.6h4', '#4f9e68', 2.8)) + part('leg fl', 58, 85, L('M58 84l6 2l1.6 3.4M64 89.6h4.4', '#4f9e68', 2.8))),
  turtle: () => creature(24, 48, part('tail', 22, 84, P('M24 82L14 86L24 86Z', '#7fae62'))
    + part('leg hl far', 34, 84, E(35, 86.6, 4.6, 3.4, '#5f8f4c')) + part('leg fl far', 60, 84, E(61, 86.6, 4.6, 3.4, '#5f8f4c'))
    + part('head', 64, 80, L('M62 81C68 80 70 76 73 73', '#8fbf6a', 6) + E(75.4, 71.4, 6.6, 5.6, '#8fbf6a') + L('M78 74q2.4 .4 3.6 -1', '#5f8f4c', 0.8) + eye(77, 70, 1.4), ';--dip:22deg')
    + part('leg hl', 30, 84, E(31, 87.4, 5, 3.4, '#7fae62')) + part('leg fl', 56, 84, E(57, 87.4, 5, 3.4, '#7fae62'))
    + part('torso', 44, 84, P('M20 84C20 68 30 58 44 58C58 58 68 68 68 84Z', '#4f7f52') + P('M18 84H70C70 88 66 88.6 62 88.6H26C22 88.6 18 88 18 84Z', '#d9c98a')
      + L('M32 84L36 72L52 72L56 84M36 72L40 60.6M52 72L48 60.6M24 76L36 72M64 76L52 72', '#39633f', 1.3) + L('M28 68q6 -8 16 -8.4', '#7fae7c', 2, ' opacity=".6"'))),
  seal: () => creature(27, 48, part('tail', 20, 84, P('M24 82C16 78 8 80 6 76C6 84 10 90 18 89C12 88 16 86 26 88Z', '#6f7480'))
    + part('torso', 44, 84, P('M18 82C22 70 38 64 52 62C58 54 66 46 74 46C82 46 86 52 84 60C82 70 74 84 60 88C44 91 24 91 18 82Z', '#8b909c') + P('M26 87C40 90.6 58 90 68 80C74 72 78 64 80 58C76 70 66 80 52 83C42 85 32 86 26 87Z', '#c9ccd4')
      + [[36, 74, 1.4], [44, 70, 1.8], [52, 74, 1.3], [60, 66, 1.6], [30, 80, 1.1], [66, 58, 1.2]].map(([x, y, r]) => C(x, y, r, '#6f7480', ' opacity=".7"')).join(''))
    + part('head', 72, 62, E(79, 53.4, 7, 6, '#8b909c') + E(84.4, 55.4, 3.8, 3.2, '#a5a9b4') + C(87.4, 54, 1.3, INK) + L('M84 56.4l6 .6M84 57.4l5.4 2.4M84 55.6l6 -1.4', '#f2f2f6', 0.45) + eye(79.4, 51.6, 1.9), ';--dip:14deg')
    + part('leg fl', 56, 80, P('M54 78C60 80 64 86 62 90.4C56 90.4 50 86 50 80Z', '#737885'))),
};

export const animals = { ...mammals, ...birds, ...small };
