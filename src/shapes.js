// The small set of SVG shape helpers every drawing is built from. They return SVG text.

export const n = v => Math.round(v * 100) / 100;
/** Mix a hex colour with white (k > 0) or black (k < 0). */
export function tone(hex, k) {
  const v = parseInt(hex.slice(1), 16);
  const target = k > 0 ? 255 : 0, a = Math.abs(k);
  const ch = s => Math.round(((v >> s) & 255) * (1 - a) + target * a);
  return '#' + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('');
}
export const E = (cx, cy, rx, ry, fill, extra = '') => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}"${extra}/>`;
export const C = (cx, cy, r, fill, extra = '') => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}"${extra}/>`;
export const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
export const L = (d, stroke, width, extra = '', cap = 'round') => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="${cap}" stroke-linejoin="round"${extra}/>`;
export const G = (content, transform) => `<g transform="${transform}">${content}</g>`;
export const rot = (content, deg, x, y) => G(content, `rotate(${deg} ${x} ${y})`);
export const mirror = content => content + G(content, 'translate(100 0) scale(-1 1)');
export const shadow = (rx = 20, cx = 50) => E(cx, 91, rx, rx * 0.2, '#1f2240', ' opacity=".14"');
export const INK = '#2a2740';
