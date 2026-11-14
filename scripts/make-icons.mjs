// Draws the app icon and writes every size the web app and the phone apps need.
//   npm run icons
import { Resvg } from '@resvg/resvg-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { ART } from '../src/art.js';

// A fox on a small island under a low sun. `pad` shrinks the picture for maskable and iOS icons.
function icon({ pad = 0, round = 112 } = {}) {
  const s = 1 - pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fb7f0"/><stop offset="1" stop-color="#d5eefc"/></linearGradient></defs>
<rect width="512" height="512" rx="${round}" fill="url(#g)"/>
<g transform="translate(${256 * (1 - s)} ${256 * (1 - s)}) scale(${s})">
<circle cx="372" cy="150" r="66" fill="#fff3bf" opacity=".5"/><circle cx="372" cy="150" r="44" fill="#f9c846"/>
<path d="M56 388 256 288l200 100-200 100Z" fill="#8fce6e"/><path d="M56 388l200 100v40L56 428Z" fill="#9a6f4c"/><path d="M456 388 256 488v40l200-100Z" fill="#7b593d"/>
<g transform="translate(96 96) scale(3.2)">${ART.fox()}</g></g></svg>`;
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
