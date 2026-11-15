// Sanctuaries: groups of friends whose havens are joined into one land, where everyone's animals
// wander from haven to haven. This file holds the list on the Friends screen, the sanctuary
// itself (with its loading screen), and the dialogs for making, joining, inviting and leaving.
import { e, $, icon, openDialog, closeDialog, toast, field, avatar, empty, formError, busy } from '../ui.js';
import { isNight } from '../core.js';
import { prettyCode } from '../social.js';
import { share, copyText } from '../device.js';
import { sanctuaryHTML, sanctuaryLayout } from '../scene.js';
import { World } from '../world.js';
import { paintStage } from './haven.js';

const MAX = 9;
// The loading screen stays up at least this long, so opening a sanctuary always feels the same.
const LEAST_LOADING = 1400;
const STEPS = ['Gathering havens', 'Joining the land', 'Waking the animals'];
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let stage = null, raf = 0, last = 0, refreshTimer = null;

// ——— On the Friends screen ———

/** The Sanctuary tab: the sanctuaries you are in, and ways to make or join one. */
export function tab(app) {
  const list = app.social.data.sanctuaries;
  if (!list) return empty('Loading your sanctuaries.');
  const cards = list.map(s => `<li class="row sanct-card"><button class="row-main pick" data-action="sanct-open" data-id="${s.id}"><span class="avatars">${s.members.slice(0, 5).map(m => avatar(m.avatar)).join('')}</span><span><b>${e(s.name)}</b><small>${s.members.length} of ${MAX} havens${s.members.some(m => m.focusing) ? `, ${s.members.filter(m => m.focusing).length} focusing` : ''}</small></span></button><div class="row-end"><button class="primary" data-action="sanct-open" data-id="${s.id}">Visit</button></div></li>`).join('');
  return `<p class="lead">A sanctuary joins friends' havens into one land. Animals wander from haven to haven.</p>
${cards ? `<ul class="rows sanct-list">${cards}</ul>` : empty('You are not in a sanctuary yet. Make one and invite friends, or join one with its code.')}
<div class="button-row"><button class="${cards ? 'secondary' : 'primary'}" data-action="sanct-new">${icon('plus')}New sanctuary</button><button class="secondary" data-action="sanct-join">Join with a code</button></div>`;
}

export async function loadList(app) {
  try { await app.social.loadSanctuaries(); } catch (error) { toast(error.message); }
}

/** A friend invited you. */
export function invited(app, item) {
  openDialog('Join a sanctuary?', `<p class="lead">${e(item.from.name)} invites you to ${e(item.data.name || 'their sanctuary')}. Your haven joins theirs, and everyone in it can see it.</p>
<div class="button-row"><button class="secondary" data-action="close-dialog">Not now</button><button class="primary" data-action="sanct-accept" data-code="${e(item.data.code)}" autofocus>Join</button></div>`, { close: () => app.social.ack([item.id]) });
}

// ——— The sanctuary itself ———

export function render(app) {
  const ui = app.ui.sanct || {}, s = ui.data;
  const head = `<div class="sanct-head"><button class="iconbutton" data-action="sanct-back" aria-label="Back to Friends">${icon('back')}</button>
<div class="row-main"><h1 class="page-title">${e(s?.name || ui.name || 'Sanctuary')}</h1><span>${s ? `${s.members.length} ${s.members.length === 1 ? 'haven' : 'havens'}` : ''}</span></div>
${s ? `<button class="secondary" data-action="sanct-invite">${icon('plus')}Invite</button>` : ''}</div>`;
  if (!s) return `<section class="page sanctuary" data-page="sanctuary">${head}${loading(ui)}</section>`;
  const { plots, things, dims } = ui.layout;
  const me = app.social.account?.id, night = isNight(app.now());
  // At zoom 1 the land fits the screen's width, but never so small that a haven is a speck.
  const zoom = ui.zoom || 1, least = Math.round((dims[0] + dims[1]) * 14 * zoom);
  const members = s.members.map(m => `<li class="row"><button class="row-main pick" data-action="sanct-find" data-id="${m.id}">${avatar(m.avatar)}<span><b>${e(m.id === me ? 'You' : m.name)}</b><small class="presence">${m.id === s.owner ? 'Looks after it. ' : ''}${m.focusing ? 'Focusing now' : m.online ? 'Online' : `Level ${Number(m.card?.level) || 1}`}</small></span></button></li>`).join('');
  return `<section class="page sanctuary${night ? ' night' : ''}" data-page="sanctuary">${head}
<div class="sanct-stage"><div class="sanct-scroll" tabindex="0" aria-label="The sanctuary. Scroll to look around."><div class="sanct-inner" style="width:${Math.round(zoom * 100)}%;min-width:${least}px">${sanctuaryHTML({ plots, things, label: `${s.name}: ${s.members.map(m => m.name).join(', ')}` })}</div></div>
<div class="zoom" role="group" aria-label="Zoom"><button class="pill" data-action="sanct-zoom" data-step="-1" aria-label="Zoom out" ${zoom <= 1 ? 'disabled' : ''}>−</button><button class="pill" data-action="sanct-zoom" data-step="1" aria-label="Zoom in" ${zoom >= 3 ? 'disabled' : ''}>+</button></div></div>
<h2 class="section-title">In this sanctuary</h2><ul class="rows">${members}</ul>
<div class="button-row quiet">${s.owner === me ? '<button class="linklike" data-action="sanct-manage">Rename or ask someone to leave</button>' : ''}<button class="linklike danger" data-action="sanct-leave">Leave the sanctuary</button></div></section>`;
}

function loading(ui) {
  if (ui.error) return `<div class="sanct-loading">${empty(e(ui.error), '<button class="primary" data-action="sanct-retry">Try again</button>')}</div>`;
  const step = Math.min(STEPS.length - 1, ui.step || 0);
  return `<div class="sanct-loading" role="status" aria-live="polite"><div class="isles" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
<p>${STEPS[step]}…</p><div class="meter"><i style="width:${Math.round(((step + 1) / STEPS.length) * 100)}%"></i></div></div>`;
}

/** Open a sanctuary: the loading screen first, then the land once everything is ready. */
export async function open(app, id) {
  const known = app.social.data.sanctuaries?.find(s => s.id === id);
  app.ui.sanct = { id, name: known?.name, data: null, step: 0, zoom: app.ui.sanct?.id === id ? app.ui.sanct.zoom : 1 };
  stop();
  app.go('sanctuary');
  const started = Date.now(), ui = app.ui.sanct;
  const advance = step => { if (app.ui.sanct === ui && !ui.data) { ui.step = step; app.renderIf('sanctuary'); } };
  try {
    const data = await app.social.sanctuary(id);
    advance(1);
    const layout = sanctuaryLayout(data.members);
    await wait(Math.max(0, LEAST_LOADING * 0.6 - (Date.now() - started)));
    advance(2);
    // Let the animals find their feet before anyone sees them.
    const world = new World({ plots: layout.plots });
    world.sync(layout.things);
    for (let i = 0; i < 40; i++) world.step(0.1, { night: isNight(app.now()), hungry: new Set() });
    await wait(Math.max(0, LEAST_LOADING - (Date.now() - started)));
    if (app.ui.sanct !== ui) return;
    Object.assign(ui, { data, layout, world });
    app.renderIf('sanctuary');
  } catch (error) {
    if (app.ui.sanct !== ui) return;
    ui.error = error.message;
    app.renderIf('sanctuary');
  }
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Something changed in the sanctuary: fetch it again quietly, keeping the animals where they are. */
export function changed(app, { id, member }) {
  const ui = app.ui.sanct;
  if (app.ui.page !== 'sanctuary' || !ui?.data) return;
  if (id && id !== ui.id) return;
  if (member && !ui.data.members.some(m => m.id === member)) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try {
      const data = await app.social.sanctuary(ui.id);
      if (app.ui.sanct !== ui) return;
      const layout = sanctuaryLayout(data.members);
      ui.world.setLand(5, layout.plots);
      ui.world.sync(layout.things);
      Object.assign(ui, { data, layout });
      app.renderIf('sanctuary');
    } catch (error) {
      if (error.code === 404 && app.ui.sanct === ui) { toast('You are no longer in that sanctuary.'); leaveView(app); }
    }
  }, 600);
}

/** Connect the running world to the newly drawn land. */
export function mounted(app) {
  stop();
  const ui = app.ui.sanct, host = $('.page.sanctuary .sanctuary-land');
  if (!ui?.world || !host) return;
  const els = new Map();
  for (const el of host.querySelectorAll('.ent[data-ent]')) els.set(el.dataset.ent, el);
  stage = { root: host, world: ui.world, els, dims: ui.layout.dims };
  paintStage(stage);
  // Start looking at the middle of the land.
  const scroll = $('.page.sanctuary .sanct-scroll');
  if (scroll && !ui.scrolled) { ui.scrolled = true; scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) / 2; scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) / 2; }
  last = 0;
  if (!calm()) raf = requestAnimationFrame(frame);
  function frame(ts) {
    if (!host.isConnected) return;
    raf = requestAnimationFrame(frame);
    if (document.visibilityState !== 'visible') { last = 0; return; }
    const dt = last ? Math.min(0.25, (ts - last) / 1000) : 0;
    last = ts;
    if (dt) ui.world.step(dt, { night: isNight(app.now()), hungry: new Set() });
    paintStage(stage);
  }
}
function stop() { cancelAnimationFrame(raf); stage = null; }
function leaveView(app) { stop(); app.ui.sanct = null; app.ui.friendsTab = 'sanctuary'; app.go('friends'); }

// ——— Dialogs ———

function newDialog() {
  openDialog('Make a sanctuary', `<form data-form="sanct-new" novalidate>${field('Name', '<input name="name" maxlength="30" autocomplete="off" required>', 'Everyone in it sees this name.')}
<p class="note">Up to ${MAX} havens can join. You can invite friends next.</p><p class="form-error" role="alert" hidden></p>
<div class="button-row"><button class="primary wide" type="submit">Make it</button></div></form>`);
}
function joinDialog() {
  openDialog('Join a sanctuary', `<form data-form="sanct-join" novalidate>${field('Sanctuary code', '<input name="code" maxlength="9" autocapitalize="characters" autocomplete="off" spellcheck="false" required>', 'Ask someone in it for the code.')}
<p class="note">Everyone in the sanctuary can see your haven.</p><p class="form-error" role="alert" hidden></p>
<div class="button-row"><button class="primary wide" type="submit">Join</button></div></form>`);
}
function inviteDialog(app) {
  const s = app.ui.sanct.data, inside = new Set(s.members.map(m => m.id));
  const friends = app.social.data.friends.filter(f => !inside.has(f.id));
  const rows = friends.map(f => `<li class="row">${avatar(f.avatar)}<div class="row-main"><b>${e(f.name)}</b><span>@${e(f.handle)}</span></div><div class="row-end"><button class="secondary" data-action="sanct-invite-friend" data-id="${f.id}">Invite</button></div></li>`).join('');
  openDialog('Invite to the sanctuary', `<div class="code-box"><span>Sanctuary code</span><b>${prettyCode(s.code)}</b></div>
<div class="button-row"><button class="secondary" data-action="sanct-copy">${icon('copy')}Copy</button><button class="secondary" data-action="sanct-share">${icon('share')}Share</button></div>
${s.members.length >= MAX ? `<p class="note">The sanctuary is full: it holds ${MAX} havens.</p>` : rows ? `<h3 class="group-title">Your friends</h3><ul class="rows">${rows}</ul>` : '<p class="note">Friends you add on Haven can be invited from here.</p>'}`);
}
function manageDialog(app) {
  const s = app.ui.sanct.data, me = app.social.account.id;
  const rows = s.members.filter(m => m.id !== me).map(m => `<li class="row">${avatar(m.avatar)}<div class="row-main"><b>${e(m.name)}</b></div><div class="row-end"><button class="secondary danger" data-action="sanct-remove" data-id="${m.id}">Ask to leave</button></div></li>`).join('');
  openDialog('Look after the sanctuary', `<form data-form="sanct-rename" novalidate>${field('Name', `<input name="name" maxlength="30" value="${e(s.name)}" required>`)}<p class="form-error" role="alert" hidden></p>
<div class="button-row"><button class="primary wide" type="submit">Save name</button></div></form>${rows ? `<h3 class="group-title">Havens</h3><ul class="rows">${rows}</ul>` : ''}`);
}

// ——— Actions ———

const guard = async (work, el) => { if (el) el.disabled = true; try { return await work(); } catch (error) { toast(error.message); return null; } finally { if (el?.isConnected) el.disabled = false; } };

export const actions = {
  'sanct-open': (app, d) => open(app, d.id),
  'sanct-retry': app => open(app, app.ui.sanct.id),
  'sanct-back': app => leaveView(app),
  'sanct-new': () => newDialog(),
  'sanct-join': () => joinDialog(),
  'sanct-invite': app => inviteDialog(app),
  'sanct-manage': app => manageDialog(app),
  'sanct-accept': (app, d, el) => guard(async () => { const s = await app.social.sanctuaryJoin(d.code); closeDialog(); toast(`You joined ${s.name}.`); open(app, s.id); }, el),
  'sanct-invite-friend': (app, d, el) => guard(async () => {
    const r = await app.social.sanctuaryInvite(app.ui.sanct.id, d.id);
    const name = app.social.data.friends.find(f => f.id === d.id)?.name || 'Your friend';
    toast(r.status === 'joined' ? `${name} is already in it.` : `Invited ${name}.`);
    el.textContent = 'Invited';
  }, el),
  'sanct-copy': async app => { toast((await copyText(prettyCode(app.ui.sanct.data.code))) ? 'Code copied.' : 'Could not copy. Read the code out instead.'); },
  'sanct-share': async app => {
    const s = app.ui.sanct.data;
    const how = await share({ title: 'Haven', text: `Join my sanctuary "${s.name}" on Haven. Open Friends, then Sanctuary, and enter the code ${prettyCode(s.code)}.` });
    if (how === 'copied') toast('Invite copied.'); else if (how === 'failed') toast('Could not share. Read the code out instead.');
  },
  'sanct-zoom': (app, d) => {
    const ui = app.ui.sanct, scroll = $('.page.sanctuary .sanct-scroll');
    const fx = scroll ? (scroll.scrollLeft + scroll.clientWidth / 2) / scroll.scrollWidth : 0.5, fy = scroll ? (scroll.scrollTop + scroll.clientHeight / 2) / scroll.scrollHeight : 0.5;
    ui.zoom = Math.min(3, Math.max(1, (ui.zoom || 1) * (Number(d.step) > 0 ? 1.25 : 0.8)));
    app.render();
    const again = $('.page.sanctuary .sanct-scroll');
    if (again) { again.scrollLeft = fx * again.scrollWidth - again.clientWidth / 2; again.scrollTop = fy * again.scrollHeight - again.clientHeight / 2; }
  },
  /** Scroll to a member's haven. */
  'sanct-find': (app, d) => {
    const plot = app.ui.sanct.layout.plots.find(p => p.id === d.id), host = $('.page.sanctuary .sanctuary-land'), scroll = $('.page.sanctuary .sanct-scroll');
    if (!plot || !host || !scroll) return;
    const sign = [...host.querySelectorAll('.plot-sign')][app.ui.sanct.layout.plots.indexOf(plot)];
    sign?.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'center', inline: 'center' });
    sign?.classList.remove('flash'); void sign?.offsetWidth; sign?.classList.add('flash');
  },
  'sanct-leave': async app => {
    const s = app.ui.sanct.data;
    if (!(await app.confirm('Leave the sanctuary?', `Your haven leaves ${e(s.name)}. You can join again with its code while there is room.`, 'Leave'))) return;
    guard(async () => { await app.social.sanctuaryLeave(s.id); toast(`You left ${s.name}.`); leaveView(app); });
  },
  'sanct-remove': async (app, d, el) => {
    const s = app.ui.sanct.data, m = s.members.find(x => x.id === d.id);
    if (!(await app.confirm(`Ask ${e(m?.name || 'them')} to leave?`, 'Their haven is taken out of the sanctuary. They can join again with the code.', 'Ask to leave'))) return;
    guard(async () => { await app.social.sanctuaryEdit(s.id, { remove: d.id }); toast(`${m?.name || 'They'} left the sanctuary.`); changed(app, { id: s.id }); });
  },
};

export const forms = {
  'sanct-new': (app, form) => busy(form, async () => {
    try { const s = await app.social.sanctuaryCreate(form.name.value); closeDialog(); toast(`${s.name} is ready. Invite friends to join.`); await open(app, s.id); inviteDialog(app); }
    catch (error) { formError(form, error.message); }
  }),
  'sanct-join': (app, form) => busy(form, async () => {
    try { const s = await app.social.sanctuaryJoin(form.code.value); closeDialog(); toast(`You joined ${s.name}.`); open(app, s.id); }
    catch (error) { formError(form, error.message); }
  }),
  'sanct-rename': (app, form) => busy(form, async () => {
    try { await app.social.sanctuaryEdit(app.ui.sanct.id, { name: form.name.value }); closeDialog(); toast('Name saved.'); changed(app, { id: app.ui.sanct.id }); }
    catch (error) { formError(form, error.message); }
  }),
};
