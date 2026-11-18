// The Journal screen: what you did in a day, week, month or year, and what you have earned.
import { e, icon, segmented, openDialog, closeDialog, empty, field, toast } from '../ui.js';
import { period, shiftPeriod, summarise, formatMinutes, streaks, facts, ACHIEVEMENTS, doneSessions, landSide } from '../core.js';
import { speciesById } from '../catalog.js';
import { sprite } from '../art.js';

const KINDS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']];
const hourText = h => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
const timeText = ts => { const d = new Date(ts); return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`; };
const dayText = ts => new Date(ts).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

function chart(p, sum) {
  const max = Math.max(...sum.bars, 1), n = sum.bars.length, w = 320 / n;
  // Each bar is rounded at the top only, so it sits flat on the line it stands on.
  const bars = sum.bars.map((m, i) => {
    const h = m ? Math.max(3, (m / max) * 84) : 0;
    if (!h) return '';
    const x = i * w + w * 0.18, bw = w * 0.64, r = Math.min(3, bw / 2, h), y = 92 - h, f = v => v.toFixed(1);
    const d = `M${f(x)} 92V${f(y + r)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)}h${f(bw - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(r)}V92Z`;
    return `<path d="${d}"><title>${p.buckets[i].label || i + 1}: ${formatMinutes(m)}</title></path>`;
  }).join('');
  const labels = p.buckets.map((b, i) => (b.label ? `<text x="${(i * w + w / 2).toFixed(1)}" y="108">${b.label}</text>` : '')).join('');
  const what = { day: 'hour', week: 'day', month: 'day', year: 'month' }[p.kind];
  return `<svg class="chart" viewBox="0 0 320 112" role="img" aria-label="Focused time by ${what}. The most in one ${what} is ${formatMinutes(max === 1 && !sum.minutes ? 0 : max)}."><line x1="0" y1="92.5" x2="320" y2="92.5"/>${bars}${labels}</svg>`;
}

export function render(app) {
  const { store } = app, j = app.ui.journal, now = app.now();
  const p = period(j.kind, j.anchor), sum = summarise(store.state.sessions, p);
  const total = sum.done + sum.failed, streak = streaks(store.state.sessions, now);
  const future = shiftPeriod(j.kind, j.anchor, 1) > now && period(j.kind, now).from === p.from;
  const tags = Object.entries(sum.byTag).sort((a, b) => b[1] - a[1]);
  const tagBars = tags.map(([id, m]) => `<li><span><i class="dot" style="background:${store.tagColour(id)}"></i>${e(store.tagName(id))}</span><span class="meter"><i style="width:${Math.round(m / sum.minutes * 100)}%;background:${store.tagColour(id)}"></i></span><b>${formatMinutes(m)}</b></li>`).join('');
  const grown = sum.grown.slice(-40).map(g => { const sp = speciesById(g.species); return `<span class="grown z${g.size}" title="${e(sp.name)}">${sprite(g.species, { kind: sp.kind })}</span>`; }).join('');
  const sessions = [...sum.sessions].reverse().slice(0, 60).map(s => { const sp = speciesById(s.species); return `<li class="row ${s.status}"><button class="row-main pick" data-action="session" data-id="${e(s.id)}"><span class="avatar">${sprite(s.species, { kind: sp.kind, withered: s.status === 'failed' })}</span><span><b>${s.status === 'done' ? formatMinutes(s.minutes) : sp.kind === 'animal' ? 'Wandered off' : sp.kind === 'nature' ? 'Not finished' : 'Withered'}${s.others ? `, with ${s.others} ${s.others === 1 ? 'friend' : 'friends'}` : ''}</b><small>${j.kind === 'day' ? '' : dayText(s.start) + ', '}${timeText(s.start)}, ${e(store.tagName(s.tag))}${s.note ? `. ${e(s.note)}` : ''}</small></span></button></li>`; }).join('');
  const f = facts(store.state, now);
  const earned = ACHIEVEMENTS.filter(a => store.state.achieved[a.id]).length;
  const achievements = ACHIEVEMENTS.map(a => { const got = store.state.achieved[a.id], of = !got && a.of ? a.of(f) : null; return `<li class="row ${got ? 'got' : 'todo'}"><span class="badge">${icon(got ? 'check' : 'lock')}</span><div class="row-main"><b>${e(a.name)}</b><span>${e(a.text)}${of ? `. ${Math.min(of[0], of[1])} of ${of[1]}` : ''}</span></div><div class="row-end"><span class="minutes">${got ? 'Earned' : `${a.coins} coins`}</span></div></li>`; }).join('');
  const level = store.level(), side = store.side();
  const levelCard = `<div class="level"><div class="level-head"><b>Level ${level.level}</b><span>${formatMinutes(level.need - level.into)} to level ${level.level + 1}</span></div>
<div class="meter" role="progressbar" aria-label="Progress to the next level" aria-valuemin="0" aria-valuemax="${level.need}" aria-valuenow="${level.into}"><i style="width:${Math.round(level.into / level.need * 100)}%"></i></div>
<p class="note">Land ${side} × ${side}.${side < 10 ? ` Grows at level ${level.level + (level.level % 2 === 0 ? 1 : 2)}.` : ''}</p></div>`;
  return `<section class="page journal" data-page="journal"><h1 class="page-title">Journal</h1>
${levelCard}
${segmented('journal-kind', KINDS, j.kind, 'Period')}
<div class="stepper"><button class="iconbutton" data-action="journal-step" data-step="-1" aria-label="Earlier">${icon('prev')}</button><b aria-live="polite">${e(p.label)}</b><button class="iconbutton" data-action="journal-step" data-step="1" aria-label="Later" ${future ? 'disabled' : ''}>${icon('next')}</button></div>
<dl class="facts wide"><div><dt>Focused</dt><dd>${formatMinutes(sum.minutes)}</dd></div><div><dt>Sessions</dt><dd>${sum.done} finished${sum.failed ? `, ${sum.failed} not` : ''}</dd></div>${total ? `<div><dt>Finished</dt><dd>${Math.round(sum.done / total * 100)}%</dd></div>` : ''}${sum.bestHour !== null && j.kind !== 'day' ? `<div><dt>Best hour</dt><dd>Around ${hourText(sum.bestHour)}</dd></div>` : ''}<div><dt>Streak</dt><dd>${streak.current} ${streak.current === 1 ? 'day' : 'days'} now, ${streak.best} best</dd></div></dl>
${chart(p, sum)}
${tagBars ? `<h2 class="section-title">By tag</h2><ul class="tag-bars">${tagBars}</ul>` : ''}
${grown ? `<h2 class="section-title">What grew</h2><div class="grown-strip">${grown}</div>` : ''}
<h2 class="section-title">Sessions</h2>
${sessions ? `<ul class="rows">${sessions}</ul>` : empty(doneSessions(store.state.sessions).length ? 'No sessions in this period.' : 'No sessions yet.', '<button class="primary" data-action="go" data-page="focus">Start a session</button>')}
<h2 class="section-title">Achievements</h2><p class="note">${earned} of ${ACHIEVEMENTS.length} earned.</p><ul class="rows">${achievements}</ul></section>`;
}

function sessionDialog(app, id) {
  const { store } = app, s = store.state.sessions.find(x => x.id === id);
  if (!s) return;
  const sp = speciesById(s.species);
  const why = { 'gave-up': 'You gave up.', left: 'You left Haven for too long.', 'friend-left': 'Someone left the campfire.' }[s.reason] || '';
  openDialog(s.status === 'done' ? `${formatMinutes(s.minutes)} session` : 'Unfinished session', `<div class="result-art small">${sprite(s.species, { kind: sp.kind, withered: s.status === 'failed' })}</div>
<dl class="facts"><div><dt>When</dt><dd>${dayText(s.start)}, ${timeText(s.start)} to ${timeText(s.end)}</dd></div><div><dt>${s.status === 'done' ? 'Grew' : 'Was growing'}</dt><dd>${e(sp.name)}</dd></div><div><dt>Tag</dt><dd>${e(store.tagName(s.tag))}</dd></div>${s.status === 'done' ? `<div><dt>Coins</dt><dd>${s.coins}</dd></div>` : why ? `<div><dt>Why</dt><dd>${why}</dd></div>` : ''}</dl>
<form data-form="note" data-id="${e(s.id)}">${field('Note', `<input name="note" maxlength="200" value="${e(s.note || '')}" placeholder="What you worked on">`)}
<div class="button-row"><button type="button" class="secondary danger" data-action="delete-session" data-id="${e(s.id)}">Delete</button><button class="primary" type="submit">Save note</button></div></form>`);
}

export const actions = {
  'journal-kind'(app, d) { app.ui.journal.kind = d.value; app.render(); },
  'journal-step'(app, d) { app.ui.journal.anchor = Math.min(app.now(), shiftPeriod(app.ui.journal.kind, app.ui.journal.anchor, Number(d.step))); app.render(); },
  session: (app, d) => sessionDialog(app, d.id),
  'delete-session': async (app, d) => {
    if (!(await app.confirm('Delete this session?', 'It is removed from your journal. What it grew stays.', 'Delete'))) return;
    app.store.deleteSession(d.id);
    toast('Session deleted.');
  },
};
export const forms = {
  note(app, form) { app.store.setNote(form.dataset.id, form.note.value); closeDialog(); toast('Note saved.'); },
};
