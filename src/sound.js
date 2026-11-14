// Background sounds and the finishing chime, made in the browser with Web Audio.
// Nothing is downloaded or streamed: each sound is shaped from noise and simple tones.
export const SOUNDS = [
  { id: 'off', name: 'Off' },
  { id: 'rain', name: 'Rain' },
  { id: 'stream', name: 'Stream' },
  { id: 'wind', name: 'Wind in the trees' },
  { id: 'night', name: 'Night crickets' },
  { id: 'fire', name: 'Campfire' },
  { id: 'brown', name: 'Brown noise' },
  { id: 'white', name: 'White noise' },
];

export class Ambience {
  constructor() { this.ctx = null; this.master = null; this.nodes = []; this.timers = []; this.playing = 'off'; this.volume = 0.5; }

  /** Create the audio context. Browsers allow this only after a tap. */
  unlock() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return false;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return true;
  }

  noise(kind = 'white') {
    const ctx = this.ctx, length = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.5; } else data[i] = white;
    }
    // Fade the two ends into each other so the loop has no click.
    const fade = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) { const t = i / fade; data[i] = data[i] * t + data[length - fade + i] * (1 - t); }
    const source = ctx.createBufferSource();
    source.buffer = buffer; source.loop = true; source.loopEnd = (length - fade) / ctx.sampleRate;
    source.start();
    this.nodes.push(source);
    return source;
  }
  filter(type, frequency, q = 0.7) { const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = frequency; f.Q.value = q; this.nodes.push(f); return f; }
  gain(value) { const node = this.ctx.createGain(); node.gain.value = value; this.nodes.push(node); return node; }
  /** A slow wobble applied to an audio parameter. */
  lfo(frequency, depth, param, type = 'sine') {
    const osc = this.ctx.createOscillator(), amount = this.gain(depth);
    osc.type = type; osc.frequency.value = frequency; osc.connect(amount); amount.connect(param); osc.start();
    this.nodes.push(osc);
  }
  chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }
  /** Short bursts at random moments: raindrops, fire crackle. */
  bursts(every, make) {
    const tick = () => { if (this.ctx?.state === 'running') make(); this.timers.push(setTimeout(tick, every[0] + Math.random() * (every[1] - every[0]))); };
    tick();
  }
  click(frequency, level, length) {
    const ctx = this.ctx, t = ctx.currentTime;
    const source = ctx.createBufferSource(), size = Math.floor(ctx.sampleRate * length);
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size) ** 2;
    source.buffer = buffer;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = frequency; f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.value = level;
    source.connect(f); f.connect(g); g.connect(this.out);
    source.start(t);
    source.onended = () => { source.disconnect(); f.disconnect(); g.disconnect(); };
  }

  start(id, volume = this.volume) {
    this.stop();
    this.setVolume(volume);
    if (id === 'off' || !this.unlock()) return;
    this.playing = id;
    this.out = this.gain(0);
    this.out.connect(this.master);
    this.out.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 1.2);
    const to = node => node.connect(this.out);
    if (id === 'white') to(this.chain(this.noise(), this.filter('lowpass', 9000), this.gain(0.16)));
    if (id === 'brown') to(this.chain(this.noise('brown'), this.filter('lowpass', 700), this.gain(0.75)));
    if (id === 'rain') {
      to(this.chain(this.noise(), this.filter('highpass', 900), this.filter('lowpass', 7000), this.gain(0.2)));
      to(this.chain(this.noise('brown'), this.filter('lowpass', 350), this.gain(0.35)));
      this.bursts([40, 160], () => this.click(1800 + Math.random() * 3200, 0.05 + Math.random() * 0.07, 0.03));
    }
    if (id === 'stream') {
      const a = this.filter('bandpass', 900, 1.1), b = this.filter('bandpass', 2400, 1.4);
      this.lfo(0.31, 320, a.frequency); this.lfo(0.73, 700, b.frequency);
      const src = this.noise();
      to(this.chain(src, a, this.gain(0.3)));
      to(this.chain(src, b, this.gain(0.16)));
      to(this.chain(this.noise('brown'), this.filter('lowpass', 260), this.gain(0.3)));
    }
    if (id === 'wind') {
      const f = this.filter('lowpass', 520, 0.9), level = this.gain(0.6);
      this.lfo(0.09, 300, f.frequency); this.lfo(0.13, 0.25, level.gain);
      to(this.chain(this.noise('brown'), f, level));
      const leaves = this.filter('bandpass', 3200, 0.6), rustle = this.gain(0.035);
      this.lfo(0.21, 0.03, rustle.gain);
      to(this.chain(this.noise(), leaves, rustle));
    }
    if (id === 'night') {
      to(this.chain(this.noise('brown'), this.filter('lowpass', 300), this.gain(0.3)));
      for (const [frequency, rate, level] of [[4300, 1.7, 0.02], [3900, 1.1, 0.014]]) {
        const osc = this.ctx.createOscillator(), trill = this.gain(0), phrase = this.gain(0);
        osc.frequency.value = frequency; osc.start(); this.nodes.push(osc);
        this.lfo(31, 0.5, trill.gain, 'square'); trill.gain.value = 0.5;
        this.lfo(rate, level, phrase.gain, 'square'); phrase.gain.value = level;
        to(this.chain(osc, trill, phrase));
      }
    }
    if (id === 'fire') {
      const level = this.gain(0.5);
      this.lfo(0.4, 0.12, level.gain);
      to(this.chain(this.noise('brown'), this.filter('lowpass', 420), level));
      to(this.chain(this.noise(), this.filter('bandpass', 1400, 0.5), this.gain(0.02)));
      this.bursts([70, 420], () => this.click(900 + Math.random() * 3500, 0.12 + Math.random() * 0.25, 0.012 + Math.random() * 0.03));
    }
  }

  stop() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    const nodes = this.nodes, out = this.out;
    this.nodes = []; this.out = null; this.playing = 'off';
    if (!this.ctx || !nodes.length) return;
    try { out?.gain.cancelScheduledValues(this.ctx.currentTime); out?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08); } catch { /* closing */ }
    setTimeout(() => { for (const node of nodes) { try { node.stop?.(); } catch { /* not started */ } try { node.disconnect(); } catch { /* gone */ } } }, 400);
  }

  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
  }

  /** Three soft bell notes when a session finishes. */
  chime() {
    if (!this.unlock()) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.02;
    [[659.25, 0], [880, 0.16], [1318.5, 0.34]].forEach(([frequency, delay]) => {
      for (const [mult, level] of [[1, 0.2], [2.01, 0.05]]) {
        const osc = ctx.createOscillator(), g = ctx.createGain();
        osc.frequency.value = frequency * mult;
        g.gain.setValueAtTime(0, t0 + delay);
        g.gain.linearRampToValueAtTime(level * Math.max(0.35, this.volume), t0 + delay + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 1.6);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t0 + delay); osc.stop(t0 + delay + 1.7);
      }
    });
  }
}
