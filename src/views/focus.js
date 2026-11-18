// The home screen: your haven under the sky. Choose what to grow and for how long, then watch a
// day pass over it while the plant grows where it was planted and the animals go about their lives.
import { e, $, icon, segmented, openDialog, closeDialog, toast, field, switchRow, avatar, formError } from '../ui.js';
import { LIMITS, formatClock, formatMinutes, progress, streaks, startOfDay, doneSessions, coinsFor, treatsFor, sizeFor, isNight, formatAway, awayWords } from '../core.js';
import { speciesById, KINDS, ofKind } from '../catalog.js';
import { sprite, stageAt } from '../art.js';
import { skyHTML, skyUpdate, skyNow, worldHTML, thingsFromStore } from '../scene.js';
import { drawing } from '../art.js';
import * as haven from './haven.js';

const MODES = [['timer', 'Timer'], ['stopwatch', 'Stopwatch'], ['pomodoro', 'Pomodoro']];
const lower = s => s.name.toLowerCase();

/** The haven as it stands, plus whatever the running session is growing, where it was planted. */
function world(app, stage = null) {
  const { store } = app, active = store.state.active, side = store.side(), things = thingsFromStore(store);
  if (active && stage !== null) {
    const [u, v] = active.spot || [side / 2, side / 2];
    things.push({ species: active.species, size: sizeFor(active.planned || 25), u, v, stage, cls: 'sprouting' });
  }
  return `<div class="world-wrap">${worldHTML({ side, things, interactive: true, label: 'Your haven' })}</div>`;
}
const awayText = settings => (settings.deep ? `Don't leave for more than ${awayWords(settings.allowance)}.` : 'Deep focus is off.');

export function render(app) {
  const { store } = app;
  if (store.state.active) return running(app);
  if (store.state.cycle?.breakUntil) return onBreak(app);
  return idle(app);
}

function idle(app) {
  const { store, social } = app, s = store.state.settings, now = app.now();
  const species = speciesById(s.species), sky = skyNow(new Date(now));
  const today = doneSessions(store.state.sessions).filter(x => x.start >= startOfDay(now)).reduce((n, x) => n + x.minutes, 0);
  const streak = streaks(store.state.sessions, now).current;
  const cycle = store.state.cycle;
  const length = s.mode === 'stopwatch' ? 'Open' : s.mode === 'pomodoro' ? `${s.pomodoro.rounds} × ${s.pomodoro.focus} min` : formatMinutes(s.minutes);
  const clock = s.mode === 'stopwatch' ? '00:00' : formatClock((s.mode === 'pomodoro' ? s.pomodoro.focus : s.minutes) * 60);
  const room = social.data.room?.state === 'lobby' ? social.data.room : null, arranging = app.ui.edit.on, feeding = !arranging && app.ui.feeding && store.animals().length > 0;
  const startLabel = s.mode === 'pomodoro' && cycle && !cycle.done ? `Start round ${cycle.round} of ${cycle.rounds}` : 'Start focusing';
  const panel = arranging ? haven.arrangePanel(app) : feeding ? haven.feedingPanel(app) : `<div class="panel">
${room ? `<div class="notice"><p>You're at a campfire${room.members.length > 1 ? ` with ${room.members.length - 1} ${room.members.length === 2 ? 'friend' : 'friends'}` : ''}.</p><button class="secondary" data-action="open-room">Go to it</button></div>` : ''}
${segmented('mode', MODES, s.mode, 'How to time the session')}
<div class="choosers">
<button class="chooser" data-action="choose-length"><span>Length</span><b>${e(length)}</b></button>
<button class="chooser" data-action="choose-species"><span>${species.kind === 'nature' ? 'Building' : 'Growing'}</span><b>${e(species.name)}</b></button>
<button class="chooser" data-action="choose-tag"><span>Tag</span><b><i class="dot" style="background:${store.tagColour(s.tag)}"></i>${e(store.tagName(s.tag))}</b></button>
</div>
<button class="primary wide" data-action="start">${startLabel}</button>
${cycle && !cycle.done && s.mode === 'pomodoro' ? '<button class="secondary wide" data-action="end-cycle">End pomodoro</button>' : ''}
<p class="note">${e(awayText(s))} <button class="linklike" data-action="settings" data-section="focus">Change</button></p>
${today || streak > 1 ? `<p class="note">${today ? `Today: ${formatMinutes(today)}.` : ''}${streak > 1 ? ` ${streak} days in a row.` : ''}</p>` : ''}
</div>`;
  return `<section class="page focus${arranging ? ' arranging' : ''}${feeding ? ' feeding' : ''}" data-page="focus"><h1 class="page-title sr-only">Haven</h1>
<div class="scene${sky.night ? ' night' : ''}">${skyHTML({ t: sky.t ?? 0.5, night: sky.night, showArc: false })}
${arranging ? '<p class="scene-label">Arranging</p>' : feeding ? '<p class="scene-label">Feeding</p>' : `<button class="clock" data-action="choose-length" aria-label="Session length, ${e(length)}. Change">${clock}</button>`}
${world(app)}${arranging || feeding ? '' : haven.tools(app)}</div>
<div class="care-slot" aria-live="polite">${arranging ? '' : haven.chipHTML(app)}</div>
${panel}</section>`;
}

function running(app) {
  const { store, timer, social } = app, active = store.state.active, now = app.now();
  const species = speciesById(active.species), p = progress(active, now);
  const room = active.room ? social.data.room : null;
  const label = active.mode === 'pomodoro' && active.round ? `Round ${active.round} of ${store.state.cycle?.rounds || store.state.settings.pomodoro.rounds}` : active.room ? 'Round the campfire' : active.planned ? '' : 'Stopwatch';
  const verb = species.kind === 'animal' ? `Waiting for a ${lower(species)}.` : species.kind === 'nature' ? `Building a ${lower(species)}.` : `Growing a ${lower(species)}.`;
  const rule = active.deep ? ` Don't leave for more than ${awayWords(active.allowance)}.` : '';
  const members = room ? `<ul class="room-strip" aria-label="Round the campfire">${room.members.map(m => `<li class="${m.status}">${avatar(m.avatar)}<span>${e(m.id === social.account?.id ? 'You' : m.name)}</span><small>${m.status === 'focusing' ? 'Focusing' : m.status === 'done' ? 'Finished' : 'Left'}</small></li>`).join('')}</ul>` : '';
  return `<section class="page focus running" data-page="focus"><h1 class="page-title sr-only">Focusing</h1>
<div class="scene">${skyHTML({ t: p.fraction })}
${label ? `<p class="scene-label">${e(label)}</p>` : ''}
<div class="clock" role="timer" aria-live="off">${clockText(active, p, now)}</div>
${world(app, stageAt(p.fraction))}</div>
<div class="care-slot" aria-live="polite">${haven.chipHTML(app)}</div>
<div class="panel">
<p class="status">${e(verb + rule)}</p>${members}
<div class="button-row">
<button class="secondary danger" data-action="give-up">${giveUpLabel(timer)}</button>
${active.planned ? '' : '<button class="primary" data-action="finish">Finish</button>'}
<button class="iconbutton" data-action="sounds" aria-label="Sounds">${icon(store.state.settings.sound === 'off' ? 'mute' : 'sound')}</button>
</div></div></section>`;
}

function onBreak(app) {
  const { store, timer } = app, c = store.state.cycle, s = store.state.settings;
  const text = c.done ? 'Long break. That was the last round.' : `${c.breakKind === 'long' ? 'Long break' : 'Break'}. Round ${c.round} of ${c.rounds} next.`;
  return `<section class="page focus break" data-page="focus"><h1 class="page-title sr-only">Break</h1>
<div class="scene">${skyHTML({ t: 0.5, showArc: false })}<p class="scene-label">Break</p>
<div class="clock" role="timer" aria-live="off">${formatClock(timer.breakLeft())}</div>
${world(app)}</div>
<div class="panel"><p class="status">${e(text)}</p>
<div class="button-row">${c.done ? '<button class="primary" data-action="skip-break">Finish</button>' : `<button class="secondary" data-action="end-cycle">End pomodoro</button><button class="primary" data-action="skip-break">Start round ${c.round} now</button>`}</div>
</div></section>`;
}

const clockText = (active, p, now) => (now < active.start ? `in ${Math.ceil((active.start - now) / 1000)}` : formatClock(p.stopwatch ? Math.floor(p.elapsed) : p.remaining));
const giveUpLabel = timer => { const left = Math.ceil(timer.cancelLeft()); return left > 0 ? `Cancel (${left})` : 'Give up'; };

/** Update the running screen in place. Called a few times a second. */
export function tick(app, p) {
  const { store, timer } = app, active = store.state.active;
  const root = $('.page.focus.running');
  if (!active || !root) return;
  const now = app.now();
  const clock = $('.clock', root), text = clockText(active, p, now);
  if (clock.textContent !== text) clock.textContent = text;
  const give = $('[data-action="give-up"]', root), label = giveUpLabel(timer);
  if (give && give.textContent !== label) give.textContent = label;
  const stage = stageAt(p.fraction), plant = $('.ent.sprouting', root);
  if (plant && Number(plant.dataset.stage) !== stage) {
    plant.dataset.stage = stage;
    plant.querySelector('.alive').innerHTML = drawing(active.species, { kind: speciesById(active.species).kind, stage });
    plant.classList.toggle('growing', stage < 3);
    plant.classList.remove('grew'); void plant.offsetWidth; plant.classList.add('grew');
  }
  skyUpdate($('.sky', root), p.fraction);
  root.querySelector('.scene').classList.toggle('late', p.fraction > 0.93);
}
export function tickBreak(app, seconds) {
  const clock = $('.page.focus.break .clock');
  if (clock) clock.textContent = formatClock(seconds);
}

// ——— Dialogs ———

function lengthDialog(app) {
  const s = app.store.state.settings;
  if (s.mode === 'stopwatch') { toast('A stopwatch has no set length. Run it for 10 min or more.'); return; }
  if (s.mode === 'pomodoro') {
    const p = s.pomodoro;
    const num = (name, label, value, min, max) => field(label, `<input type="number" inputmode="numeric" name="${name}" value="${value}" min="${min}" max="${max}" required>`);
    openDialog('Pomodoro', `<form data-form="pomodoro" novalidate><div class="form-grid">${num('focus', 'Focus, min', p.focus, 5, 120)}${num('short', 'Short break, min', p.short, 1, 30)}${num('long', 'Long break, min', p.long, 1, 60)}${num('rounds', 'Rounds', p.rounds, 2, 8)}</div>
${switchRow('Start the next round automatically', 'pomodoro-auto', p.auto)}
<p class="form-error" role="alert" hidden></p><div class="button-row"><button class="primary wide" type="submit">Save</button></div></form>`);
    return;
  }
  const chips = [15, 25, 45, 60, 90, 120].map(m => `<button type="button" class="chip" data-action="length-chip" data-value="${m}" aria-pressed="${m === s.minutes}">${m}</button>`).join('');
  openDialog('Session length', `<form data-form="length"><output class="big-number" id="length-out">${formatMinutes(s.minutes)}</output>
<p class="lead" id="length-earn">${earnText(app, s.minutes)}</p>
<label class="sr-only" for="length-range">Minutes</label><input id="length-range" name="minutes" type="range" min="${LIMITS.minMinutes}" max="${LIMITS.maxMinutes}" step="${LIMITS.step}" value="${s.minutes}" data-input="length-range">
<div class="chips" role="group" aria-label="Common lengths in minutes">${chips}</div>
<div class="button-row"><button class="primary wide" type="submit">Set length</button></div></form>`);
}
function earnText(app, minutes) {
  const coins = coinsFor({ minutes, streak: app.store.streak().current });
  return `${coins} coins and ${treatsFor(minutes)} ${treatsFor(minutes) === 1 ? 'treat' : 'treats'}.`;
}

function speciesDialog(app, kind = null) {
  const { store } = app, current = store.state.settings.species;
  const tab = kind || speciesById(current).kind, all = ofKind(tab);
  const list = all.filter(sp => store.state.unlocked.includes(sp.id));
  const grid = list.map(sp => `<button class="species-card" data-action="pick-species" data-id="${sp.id}" aria-pressed="${sp.id === current}">${sprite(sp.id, { kind: sp.kind })}<b>${e(sp.name)}</b>${sp.minMinutes ? `<small>${sp.minMinutes} min or more</small>` : ''}</button>`).join('');
  openDialog('What to grow', `${segmented('species-tab', KINDS.map(([id, label]) => [id, label]), tab, 'Plants, animals or nature')}
${grid ? `<div class="species-grid">${grid}</div>` : '<p class="lead">None unlocked yet.</p>'}
<p class="note">${list.length} of ${all.length} unlocked.</p>
<div class="button-row"><button class="secondary wide" data-action="open-collection" data-kind="${tab}">Open the collection</button></div>`);
}

function tagDialog(app) {
  const { store } = app, current = store.state.settings.tag;
  const rows = store.state.tags.map(t => `<li class="row"><button class="row-main pick" data-action="pick-tag" data-id="${e(t.id)}" aria-pressed="${t.id === current}"><i class="dot" style="background:${t.colour}"></i><b>${e(t.name)}</b></button>${store.state.tags.length > 1 ? `<button class="iconbutton" data-action="remove-tag" data-id="${e(t.id)}" aria-label="Remove ${e(t.name)}">${icon('trash')}</button>` : ''}</li>`).join('');
  openDialog('Tag', `<ul class="rows">${rows}</ul>
<form data-form="tag" class="inline-form">${field('New tag', '<input name="name" maxlength="24" autocomplete="off" placeholder="For example, Thesis">')}<button class="secondary" type="submit">Add tag</button><p class="form-error" role="alert" hidden></p></form>`);
}

export function soundsDialog(app) {
  import('../sound.js').then(({ SOUNDS }) => {
    const s = app.store.state.settings;
    const rows = SOUNDS.map(x => `<li class="row"><button class="row-main pick" data-action="pick-sound" data-id="${x.id}" aria-pressed="${x.id === s.sound}"><b>${e(x.name)}</b></button></li>`).join('');
    openDialog('Sounds', `<ul class="rows">${rows}</ul>
<label class="form-field"><span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-input="volume"></label>
<p class="note">Plays while you focus. Works offline.</p>`);
  });
}

export function resultDialog(app, result) {
  const { store } = app, session = result.session, species = speciesById(session.species), level = result.levelUp;
  const facts = [
    ['Coins', `+${result.coins}`],
    ['Treats', `+${result.treats}`],
    ...(session.others ? [['With friends', `${session.others} finished with you`]] : []),
    ...(session.strict ? [['Strict campfire', '1.2× coins']] : []),
    ...(result.streak > 1 ? [['Streak', `${result.streak} days in a row`]] : []),
    ...(level ? [[`Level ${level.level}`, `+${level.coins} coins${level.grew ? `. Land is now ${level.side} × ${level.side}` : ''}`]] : []),
    ...result.achievements.map(a => [a.name, `+${a.coins} coins`]),
  ];
  const where = result.placedAt ? '' : store.state.settings.autoPlace ? 'Your haven is full, so it went to storage.' : 'It is in storage.';
  const lead = species.kind === 'animal' ? `${formatMinutes(session.minutes)} focused. A ${lower(species)} has moved in.` : species.kind === 'nature' ? `${formatMinutes(session.minutes)} focused. The ${lower(species)} is built.` : `${formatMinutes(session.minutes)} focused. The ${lower(species)} is fully grown.`;
  const cycle = store.state.cycle;
  const next = cycle?.breakUntil ? `<p class="note">${cycle.done ? 'Last round done.' : `Break. Round ${cycle.round} of ${cycle.rounds} next.`}</p>` : '';
  openDialog('Session finished', `<div class="result-art">${sprite(species.id, { kind: species.kind, label: species.name })}</div>
<p class="lead">${e(lead)}${where ? ` ${where}` : ''}</p>
<dl class="facts">${facts.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}</dl>${next}
<div class="button-row"><button class="primary wide" data-action="close-dialog" autofocus>Done</button></div>`, { cls: 'result' });
}

export function failedDialog(app, { session, reason, away, who, judged }) {
  const species = speciesById(session.species), minutes = Math.floor((session.end - session.start) / 60000);
  const title = species.kind === 'animal' ? `The ${lower(species)} wandered off` : species.kind === 'nature' ? `The ${lower(species)} was not finished` : `The ${lower(species)} withered`;
  const long = away >= 120 ? formatMinutes(away / 60) : `${away} s`, allows = formatAway(app.store.state.settings.allowance);
  const why = reason === 'left' && judged ? `${long} in another app. The limit is ${allows}. ${judged.why}`
    : reason === 'left' ? `You were away for ${long}. The limit is ${allows}.`
    : reason === 'friend-left' ? `${who ? e(who) : 'Someone'} left, so the fire went out.`
    : `You stopped after ${minutes < 1 ? 'less than a minute' : formatMinutes(minutes)}.`;
  openDialog(title, `<div class="result-art">${sprite(species.id, { kind: species.kind, withered: true })}</div>
<p class="lead">${why}</p>
<div class="button-row">${reason === 'left' ? '<button class="secondary" data-action="settings" data-section="focus">Deep focus settings</button>' : ''}<button class="primary" data-action="close-dialog" autofocus>OK</button></div>`, { cls: 'result' });
}

// ——— Actions ———

/** Choose what the next session makes. Nature needs time: the length is raised to fit if it is too short. */
export function pickSpecies(app, id) {
  const sp = speciesById(id), s = app.store.state.settings;
  app.store.set({ species: id });
  app.social.roomSpecies(id);
  if (!sp.minMinutes) return;
  if (s.mode === 'timer' && s.minutes < sp.minMinutes) { app.store.set({ minutes: sp.minMinutes }); toast(`A ${lower(sp)} takes ${sp.minMinutes} min. Length set.`); }
  else if (s.mode === 'pomodoro' && s.pomodoro.focus < sp.minMinutes) toast(`A ${lower(sp)} takes ${sp.minMinutes} min. Make rounds that long, or use the timer.`);
}

export const actions = {
  mode(app, d) { app.store.set({ mode: d.value }); },
  'choose-length': app => lengthDialog(app),
  'choose-species': app => speciesDialog(app),
  'choose-tag': app => tagDialog(app),
  'species-tab': (app, d) => speciesDialog(app, d.value),
  'pick-species'(app, d) { pickSpecies(app, d.id); closeDialog(); },
  'open-collection'(app, d) { app.ui.collection = d.kind; app.go('collection'); },
  'pick-tag'(app, d) { app.store.set({ tag: d.id }); closeDialog(); },
  'remove-tag'(app, d) { const r = app.store.removeTag(d.id); if (!r.ok) toast(r.error); else tagDialog(app); },
  'length-chip'(app, d) { const range = $('#length-range'); range.value = d.value; range.dispatchEvent(new Event('input', { bubbles: true })); },
  start(app) {
    const r = app.timer.start();
    if (!r.ok) toast(r.error);
  },
  'give-up': async app => {
    const { timer } = app;
    if (timer.cancelLeft() > 0) { timer.giveUp(); return; }
    const active = app.store.state.active;
    if (!active) return;
    const species = speciesById(active.species);
    const together = active.room && app.social.data.room?.rule === 'together';
    const ok = await app.confirm('Give up?', `${species.kind === 'animal' ? `The ${lower(species)} will leave.` : species.kind === 'nature' ? `The ${lower(species)} won't be finished.` : `The ${lower(species)} will wither.`}${together ? ' The fire goes out for everyone.' : ''}`, 'Give up');
    if (ok) timer.giveUp();
  },
  finish: app => app.timer.complete(),
  sounds: app => soundsDialog(app),
  'pick-sound'(app, d) {
    app.store.set({ sound: d.id });
    if (app.store.state.active) app.sound.start(d.id, app.store.state.settings.volume);
    else { app.sound.start(d.id, app.store.state.settings.volume); clearTimeout(actions.preview); actions.preview = setTimeout(() => { if (!app.store.state.active) app.sound.stop(); }, 4000); }
    soundsDialog(app);
  },
  'skip-break': app => app.timer.endBreak(false),
  'end-cycle': app => app.timer.endCycle(),
};

export const inputs = {
  'length-range'(app, el) {
    const minutes = Number(el.value);
    $('#length-out').textContent = formatMinutes(minutes);
    $('#length-earn').textContent = earnText(app, minutes);
    for (const chip of document.querySelectorAll('.chip[data-action="length-chip"]')) chip.setAttribute('aria-pressed', String(Number(chip.dataset.value) === minutes));
  },
  volume(app, el) { app.store.set({ volume: Number(el.value) }); app.sound.setVolume(Number(el.value)); },
};
export const changes = {
  'pomodoro-auto'(app, el) { app.store.set({ pomodoro: { ...app.store.state.settings.pomodoro, auto: el.checked } }); },
};
export const forms = {
  length(app, form) { app.store.set({ minutes: Number(form.minutes.value) }); closeDialog(); },
  pomodoro(app, form) {
    const v = name => Number(form[name].value);
    const bad = [['focus', 5, 120, 'Focus'], ['short', 1, 30, 'Short break'], ['long', 1, 60, 'Long break'], ['rounds', 2, 8, 'Rounds']].find(([n, lo, hi]) => !Number.isInteger(v(n)) || v(n) < lo || v(n) > hi);
    if (bad) return formError(form, `${bad[3]} must be a whole number from ${bad[1]} to ${bad[2]}.`);
    app.store.set({ pomodoro: { ...app.store.state.settings.pomodoro, focus: v('focus'), short: v('short'), long: v('long'), rounds: v('rounds') } });
    closeDialog();
  },
  tag(app, form) {
    const r = app.store.addTag(form.name.value);
    if (!r.ok) return formError(form, r.error);
    app.store.set({ tag: r.tag.id });
    closeDialog();
  },
};

export const mounted = haven.mounted;
