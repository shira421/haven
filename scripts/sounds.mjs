// Makes the notification sounds for the phone apps from the same notes the web app plays
// (src/sound.js): chime.wav when a session finishes, wilt.wav when one is lost.
// Run: node scripts/sounds.mjs. Writes into android/app/src/main/res/raw and ios/Haven/Sounds.
import { mkdirSync, writeFileSync } from 'node:fs';

const RATE = 22050;
function render(notes, length) {
  const n = Math.round(length * RATE), out = new Float32Array(n);
  for (const { frequency, at, level, decay = 1.6 } of notes) {
    for (const [mult, share] of [[1, 1], [2.01, 0.25]]) {
      const start = Math.round(at * RATE);
      for (let i = start; i < n; i++) {
        const t = (i - start) / RATE;
        if (t > decay + 0.1) break;
        // A 15 ms rise, then an exponential fall to -80 dB over `decay` seconds, as in the browser.
        const env = t < 0.015 ? t / 0.015 : Math.pow(0.0001, (t - 0.015) / (decay - 0.015));
        out[i] += Math.sin(2 * Math.PI * frequency * mult * t) * env * level * share;
      }
    }
  }
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const gain = 0.8 / peak, fadeFrom = n - Math.round(0.05 * RATE);
  const pcm = Buffer.alloc(44 + n * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(RATE, 24);
  pcm.writeUInt32LE(RATE * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const fade = i > fadeFrom ? (n - i) / (n - fadeFrom) : 1;
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(out[i] * gain * fade * 32767))), 44 + i * 2);
  }
  return pcm;
}

// The finishing chime: three rising bell notes (E5, A5, E6).
const chime = render([{ frequency: 659.25, at: 0, level: 0.2 }, { frequency: 880, at: 0.16, level: 0.2 }, { frequency: 1318.5, at: 0.34, level: 0.2 }], 2.1);
// A lost session: the same bell, falling and lower (E5, C5, A4), a little slower.
const wilt = render([{ frequency: 659.25, at: 0, level: 0.2, decay: 1.4 }, { frequency: 523.25, at: 0.22, level: 0.2, decay: 1.4 }, { frequency: 440, at: 0.46, level: 0.22, decay: 1.8 }], 2.4);

for (const dir of ['android/app/src/main/res/raw', 'ios/Haven/Sounds']) {
  mkdirSync(new URL(`../${dir}/`, import.meta.url), { recursive: true });
  writeFileSync(new URL(`../${dir}/chime.wav`, import.meta.url), chime);
  writeFileSync(new URL(`../${dir}/wilt.wav`, import.meta.url), wilt);
}
console.log('chime.wav', chime.length, 'bytes; wilt.wav', wilt.length, 'bytes');
