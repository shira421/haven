// Sanctuaries: groups of friends whose havens are joined into one land round a great tree that
// grows with the week's focus. Everyone's animals wander from haven to haven, meet and make
// friends; anyone can give them a treat or a pat; and a campfire can be lit for everyone at once.
// This file holds the list on the Friends screen, the sanctuary itself (with its loading screen),
// and the dialogs for making, joining, inviting and leaving.
import { e, $, icon, openDialog, closeDialog, toast, field, avatar, empty, formError, busy, dialogOpen } from '../ui.js';
import { isNight, hungerOf, formatMinutes } from '../core.js';
import { speciesById, artOf } from '../catalog.js';
import { prettyCode } from '../social.js';
import { share, copyText, haptic } from '../device.js';
import { sanctuaryHTML, sanctuaryLayout, treeStageName, unproject } from '../scene.js';
import { World } from '../world.js';
import { paintStage } from './haven.js';
import { reportDialog } from './friends.js';

const MAX = 8;
// The loading screen stays up at least this long, so opening a sanctuary always feels the same.
const LEAST_LOADING = 1400;
const STEPS = ['Gathering havens', 'Joining the land', 'Waking the animals'];
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let stage = null, raf = 0, last = 0, refreshTimer = null, petting = null, justPetted = 0, chipTimer = 0;
const TREE_SOLID = [0.15, 0.2, 0.3, 0.45, 0.55, 0.55];
const TREE_PERCH = [0, 0, 0, 2.6, 3.4, 3.4];

// ——— On the Friends screen ———

/** The Sanctuary tab: the sanctuaries you are in, and ways to make or join one. */
export function tab(app) {
  const list = app.social.data.sanctuaries;
  if (!list) return empty('Loading.');
  const cards = list.map(s => `<li class="row sanct-card"><button class="row-main pick" data-action="sanct-open" data-id="${s.id}"><span class="avatars">${s.members.slice(0, 3).map(m => avatar(m.avatar)).join('')}</span><span><b>${e(s.name)}</b><small>${s.members.length} of ${MAX} havens${s.members.some(m => m.focusing) ? `, ${s.members.filter(m => m.focusing).length} focusing` : ''}</small></span></button><div class="row-end"><button class="primary" data-action="sanct-open" data-id="${s.id}">Visit</button></div></li>`).join('');
  return `<p class="lead">Join your havens into one land round a great tree that grows as you focus.</p>
${cards ? `<ul class="rows sanct-list">${cards}</ul>` : empty('No sanctuaries yet. Make one, or join with a code.')}
<div class="button-row"><button class="${cards ? 'secondary' : 'primary'}" data-action="sanct-new">${icon('plus')}New sanctuary</button><button class="secondary" data-action="sanct-join">Join with a code</button></div>`;
}

export async function loadList(app) {
  try { await app.social.loadSanctuaries(); } catch (error) { toast(error.message); }
}

/** A friend invited you. */
export function invited(app, item) {
  openDialog('Join a sanctuary?', `<p class="lead">${e(item.from.name)} invited you to ${e(item.data.name || 'their sanctuary')}. Everyone in it can see your haven.</p>
<div class="button-row"><button class="secondary" data-action="close-dialog">Not now</button><button class="primary" data-action="sanct-accept" data-code="${e(item.data.code)}" autofocus>Join</button></div>`, { close: () => app.social.ack([item.id]) });
}

// ——— The sanctuary itself ———

export function render(app) {
  const ui = app.ui.sanct || {}, s = ui.data;
  const head = `<div class="sanct-head"><button class="iconbutton" data-action="sanct-back" aria-label="Back to Friends">${icon('back')}</button>
<div class="row-main"><h1 class="page-title">${e(s?.name || ui.name || 'Sanctuary')}</h1><span>${s ? `${s.members.length} ${s.members.length === 1 ? 'haven' : 'havens'}` : ''}</span></div>
${s ? `<button class="secondary" data-action="sanct-invite" aria-label="Invite">${icon('plus')}<span class="label">Invite</span></button>` : ''}</div>`;
  if (!s) return `<section class="page sanctuary" data-page="sanctuary">${head}${loading(ui)}</section>`;
  const me = app.social.account?.id, night = isNight(app.now());
  // At zoom 1 the whole land fits the screen's width; zooming in makes it wider and it scrolls.
  const zoom = ui.zoom || 1, feeding = Boolean(ui.feeding);
  const members = s.members.map(m => `<li class="row"><button class="row-main pick" data-action="sanct-find" data-id="${m.id}" aria-label="Show ${e(m.id === me ? 'your' : `${m.name}'s`)} haven">${avatar(m.avatar)}<span><b>${e(m.id === me ? 'You' : m.name)}</b><small class="presence">${m.id === s.owner ? 'Looks after it. ' : ''}${m.focusing ? 'Focusing now' : m.online ? 'Online' : `Level ${Number(m.card?.level) || 1}`}</small></span></button>${befriend(app, m)}${m.id === me ? '' : `<button class="iconbutton" data-action="sanct-member" data-id="${m.id}" aria-label="More about ${e(m.name)}">${icon('more')}</button>`}</li>`).join('');
  const label = `${s.name}: the great tree, ${s.members.map(m => m.name).join(', ')}`;
  return `<section class="page sanctuary${night ? ' night' : ''}${feeding ? ' feeding' : ''}" data-page="sanctuary">${head}
${treeCard(app, s)}${fireCard(app, s)}
<div class="sanct-stage"><div class="sanct-scroll" tabindex="0" aria-label="The sanctuary. Scroll to look around."><div class="sanct-inner" style="width:${Math.round(zoom * 100)}%">${sanctuaryHTML({ ...ui.layout, things: ui.layout.things.map(t => (speciesById(t.species)?.kind === 'animal' ? { ...t, action: 'sanct-pet', label: `${animalOf(app, t.id)?.name || 'An animal'}. Pat` } : t)), tree: { ...ui.layout.tree, stage: s.tree?.stage || 0 }, label })}</div></div>
<div class="sanct-tools"><button class="pill${feeding ? ' on' : ''}" data-action="sanct-feeding" aria-pressed="${feeding}">${icon('treat')}<span>${feeding ? 'Done' : `${treatsLeft(app)} ${treatsLeft(app) === 1 ? 'treat' : 'treats'}`}</span></button>
<div class="zoom" role="group" aria-label="Zoom"><button class="pill" data-action="sanct-zoom" data-step="-1" aria-label="Zoom out" ${zoom <= 1 ? 'disabled' : ''}>−</button><button class="pill" data-action="sanct-zoom" data-step="1" aria-label="Zoom in" ${zoom >= 4 ? 'disabled' : ''}>+</button></div></div></div>
<div class="care-slot sanct-slot" aria-live="polite">${chipHTML(app)}</div>
<p class="note sanct-hint">${feeding ? 'Tap the land to put a treat down.' : 'Tap an animal to pat it.'}</p>
<h2 class="section-title">In this sanctuary</h2><ul class="rows">${members}</ul>
${palsList(app, s)}
<div class="button-row quiet">${s.owner === me ? '<button class="linklike" data-action="sanct-manage">Rename or ask someone to leave</button>' : ''}<button class="linklike danger" data-action="sanct-leave">Leave the sanctuary</button></div></section>`;
}

/** The great tree: how far it has grown this week, and who helped most. */
function treeCard(app, s) {
  const t = s.tree;
  if (!t) return '';
  const me = app.social.account?.id, name = id => (id === me ? 'You' : s.members.find(m => m.id === id)?.name || 'Someone');
  const pct = Math.min(100, Math.round((t.minutes / t.goal) * 100));
  const top = t.top?.length ? `<p class="note">Most this week: ${t.top.map(x => `${e(name(x.id))} ${formatMinutes(x.minutes)}`).join(', ')}.</p>` : '';
  const text = t.stage >= 5 ? 'In full bloom this week.' : `${formatMinutes(t.minutes)} of ${formatMinutes(t.goal)} this week. Resets on Monday.`;
  return `<div class="tree-card"><div class="row-main"><b>The great tree: ${e(treeStageName(t.stage).toLowerCase())}</b><small>${text}${t.blooms ? ` It has bloomed ${t.blooms === 1 ? 'once' : `${t.blooms} times`}.` : ''}</small></div>
<div class="meter" role="progressbar" aria-label="The great tree's growth this week" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>${top}</div>`;
}

/** A campfire lit for this sanctuary, or a way to light one. */
function fireCard(app, s) {
  const f = s.campfire, me = app.social.account?.id;
  if (!f) return `<div class="fire-card"><p>Focus together. Everyone here is invited.</p><button class="secondary" data-action="sanct-campfire" ${app.social.roomLive() ? 'disabled' : ''}>${icon('flame')}Light a campfire</button></div>`;
  const host = s.members.find(m => m.id === f.host)?.name || 'Someone', round = f.members.length, mine = f.members.some(m => m.id === me);
  const left = f.state === 'running' ? Math.max(1, Math.ceil((f.start + f.minutes * 60000 - app.social.serverNow()) / 60000)) : 0;
  const what = f.state === 'running' ? `Burning. ${round} round it, ${left} min to go.` : `${f.host === me ? 'You' : e(host)} lit a campfire for ${formatMinutes(f.minutes)}. ${round} round it.`;
  const button = f.state === 'lobby' && !mine ? `<button class="primary" data-action="sanct-fire-join" data-code="${e(f.code)}">Join</button>` : mine ? `<button class="secondary" data-action="open-room">Go to it</button>` : '';
  return `<div class="fire-card lit"><p>${what}</p>${button}</div>`;
}

/** Animals from different havens that have become friends here. */
function palsList(app, s) {
  // Shown once there are animals from two havens, so people know how friends are made.
  if (!s.pals?.length) return s.members.length > 1 ? '<h2 class="section-title">Animal friends</h2><p class="note">Animals from different havens become friends when they meet here.</p>' : '';
  const me = app.social.account?.id;
  const who = key => { const [owner, , species] = key.split(':'), m = s.members.find(x => x.id === owner), sp = speciesById(species); return { text: `${owner === me ? 'Your' : `${e(m?.name || 'Someone')}'s`} ${e(sp?.name.toLowerCase() || 'animal')}`, art: sp?.id || 'rabbit' }; };
  const rows = s.pals.slice(0, 12).map(p => { const a = who(p.a), b = who(p.b); return `<li class="row"><span class="avatars">${avatar(a.art)}${avatar(b.art)}</span><div class="row-main"><span>${a.text} and ${b.text.replace(/^Your/, 'your')}</span></div></li>`; }).join('');
  return `<h2 class="section-title">Animal friends</h2><ul class="rows pals">${rows}</ul>`;
}

/** Treats on hand: those not already down on the land. */
const treatsLeft = app => Math.max(0, app.store.state.food - (app.ui.sanct?.world?.foodLeft() || 0));

/** Who an animal in the sanctuary belongs to, and which of theirs it is. */
function animalOf(app, id) {
  const t = app.ui.sanct?.layout?.things.find(x => x.id === id);
  if (!t || speciesById(t.species)?.kind !== 'animal') return null;
  const me = app.social.account?.id, m = app.ui.sanct.data.members.find(x => x.id === t.owner);
  const sp = speciesById(t.species);
  return { ...t, mine: t.owner === me, ownerName: m?.name || 'Someone', name: t.owner === me ? `Your ${sp.name.toLowerCase()}` : `${m?.name || 'Someone'}'s ${sp.name.toLowerCase()}` };
}

/** Whether an animal in the sanctuary would eat a treat now. */
function canEat(app, id) {
  const a = animalOf(app, id), now = app.now();
  if (!a) return false;
  if (a.mine) { const item = app.store.item(a.item); return Boolean(item) && hungerOf(item, now) !== 'full'; }
  return Number.isFinite(a.fed) && hungerOf({ fed: a.fed }, now) !== 'full';
}

/** The card under the land about the animal just touched. */
function chipHTML(app) {
  const c = app.ui.sanct?.chip, a = c && animalOf(app, c.id);
  if (!a) return '';
  return `<div class="care-chip">${avatar(a.art || artOf(a.species))}<div class="row-main"><b>${e(a.name)}</b><small>${e(c.note)}</small></div>${a.mine ? `<button class="pill" data-action="open-care" data-id="${e(a.item)}">Details</button>` : ''}</div>`;
}
function showChip(app, id, note) {
  const ui = app.ui.sanct;
  if (!ui) return;
  ui.chip = { id, note };
  clearTimeout(chipTimer);
  chipTimer = setTimeout(() => { if (ui.chip?.id === id) { ui.chip = null; const slot = $('.page.sanctuary .sanct-slot'); if (slot) slot.innerHTML = ''; } }, 7000);
  const slot = $('.page.sanctuary .sanct-slot');
  if (slot) slot.innerHTML = chipHTML(app);
}

/** A pat or strokes for an animal here. Your own grow your bond; anyone else's person hears about it. */
function petted(app, id, done = null) {
  const ui = app.ui.sanct, a = animalOf(app, id);
  if (!ui?.world || !a) return;
  const what = done || ui.world.pet(id, 'pat');
  if (!done) heartAt(ui.world, id, 0);
  if (!what) return;
  if (app.store.state.settings.haptics && !done) haptic('light');
  if (what === 'woke') { showChip(app, id, 'Woke up.'); return; }
  if (a.mine) { if (a.item) app.store.pet(a.item); showChip(app, id, 'Loved that.'); return; }
  showChip(app, id, `Loved that. ${a.ownerName} will hear about it.`);
  if (a.item) app.social.sanctuaryCare(ui.id, a.owner, a.item, a.species, 'pet').catch(() => {});
}
function heartAt(world, id, i) {
  const a = world.animals.get(id);
  if (a) world.events.push({ type: 'heart', u: a.u, v: a.v, lift: a.lift + 0.75, i: i % 3 });
}

/** Something happened on the land that counts: a treat eaten, or two animals from different havens meeting. */
function landEvent(app, event) {
  const ui = app.ui.sanct;
  if (!ui?.data) return;
  if (event.type === 'ate') {
    const a = animalOf(app, event.id);
    if (!a) return;
    if (a.mine) { const r = a.item ? app.store.feed(a.item) : { ok: false }; showChip(app, event.id, r.ok ? `Ate the treat.${r.bond ? ` Bond level ${r.bond.level}. +${r.bond.coins} coins.` : ''}` : 'Ate the treat.'); return; }
    const r = app.store.giveTreat();
    if (!r.ok) return;
    a.fed = app.now();
    const t = ui.layout.things.find(x => x.id === event.id);
    if (t) t.fed = a.fed;
    if (app.store.state.settings.haptics) haptic('success');
    showChip(app, event.id, `Ate your treat. ${a.ownerName} will hear about it.`);
    if (a.item) app.social.sanctuaryCare(ui.id, a.owner, a.item, a.species, 'treat').catch(() => {});
    if (r.achievements?.length) app.announce(r.achievements);
    return;
  }
  if (event.type === 'meet' && !event.pals) {
    const x = animalOf(app, event.a), y = animalOf(app, event.b);
    if (!x || !y || x.owner === y.owner || !x.item || !y.item) return;
    const kx = `${x.owner}:${x.item}:${x.species}`, ky = `${y.owner}:${y.item}:${y.species}`, key = [kx, ky].sort().join('|');
    ui.met ??= new Set();
    if (ui.met.has(key) || ui.data.pals?.some(p => [p.a, p.b].sort().join('|') === key)) return;
    ui.met.add(key);
    // They meet on everyone's screen at different times; whoever sees it first tells the server.
    app.social.sanctuaryPal(ui.id, kx, ky).then(r => { if (r.status === 'friends') toast(`${x.name} and ${y.name.replace(/^Your/, 'your')} are friends now.`); }).catch(() => {});
  }
}

/** Put a treat down on the land, for whoever is hungry and awake to come for. */
function putTreat(app, u, v) {
  const ui = app.ui.sanct, now = app.now();
  if (treatsLeft(app) < 1) { toast(app.store.state.food < 1 ? 'No treats left. Finish a session for more.' : 'All your treats are out.'); return; }
  const animals = [...ui.world.animals.values()];
  const eaters = animals.filter(a => canEat(app, a.id));
  if (!eaters.length) { toast(animals.length ? 'Everyone here is full for now.' : 'No animals live here yet.'); return; }
  if (!eaters.some(a => a.state !== 'sleep')) { toast(isNight(now) ? 'They are asleep. Tap one to wake it.' : 'Nobody can come right now.'); return; }
  if (!ui.world.putFood(u, v)) { toast('That is enough treats for now.'); return; }
  if (app.store.state.settings.haptics) haptic('light');
  app.renderIf('sanctuary');
}

/** The store changed through care (a treat eaten here): show the new treat count. */
export function cared(app) {
  const pill = $('.page.sanctuary [data-action="sanct-feeding"] span');
  if (pill && !app.ui.sanct?.feeding) pill.textContent = `${treatsLeft(app)} ${treatsLeft(app) === 1 ? 'treat' : 'treats'}`;
}

/** On a member's row: a way to become friends, or where that stands. */
function befriend(app, m) {
  const d = app.social.data;
  if (m.id === app.social.account?.id || d.friends.some(f => f.id === m.id)) return '';
  if (d.incoming.some(u => u.id === m.id)) return `<div class="row-end"><button class="primary" data-action="sanct-befriend" data-id="${m.id}" data-accept="1">Accept</button></div>`;
  if (d.outgoing.some(u => u.id === m.id)) return '<div class="row-end"><span class="minutes">Request sent</span></div>';
  return `<div class="row-end"><button class="secondary" data-action="sanct-befriend" data-id="${m.id}" aria-label="Add ${e(m.name)} as a friend">${icon('plus')}Add friend</button></div>`;
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
    const layout = sanctuaryLayout(data.members, { fire: Boolean(data.campfire) });
    await wait(Math.max(0, LEAST_LOADING * 0.6 - (Date.now() - started)));
    advance(2);
    // Let the animals find their feet before anyone sees them.
    const world = new World({ plots: layout.plots });
    setUp(world, layout, data);
    for (let i = 0; i < 40; i++) world.step(0.1, { night: isNight(app.now()), hungry: new Set(), canEat: () => false });
    await wait(Math.max(0, LEAST_LOADING - (Date.now() - started)));
    if (app.ui.sanct !== ui) return;
    // Start close enough that each haven is about 160 px across; the whole land is a zoom out away.
    const across = (layout.dims[0] + layout.dims[1]) / (2 * layout.plots[0].size);
    if (!ui.zoom || ui.zoom === 1) ui.zoom = Math.min(4, Math.max(1, Math.round((across * 160) / Math.max(320, innerWidth - 32) * 4) / 4));
    Object.assign(ui, { data, layout, world });
    app.renderIf('sanctuary');
  } catch (error) {
    if (app.ui.sanct !== ui) return;
    ui.error = error.message;
    app.renderIf('sanctuary');
  }
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Give the world what is not anyone's haven: the great tree to walk round, and who is friends with whom. */
function setUp(world, layout, data) {
  const stage = data.tree?.stage || 0;
  world.setLandmark({ id: 'great-tree', u: layout.tree.u, v: layout.tree.v, solid: TREE_SOLID[stage], perch: TREE_PERCH[stage] || null });
  world.sync(layout.things);
  const idOf = key => { const [owner, item] = key.split(':'); return layout.things.find(t => t.owner === owner && t.item === item)?.id; };
  world.setPals((data.pals || []).map(p => [idOf(p.a), idOf(p.b)]).filter(([a, b]) => a && b));
}

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
      const layout = sanctuaryLayout(data.members, { fire: Boolean(data.campfire) });
      // Treats people here gave just now are known before the owners' cards catch up.
      for (const t of layout.things) { const was = ui.layout.things.find(x => x.owner === t.owner && x.item && x.item === t.item); if (was?.fed > (t.fed || 0)) t.fed = was.fed; }
      ui.world.setLand(5, layout.plots);
      setUp(ui.world, layout, data);
      Object.assign(ui, { data, layout });
      if (!document.activeElement?.closest?.('#view form')) app.renderIf('sanctuary');
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
  stage = { root: host, world: ui.world, els, dims: ui.layout.dims, onEvent: event => landEvent(app, event) };
  paintStage(stage);
  // Start looking at the middle; after that a redraw (someone moved something, a friend accepted)
  // keeps looking where you were.
  const scroll = $('.page.sanctuary .sanct-scroll');
  if (scroll) {
    const [fx, fy] = ui.looking || [0.5, 0.5];
    scroll.scrollLeft = fx * scroll.scrollWidth - scroll.clientWidth / 2;
    scroll.scrollTop = fy * scroll.scrollHeight - scroll.clientHeight / 2;
    scroll.addEventListener('scroll', () => { ui.looking = [(scroll.scrollLeft + scroll.clientWidth / 2) / scroll.scrollWidth, (scroll.scrollTop + scroll.clientHeight / 2) / scroll.scrollHeight]; }, { passive: true });
  }
  last = 0;
  if (!calm()) raf = requestAnimationFrame(frame);
  function frame(ts) {
    if (!host.isConnected) return;
    raf = requestAnimationFrame(frame);
    if (document.visibilityState !== 'visible') { last = 0; return; }
    const dt = last ? Math.min(0.25, (ts - last) / 1000) : 0;
    last = ts;
    if (dt) ui.world.step(dt, { night: isNight(app.now()), hungry: new Set(), canEat: id => canEat(app, id) });
    paintStage(stage);
  }
}
function stop() { cancelAnimationFrame(raf); stage = null; }
function leaveView(app) { stop(); app.ui.sanct = null; app.ui.friendsTab = 'sanctuary'; app.go('friends'); }

// ——— Dialogs ———

function newDialog() {
  openDialog('Make a sanctuary', `<form data-form="sanct-new" novalidate>${field('Name', '<input name="name" maxlength="30" autocomplete="off" required>', 'Everyone in it sees this name.')}
<p class="note">Up to ${MAX} havens.</p><p class="form-error" role="alert" hidden></p>
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
${s.members.length >= MAX ? '<p class="note">The sanctuary is full.</p>' : rows ? `<h3 class="group-title">Your friends</h3><ul class="rows">${rows}</ul>` : ''}`);
}
function campfireDialog(app) {
  const minutes = app.store.state.settings.minutes, s = app.ui.sanct.data;
  openDialog('Light a campfire', `<form data-form="sanct-campfire" novalidate><p class="lead">Everyone in ${e(s.name)} is invited. You start it.</p>
${field('Length', `<select name="minutes">${[15, 25, 30, 45, 50, 60, 90, 120].map(m => `<option value="${m}" ${m === minutes || (m === 25 && ![15, 30, 45, 50, 60, 90, 120].includes(minutes)) ? 'selected' : ''}>${formatMinutes(m)}</option>`).join('')}</select>`)}
<fieldset class="choices"><legend>If someone leaves</legend>
<label><input type="radio" name="rule" value="together" checked><span><b>The fire goes out for everyone</b><small>1.2× coins if you all finish.</small></span></label>
<label><input type="radio" name="rule" value="gentle"><span><b>Only they lose theirs</b><small>The rest carry on.</small></span></label></fieldset>
<p class="form-error" role="alert" hidden></p><div class="button-row"><button class="primary wide" type="submit">${icon('flame')}Light it</button></div></form>`);
}
/** Someone in the sanctuary: their haven, becoming friends, reporting or blocking them. */
function memberDialog(app, id) {
  const s = app.ui.sanct.data, m = s.members.find(x => x.id === id);
  if (!m) return;
  const d = app.social.data, friend = d.friends.some(f => f.id === id);
  const relation = friend ? '<p class="note">You are friends.</p>' : d.outgoing.some(u => u.id === id) ? '<p class="note">Friend request sent.</p>' : '';
  const add = friend || d.outgoing.some(u => u.id === id) ? '' : `<button class="secondary" data-action="sanct-befriend" data-id="${id}"${d.incoming.some(u => u.id === id) ? ' data-accept="1"' : ''}>${icon('plus')}${d.incoming.some(u => u.id === id) ? 'Accept their request' : 'Add friend'}</button>`;
  openDialog(m.name, `<p class="lead">@${e(m.handle)}. ${m.focusing ? 'Focusing now.' : m.online ? 'Online.' : `Level ${Number(m.card?.level) || 1}.`}</p>${relation}
<div class="button-row"><button class="secondary" data-action="sanct-find" data-id="${id}" data-close="1">Show their haven</button>${add}</div>
<div class="button-row quiet"><button class="linklike" data-action="report" data-id="${id}" data-name="${e(m.name)}" data-place="sanctuary">Report</button><button class="linklike danger" data-action="sanct-block" data-id="${id}">Block</button></div>`);
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
  'sanct-pet'(app, d) { if (Date.now() - justPetted < 600) return; petted(app, d.ent); },
  'sanct-feeding'(app) { const ui = app.ui.sanct; if (!ui?.data) return; ui.feeding = !ui.feeding; app.render(); },
  'sanct-campfire': app => campfireDialog(app),
  'sanct-fire-join': (app, d, el) => guard(async () => {
    await app.social.roomJoin(d.code, app.store.state.settings.species);
    app.ui.friendsTab = 'campfire';
    toast('You joined the campfire.');
    app.go('friends');
  }, el),
  'sanct-member': (app, d) => memberDialog(app, d.id),
  'sanct-block': async (app, d) => {
    const m = app.ui.sanct?.data.members.find(x => x.id === d.id);
    if (!(await app.confirm(`Block ${e(m?.name || 'them')}?`, 'They can no longer find you or send you requests. You both stay in this sanctuary.', 'Block'))) return;
    guard(async () => { await app.social.block(d.id); toast('Blocked.'); app.renderIf('sanctuary'); });
  },
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
  'sanct-befriend': (app, d, el) => guard(async () => {
    const m = app.ui.sanct?.data?.members.find(x => x.id === d.id), name = m?.name || 'They';
    if (d.accept) { await app.social.respond(d.id, true); toast(`You and ${name} are friends now.`); }
    else { const r = await app.social.request(d.id); toast(r.status === 'friends' ? `You and ${name} are friends now.` : `Friend request sent to ${name}.`); }
    app.renderIf('sanctuary');
  }, el),
  'sanct-copy': async app => { toast((await copyText(prettyCode(app.ui.sanct.data.code))) ? 'Code copied.' : 'Could not copy.'); },
  'sanct-share': async app => {
    const s = app.ui.sanct.data;
    const how = await share({ title: 'Haven', text: `Join my sanctuary "${s.name}" on Haven. Open Friends, then Sanctuary, and enter the code ${prettyCode(s.code)}.` });
    if (how === 'copied') toast('Invite copied.'); else if (how === 'failed') toast('Could not share.');
  },
  'sanct-zoom': (app, d) => {
    const ui = app.ui.sanct;
    ui.zoom = Math.min(4, Math.max(1, (ui.zoom || 1) * (Number(d.step) > 0 ? 1.25 : 0.8)));
    app.render(); // the view stays centred on the same spot (see mounted)
  },
  /** Scroll to a member's haven. */
  'sanct-find': (app, d) => {
    if (d.close && dialogOpen()) closeDialog();
    const plot = app.ui.sanct.layout.plots.find(p => p.id === d.id), host = $('.page.sanctuary .sanctuary-land'), scroll = $('.page.sanctuary .sanct-scroll');
    if (!plot || !host || !scroll) return;
    const sign = [...host.querySelectorAll('.plot-sign')][app.ui.sanct.layout.plots.indexOf(plot)];
    sign?.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'center', inline: 'center' });
    sign?.classList.remove('flash'); void sign?.offsetWidth; sign?.classList.add('flash');
  },
  'sanct-leave': async app => {
    const s = app.ui.sanct.data;
    if (!(await app.confirm('Leave the sanctuary?', `Your haven leaves ${e(s.name)}.`, 'Leave'))) return;
    guard(async () => { await app.social.sanctuaryLeave(s.id); toast(`You left ${s.name}.`); leaveView(app); });
  },
  'sanct-remove': async (app, d, el) => {
    const s = app.ui.sanct.data, m = s.members.find(x => x.id === d.id);
    if (!(await app.confirm(`Ask ${e(m?.name || 'them')} to leave?`, 'Their haven leaves the sanctuary.', 'Ask to leave'))) return;
    guard(async () => { await app.social.sanctuaryEdit(s.id, { remove: d.id }); toast(`${m?.name || 'They'} left the sanctuary.`); changed(app, { id: s.id }); });
  },
};

export const forms = {
  'sanct-campfire': (app, form) => busy(form, async () => {
    try {
      await app.social.sanctuaryCampfire(app.ui.sanct.id, Number(form.minutes.value), form.rule.value, app.store.state.settings.species);
      closeDialog();
      toast('Campfire lit.');
      app.ui.friendsTab = 'campfire';
      app.go('friends');
    } catch (error) { formError(form, error.message); }
  }),
  'sanct-new': (app, form) => busy(form, async () => {
    try { const s = await app.social.sanctuaryCreate(form.name.value); closeDialog(); toast(`${s.name} is ready.`); await open(app, s.id); inviteDialog(app); }
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

// ——— Touch: stroking animals, and treats on the land ———

/** Called once at start: a finger moving over an animal strokes it; a tap on the land while giving treats puts one down. */
export function wire(app) {
  document.addEventListener('pointerdown', event => {
    const el = event.target.closest?.('.sanctuary-land .ent.animal[data-ent]'), ui = app.ui.sanct;
    if (!el || !ui?.world || event.button > 0) return;
    petting = { id: el.dataset.ent, x: event.clientX, y: event.clientY, run: 0, strokes: 0, woke: false, pointer: event.pointerId };
  });
  document.addEventListener('pointermove', event => {
    const ui = app.ui.sanct;
    if (!petting || event.pointerId !== petting.pointer || !ui?.world) return;
    petting.run += Math.hypot(event.clientX - petting.x, event.clientY - petting.y);
    petting.x = event.clientX; petting.y = event.clientY;
    if (petting.run < 28) return;
    petting.run = 0;
    const what = ui.world.pet(petting.id, 'stroke');
    if (what === 'woke') petting.woke = true;
    if (what) { petting.strokes++; heartAt(ui.world, petting.id, petting.strokes); if (petting.strokes % 3 === 1 && app.store.state.settings.haptics) haptic('light'); }
  });
  const finish = event => {
    if (!petting || event.pointerId !== petting.pointer) return;
    const p = petting;
    petting = null;
    if (!p.strokes) return;
    justPetted = Date.now();
    petted(app, p.id, p.woke ? 'woke' : 'pat');
  };
  document.addEventListener('pointerup', finish);
  document.addEventListener('pointercancel', finish);
  document.addEventListener('click', event => {
    const land = event.target.closest?.('.page.sanctuary .sanctuary-land'), ui = app.ui.sanct;
    if (!land || event.target.closest('.ent') || !ui?.feeding || !ui.world) return;
    const box = land.getBoundingClientRect(), p = unproject(ui.layout.dims, (event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
    if (!ui.layout.plots.some(q => p.u > q.u0 && p.u < q.u0 + q.size && p.v > q.v0 && p.v < q.v0 + q.size)) return;
    putTreat(app, p.u, p.v);
  });
}
