// Runs a focus session from start to finish: the clock, leaving and coming back, finishing,
// giving up, pomodoro breaks, and sessions shared with friends. It owns no screen; it tells
// listeners what happened and they draw it.
import { progress, awayVerdict, LIMITS, warnAfter, formatAway } from './core.js';
import { speciesById } from './catalog.js';
import * as device from './device.js';

const MIN = 60000;

export class Timer {
  constructor({ store, social, sound, now = () => Date.now(), native = () => Boolean(device.bridge()) }) {
    this.store = store; this.social = social; this.sound = sound; this.now = now; this.native = native;
    this.listeners = new Set();
    this.interval = null; this.completing = false; this.lastBeat = 0;
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, payload) { for (const fn of this.listeners) fn(type, payload); }
  get active() { return this.store.state.active; }
  get cycle() { return this.store.state.cycle; }
  get settings() { return this.store.state.settings; }
  endOf(active) { return active.planned ? active.start + active.planned * MIN : active.start + LIMITS.maxMinutes * MIN; }

  // ——— Starting ———

  /** Start a session with the current settings, or with what is passed. */
  start({ minutes = this.settings.minutes, species = this.settings.species, tag = this.settings.tag, mode = this.settings.mode } = {}) {
    let round = null;
    if (mode === 'pomodoro') {
      const c = this.cycle && !this.cycle.done ? this.cycle : { round: 1, rounds: this.settings.pomodoro.rounds };
      this.store.setCycle({ round: c.round, rounds: c.rounds, breakUntil: null, breakKind: 'short' });
      minutes = this.settings.pomodoro.focus;
      round = c.round;
      device.cancelNotification('break');
    } else if (this.cycle) this.store.setCycle(null);
    const r = this.store.begin({ minutes, species, tag, mode, round });
    if (!r.ok) return r;
    this.afterBegin(r.active);
    this.social.sessionStarted(r.active).then(seen => { if (seen && this.active?.id === r.active.id) this.store.markRemote(); });
    return r;
  }

  /** A room the person is in has started: begin the same session here, on the server's clock. */
  startRoom(room) {
    if (!this.social.account || room.state !== 'running') return;
    const id = this.social.roomSessionId(room);
    if (this.active || this.store.state.sessions.some(s => s.id === id)) return;
    const mine = room.members.find(m => m.id === this.social.account.id);
    if (!mine || mine.status !== 'focusing') return;
    const species = this.store.state.unlocked.includes(mine.species) ? mine.species : this.settings.species;
    if (this.cycle) this.store.setCycle(null);
    const r = this.store.begin({ minutes: room.minutes, species, tag: this.settings.tag, mode: 'timer', room: room.code, id, start: room.start - this.social.offset });
    if (!r.ok) return;
    this.store.markRemote();
    this.afterBegin(r.active);
  }

  afterBegin(active) {
    const s = this.settings, species = speciesById(active.species);
    if (s.keepAwake) device.keepAwake(true);
    if (s.sound !== 'off') this.sound.start(s.sound, s.volume); else this.sound.unlock();
    if (active.planned && s.notify.done) device.notifyAt('session', this.endOf(active), species.kind === 'animal' ? `The ${species.name.toLowerCase()} has arrived` : `Your ${species.name.toLowerCase()} is fully grown`, `${active.planned} min focused. Open Haven to see it.`);
    this.run();
    this.emit('started', active);
  }

  run() {
    clearInterval(this.interval);
    this.interval = setInterval(() => this.tick(), 250);
    this.tick();
  }
  halt() {
    if (!this.cycle?.breakUntil) { clearInterval(this.interval); this.interval = null; }
    device.keepAwake(false);
    this.sound.stop();
    device.cancelNotification('session');
    device.cancelNotification('away');
  }

  // ——— While it runs ———

  tick() {
    const active = this.active, now = this.now();
    if (!active) return this.tickBreak(now);
    // A browser keeps running while hidden, so it can tell the moment the allowance runs out.
    // The apps are paused in the background and are judged when they come back (see visible()).
    if (active.hiddenAt && !this.native()) {
      const until = Math.min(now, this.endOf(active));
      if (active.deep && !this.warned && until - active.hiddenAt >= warnAfter(active.allowance) * 1000) { this.warned = true; this.warn(active, 'now'); }
      if (awayVerdict({ deep: active.deep, allowance: active.allowance, hiddenAt: active.hiddenAt, now: until }) === 'withered') return this.fail('left', { away: Math.round((until - active.hiddenAt) / 1000) });
    }
    const p = progress(active, now);
    if (p.done) return this.complete();
    if (!active.hiddenAt && now - this.lastBeat > 10000) { this.lastBeat = now; this.store.beat(now); }
    this.emit('tick', { ...p, starting: Math.max(0, (active.start - now) / 1000) });
  }

  /** Haven went to the background or the screen turned off. */
  hidden() {
    const active = this.active;
    if (!active || active.hiddenAt) return;
    const at = this.now();
    this.store.markHidden(at);
    this.warned = false;
    // The apps are paused in the background, so the warning is left with the phone to show.
    // If this was only the phone locking, the phone takes the warning back (see the native code).
    if (active.deep && this.native()) this.warn(active, at + warnAfter(active.allowance) * 1000);
  }

  /** "Come back": sent a third of the way through the time someone may be away. */
  warn(active, at) {
    if (!this.settings.notify.away) return;
    const species = speciesById(active.species);
    const what = species.kind === 'animal' ? `the ${species.name.toLowerCase()} will leave` : species.kind === 'nature' ? `your ${species.name.toLowerCase()} will be left unfinished` : `your ${species.name.toLowerCase()} will wither`;
    const left = active.allowance - warnAfter(active.allowance);
    const title = 'Come back to Haven';
    const body = `You left a session. Come back within ${formatAway(left)} or ${what}.`;
    if (at === 'now') device.notifyNow(title, body, 'away'); else device.notifyAt('away', at, title, body);
  }

  /** Haven is in front again: decide whether the time away cost the session. */
  async visible() {
    const active = this.active;
    device.cancelNotification('away');
    this.warned = false;
    if (!active) { this.tick(); return; }
    const leftAt = active.hiddenAt || null;
    if (leftAt) {
      let locked = false;
      if (this.native()) { const away = await device.lastAway(); locked = Boolean(away?.locked && Math.abs(away.at - leftAt) < 8000); }
      if (this.active?.id !== active.id) return;
      const until = Math.min(this.now(), this.endOf(active));
      if (awayVerdict({ deep: active.deep, allowance: active.allowance, hiddenAt: leftAt, now: until, locked }) === 'withered') return this.fail('left', { away: Math.round((until - leftAt) / 1000) });
      this.store.markVisible();
    }
    if (this.settings.keepAwake) device.keepAwake(true);
    this.tick();
  }

  /** The app was closed and opened again while a session or a break was running. */
  async resume() {
    const active = this.active;
    if (active) {
      // If Haven was closed without being hidden first, the last heartbeat stands in for when it left.
      if (!active.hiddenAt && active.beat && this.now() - active.beat > 15000) this.store.markHidden(active.beat);
      await this.visible();
      if (this.active) this.run();
    } else if (this.cycle?.breakUntil) this.run();
  }

  // ——— Ending ———

  /** The time is up, or a stopwatch was stopped. */
  async complete() {
    const active = this.active;
    if (!active || this.completing) return;
    this.completing = true;
    try {
      let others = 0;
      if (active.room) {
        const answer = await this.social.sessionEnded(active.id, 'done');
        if (this.active?.id !== active.id) return;
        if (answer?.status === 'failed') return this.fail('friend-left');
        const room = this.social.data.room;
        others = answer?.status === 'done' ? answer.others : room ? room.members.filter(m => m.id !== this.social.account?.id && ['focusing', 'done'].includes(m.status)).length : 0;
      }
      const result = this.store.finish({ others });
      if (!result.ok) return;
      this.halt();
      if (result.short) {
        if (active.remote) this.social.sessionEnded(active.id, 'done');
        this.emit('short', result);
        return;
      }
      if (this.settings.chime) this.sound.chime();
      if (this.settings.haptics) device.haptic('success');
      if (active.room) this.store.markSynced([active.id]);
      else if (active.remote) this.social.sessionEnded(active.id, 'done').then(answer => { if (answer) this.store.markSynced([active.id]); });
      else this.social.syncSessions().catch(() => {});
      this.social.pushCard();
      this.social.scheduleBackup();
      if (active.mode === 'pomodoro') this.beginBreak();
      this.emit('finished', { ...result, active });
    } finally { this.completing = false; }
  }

  fail(reason, extra = {}) {
    const active = this.active;
    if (!active) return;
    const r = this.store.fail(reason);
    this.halt();
    if (this.cycle) { this.store.setCycle(null); device.cancelNotification('break'); clearInterval(this.interval); this.interval = null; }
    if (this.settings.haptics) device.haptic('warning');
    if (active.remote || active.room) this.social.sessionEnded(active.id, 'failed');
    this.emit('failed', { session: r.session, reason, ...extra });
  }

  /** Seconds left in which the session can be cancelled without a trace. */
  cancelLeft() {
    const active = this.active;
    if (!active || active.room) return 0;
    return Math.max(0, LIMITS.cancelSeconds - (this.now() - active.start) / 1000);
  }
  /** Stop early: a free cancel in the first seconds, otherwise the plant withers. */
  giveUp() {
    const active = this.active;
    if (!active) return;
    if (this.cancelLeft() > 0) {
      this.store.cancel();
      this.halt();
      if (this.cycle) this.store.setCycle(null);
      if (active.remote) this.social.sessionEnded(active.id, 'failed');
      this.emit('cancelled', active);
    } else this.fail('gave-up');
  }

  // ——— Pomodoro breaks ———

  beginBreak() {
    const c = this.cycle || { round: 1, rounds: this.settings.pomodoro.rounds };
    const last = c.round >= c.rounds;
    const minutes = last ? this.settings.pomodoro.long : this.settings.pomodoro.short;
    const breakUntil = this.now() + minutes * MIN;
    this.store.setCycle({ round: last ? c.rounds : c.round + 1, rounds: c.rounds, breakUntil, breakKind: last ? 'long' : 'short', ...(last ? { done: true } : {}) });
    device.notifyAt('break', breakUntil, 'Break over', last ? 'That was the last round. Well done.' : `Round ${c.round + 1} of ${c.rounds} is ready.`);
    this.run();
  }
  breakLeft() { return this.cycle?.breakUntil ? Math.max(0, (this.cycle.breakUntil - this.now()) / 1000) : 0; }
  tickBreak(now) {
    const c = this.cycle;
    if (!c?.breakUntil) { clearInterval(this.interval); this.interval = null; return; }
    if (now < c.breakUntil) { this.emit('break-tick', (c.breakUntil - now) / 1000); return; }
    this.endBreak(true);
  }
  /** The break is over, or was skipped. Starts the next round when that is what the settings say. */
  endBreak(timeUp = false) {
    const c = this.cycle;
    if (!c) return;
    device.cancelNotification('break');
    clearInterval(this.interval); this.interval = null;
    if (c.done) { this.store.setCycle(null); this.emit('cycle-done'); return; }
    this.store.setCycle({ ...c, breakUntil: null });
    if (timeUp && this.settings.chime) this.sound.chime();
    if (!timeUp || this.settings.pomodoro.auto) this.start({ mode: 'pomodoro' }); else this.emit('break-over', c);
  }
  /** Stop the pomodoro run between rounds. */
  endCycle() {
    device.cancelNotification('break');
    clearInterval(this.interval); this.interval = null;
    this.store.setCycle(null);
    this.emit('cycle-done');
  }
}
