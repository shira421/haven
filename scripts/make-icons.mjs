// Draws the app icon and writes every size the web app and the phone apps need.
//   npm run icons
import { Resvg } from '@resvg/resvg-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { ART } from '../src/art.js';

// A floating island at dusk: a cherry tree in blossom and a rabbit in front of a big low sun.
// `pad` shrinks the picture for maskable and iOS icons, which are cut to shape by the phone.
const BLOSSOM = [[170, 250, 44], [262, 246, 46], [216, 212, 54], [184, 214, 38], [252, 206, 40], [214, 260, 44]];
const LIGHT = [[160, 236, 14], [204, 192, 18], [246, 226, 15], [272, 244, 12], [228, 250, 12], [188, 262, 10]];
function icon({ pad = 0, round = 112 } = {}) {
  const s = 1 - pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3f8f"/><stop offset=".62" stop-color="#7b6cc4"/><stop offset="1" stop-color="#f2a17a"/></linearGradient>
<radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe7a3" stop-opacity=".85"/><stop offset="1" stop-color="#ffe7a3" stop-opacity="0"/></radialGradient>
<linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ee07a"/><stop offset="1" stop-color="#6cbf59"/></linearGradient>
</defs>
<rect width="512" height="512" rx="${round}" fill="url(#sky)"/>
<g transform="translate(${256 * (1 - s)} ${256 * (1 - s)}) scale(${s})">
<circle cx="256" cy="226" r="190" fill="url(#glow)"/><circle cx="256" cy="226" r="118" fill="#ffd166"/>
<g opacity=".9" fill="#fff"><ellipse cx="96" cy="150" rx="46" ry="15"/><ellipse cx="118" cy="138" rx="26" ry="18"/><ellipse cx="420" cy="118" rx="38" ry="12"/><ellipse cx="402" cy="108" rx="20" ry="14"/></g>
<path d="M66 352 256 257l190 95-190 95Z" fill="url(#grass)"/>
<path d="M66 352l190 95v34L66 386Z" fill="#a8774f"/><path d="M446 352 256 447v34l190-95Z" fill="#7d5639"/>
<path d="M66 352l190 95 190-95v9l-190 95-190-95Z" fill="#5aa64a" opacity=".55"/>
<ellipse cx="218" cy="350" rx="56" ry="16" fill="#3e7f3a" opacity=".35"/>
<path d="M212 352c2-34 2-62-4-92h22c-6 30-6 58-2 92Z" fill="#8a5a3c"/>
<path d="M219 300c-16-14-30-18-44-16M222 290c12-16 26-22 42-22" stroke="#8a5a3c" stroke-width="7" stroke-linecap="round" fill="none"/>
${BLOSSOM.map(([x, y, r]) => `<circle cx="${x + 5}" cy="${y + 7}" r="${r}" fill="#e889ad"/>`).join('')}
${BLOSSOM.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#f7b3cc"/>`).join('')}
${LIGHT.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffd9e6"/>`).join('')}
<g transform="translate(266 278) scale(1.15)">${ART.rabbit()}</g></g></svg>`;
}

const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
await mkdir('public/icons', { recursive: true });
await mkdir('ios/Haven/Assets.xcassets/AppIcon.appiconset', { recursive: true });
await mkdir('android/app/src/main/res/mipmap-xxxhdpi', { recursive: true });
await writeFile('public/icons/icon.svg', icon());
await writeFile('public/icons/icon-192.png', png(icon(), 192));
await writeFile('public/icons/icon-512.png', png(icon(), 512));
await writeFile('public/icons/maskable-512.png', png(icon({ pad: 0.1, round: 0 }), 512));
await writeFile('public/icons/apple-touch-icon.png', png(icon({ pad: 0.04, round: 0 }), 180));
await writeFile('ios/Haven/Assets.xcassets/AppIcon.appiconset/icon-1024.png', png(icon({ pad: 0.04, round: 0 }), 1024));
await writeFile('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', png(icon({ round: 112 }), 192));
await writeFile('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png', png(icon({ pad: 0.17, round: 0 }), 432));
console.log('Icons written.');
