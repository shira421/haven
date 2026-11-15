// The living haven on the home screen: it runs the animals, lets things be tapped, dragged and
// arranged, and holds the care screens for feeding, petting and naming.
import { e, $, icon, openDialog, closeDialog, toast, field, avatar, empty } from '../ui.js';
import { hungerOf, moodOf, bondLevel, canPet, isNight, CARE } from '../core.js';
import { speciesById, ANIMALS, BREEDS, artOf } from '../catalog.js';
import { sprite } from '../art.js';
import { World, traitsOf } from '../world.js';
import { project, unproject, thingsFromStore } from '../scene.js';

const HUNGER = { full: 'Full', peckish: 'Peckish', hungry: 'Hungry' };
const lower = s => s.name.toLowerCase();
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const dateText = ts => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const listText = names => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

let root = null, raf = 0, last = 0, hungry = new Set(), hungryAt = 0, drag = null, justDragged = 0;
const els = new Map();

// ——— Running the world ———

/** Called after every draw of the home screen: connect the simulation to the new elements. */
export function mounted(app) {
  root = $('.page.focus .world.interactive');
  cancelAnimationFrame(raf);
  els.clear();
  if (!root) return;
  const side = app.store.side();
  if (!app.world) app.world = new World({ side });
  app.world.sync(thingsFromStore(app.store), side);
  for (const el of root.querySelectorAll('.ent[data-ent]')) els.set(el.dataset.ent, el);
  if (app.ui.edit.picked) root.querySelector(`.ent[data-ent="${app.ui.edit.picked}"]`)?.classList.add('picked');
  hungryAt = 0;
  paint(app);
  last = 0;
  if (!calm()) raf = requestAnimationFrame(ts => frame(app, ts));
}

function frame(app, ts) {
  if (!root?.isConnected) return;
  raf = requestAnimationFrame(next => frame(app, next));
  if (document.visibilityState !== 'visible') { last = 0; return; }
  const dt = last ? Math.min(0.25, (ts - last) / 1000) : 0;
  last = ts;
  const now = app.now();
  if (now - hungryAt > 5000) { hungryAt = now; hungry = new Set(app.store.animals().filter(i => hungerOf(i, now) === 'hungry').map(i => i.id)); }
  if (dt) app.world.step(dt, { night: isNight(now), hungry });
  paint(app);
}

/** Put every animal where the simulation says it is. */
function paint(app) { paintStage({ root, world: app.world, els, dims: app.world.side }); }

/**
 * Draw a running world: move each animal's element to where the simulation has it, and play the
 * effects it asked for. `dims` is the land's size, as for project(). Used by the haven and the sanctuary.
 */
export function paintStage({ root: at0, world, els: map, dims }) {
  for (const a of world.animals.values()) {
    const el = map.get(a.id);
    if (!el || drag?.id === a.id) continue;
    // The element stays on the ground under the animal; the drawing inside is what leaves it.
    const at = project(dims, a.u, a.v), over = a.over && world.things.get(a.over);
    const depth = over ? Math.max(at.depth, project(dims, over.u, over.v).depth + 1) : at.depth;
    const k = el._k ??= Number(el.style.getPropertyValue('--k')) || 50;
    const look = `${at.left.toFixed(2)}|${at.top.toFixed(2)}|${depth}|${((a.lift + a.wob) * k).toFixed(1)}|${a.tilt.toFixed(0)}|${a.act}|${a.face}|${a.air ? 1 : 0}|${a.state === 'sleep' ? 1 : 0}`;
    if (el._look !== look) {
      el._look = look;
      el.style.left = at.left.toFixed(2) + '%';
      el.style.top = at.top.toFixed(2) + '%';
      el.style.zIndex = depth;
      el.style.setProperty('--lift', ((a.lift + a.wob) * k).toFixed(1));
      el.style.setProperty('--tilt', a.tilt.toFixed(0) + 'deg');
      if (el.dataset.act !== a.act) el.dataset.act = a.act;
      el.classList.toggle('flip', a.face < 0);
      el.classList.toggle('air', a.air);
      el.classList.toggle('asleep', a.state === 'sleep');
    }
    const emote = el.lastElementChild;
    if (emote && emote.dataset.kind !== (a.emote || '')) emote.dataset.kind = a.emote || '';
  }
  for (const event of world.events.splice(0)) {
    if (calm()) continue;
    const el = event.id ? map.get(event.id) : null;
    if (event.type === 'rustle' && el) again(el, 'rustle');
    else if (event.type === 'land') { if (el) again(el, 'landed'); if (!event.soft) effect(at0, dims, 'puff', event.u, event.v); }
    else if (event.type === 'splash') effect(at0, dims, 'splash', event.u, event.v);
    else if (event.type === 'leaves') for (let i = 0; i < 3; i++) effect(at0, dims, 'leaf', event.u, event.v, event.lift * (0.75 + i * 0.1), i);
  }
}

/** Play a one-off animation on an element again from the start. */
function again(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

/** A short-lived effect on the land: a puff of dust, a splash, a falling leaf. It removes itself. */
function effect(host, dims, kind, u, v, lift = 0, i = 0) {
  if (!host || host.querySelectorAll('.fx').length > 24) return;
  const at = project(dims, u, v, lift), fx = document.createElement('i');
  fx.className = `fx ${kind}`;
  fx.style.cssText = `left:${at.left.toFixed(2)}%;top:${at.top.toFixed(2)}%;z-index:${project(dims, u, v).depth + 2};--i:${i}`;
  fx.addEventListener('animationend', () => fx.remove());
  host.append(fx);
}

/** The point on the land under a pointer. */
function landPoint(app, event) {
  const box = root.getBoundingClientRect();
  const p = unproject(app.store.side(), (event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
  return app.store.onLand(p.u, p.v);
}

/** Dragging in arrange mode, and tapping the ground to place something from storage. */
export function wire(app) {
  document.addEventListener('pointerdown', event => {
    const el = event.target.closest?.('.world.interactive .ent[data-ent]');
    if (!el || !app.ui.edit.on || event.button > 0) return;
    drag = { id: el.dataset.ent, el, x: event.clientX, y: event.clientY, moved: false, pointer: event.pointerId };
  });
  document.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8) return;
    drag.moved = true;
    drag.el.classList.add('dragging');
    const [u, v] = landPoint(app, event), at = project(app.store.side(), u, v);
    drag.at = [u, v];
    drag.el.style.left = at.left + '%'; drag.el.style.top = at.top + '%'; drag.el.style.zIndex = at.depth;
    event.preventDefault();
  }, { passive: false });
  const finish = event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const d = drag;
    drag = null;
    if (!d.moved || !d.at || event.type === 'pointercancel') { d.el.classList.remove('dragging'); if (d.moved) app.render(); return; }
    justDragged = Date.now();
    app.world.drop(d.id, d.at[0], d.at[1]);
    const r = app.store.place(d.id, d.at[0], d.at[1]);
    if (!r.ok) toast(r.error);
  };
  document.addEventListener('pointerup', finish);
  document.addEventListener('pointercancel', finish);
  document.addEventListener('click', event => {
    const world = event.target.closest?.('.world.interactive');
    if (!world || event.target.closest('.ent')) return;
    // Outside arranging, a tap on the ground calls whoever is near.
    if (!app.ui.edit.on) {
      const box = root.getBoundingClientRect(), side = app.store.side(), p = unproject(side, (event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
      if (p.u >= 0 && p.v >= 0 && p.u <= side && p.v <= side) app.world?.attract(p.u, p.v);
      return;
    }
    if (!app.ui.edit.item) return;
    const [u, v] = landPoint(app, event), id = app.ui.edit.item;
    const r = app.store.place(id, u, v);
    if (!r.ok) return toast(r.error);
    app.world?.drop(id, u, v);
    app.ui.edit = { on: true, picked: null, item: null };
    app.announce(r.achievements);
    app.render();
  });
}

// ——— What the home screen shows around the world ———

/** The two buttons that sit on the scene: care and arrange. */
export function tools(app) {
  const { store } = app, now = app.now(), animals = store.animals(), food = store.state.food;
  const hungryNow = animals.filter(i => hungerOf(i, now) === 'hungry').length;
  const care = animals.length ? `<button class="pill${hungryNow ? ' wants' : ''}" data-action="care" aria-label="Care. ${hungryNow ? `${hungryNow} hungry. ` : ''}${food} ${food === 1 ? 'treat' : 'treats'}">${icon('treat')}<span>${hungryNow ? `${hungryNow} hungry` : `${food} ${food === 1 ? 'treat' : 'treats'}`}</span></button>` : '';
  return `<div class="scene-tools">${care}<button class="pill" data-action="arrange">${icon('edit')}<span>Arrange</span></button></div>`;
}

/** The panel under the scene while arranging. */
export function arrangePanel(app) {
  const { store } = app, ui = app.ui.edit, stored = store.stored();
  const picked = ui.picked ? store.item(ui.picked) : null, chosen = ui.item ? store.item(ui.item) : null;
  const groups = new Map();
  for (const item of stored) { const key = `${item.s}:${item.z}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); }
  const tray = [...groups.values()].map(list => { const item = list[0], sp = speciesById(item.s); return `<button class="tray-item" data-action="tray" data-id="${e(item.id)}" aria-pressed="${Boolean(chosen && list.some(i => i.id === chosen.id))}" aria-label="${e(sp.name)}, ${['small', 'medium', 'large'][item.z - 1]}, ${list.length} in storage">${sprite(sp.id, { kind: sp.kind })}<span>${list.length}</span></button>`; }).join('');
  const hint = chosen ? `${e(store.nameOf(chosen))}${chosen.from ? `, a gift from ${e(chosen.from)}` : ''}. Tap the land where it should go.`
    : picked ? `${e(store.nameOf(picked))}. Drag it, or choose below.`
    : stored.length ? 'Drag things to move them. Tap something in storage, then tap the land.' : 'Drag anything to move it. Tap it for more.';
  return `<div class="panel arrange"><p class="note" aria-live="polite">${hint}</p>
${tray ? `<div class="tray" role="group" aria-label="In storage">${tray}</div>` : ''}
<div class="button-row">${chosen ? '<button class="secondary" data-action="place-anywhere">Place it for me</button>' : ''}${picked ? '<button class="secondary" data-action="store-item">Put in storage</button><button class="secondary danger" data-action="release-item">Let it go</button>' : ''}<button class="primary" data-action="arrange">Done</button></div>
<p class="note">Your land holds ${store.capacity()} things. ${store.room()} more fit.${store.side() < 10 ? ` It grows at level ${store.level().level + (store.level().level % 2 === 0 ? 1 : 2)}.` : ''}</p></div>`;
}

// ——— Care ———

function likesText(species) {
  const names = [...new Set(traitsOf(species.id).likes.map(id => speciesById(id)?.name.toLowerCase()).filter(Boolean))].slice(0, 4);
  return names.length ? `Likes ${listText(names)}.` : '';
}
function fansText(species) {
  const fans = ANIMALS.filter(a => traitsOf(a.id).likes.includes(species.id)).map(a => a.name.toLowerCase() + 's').slice(0, 4);
  return fans.length ? `${listText(fans).replace(/^./, c => c.toUpperCase())} like this.` : '';
}

function careDialog(app, id) {
  const { store } = app, item = store.item(id), now = app.now();
  if (!item) return;
  const sp = speciesById(item.s), hunger = hungerOf(item, now), level = bondLevel(item.bond), into = (item.bond || 0) % (CARE.maxBond / CARE.levels);
  const hearts = Array.from({ length: CARE.levels }, (_, i) => `<i class="heart${i < level ? ' on' : ''}"></i>`).join('');
  const feed = hunger === 'full' ? '<button class="primary" disabled>Full for now</button>'
    : store.state.food < 1 ? '<button class="primary" disabled>No treats left</button>'
    : `<button class="primary" data-action="feed" data-id="${e(id)}" autofocus>${icon('treat')}Feed</button>`;
  const breed = item.s === 'dog' ? `<fieldset class="avatar-pick breed-pick"><legend>Breed</legend>${BREEDS.map(([b, label]) => `<label title="${e(label)}"><input type="radio" name="breed" value="${b}" data-change="breed" data-id="${e(id)}" ${(item.breed || 'mixed') === b ? 'checked' : ''}><span class="sr-only">${e(label)}</span>${avatar(artOf('dog', b))}<small>${e(label)}</small></label>`).join('')}</fieldset>` : '';
  const breedName = item.s === 'dog' && item.breed && item.breed !== 'mixed' ? BREEDS.find(b => b[0] === item.breed)?.[1] : null;
  openDialog(store.nameOf(item), `<div class="result-art small">${sprite(artOf(item.s, item.breed), { kind: sp.kind, label: breedName || sp.name })}</div>
<p class="lead">${item.name || breedName ? `${e(breedName || sp.name)}. ` : ''}${moodOf(item, now, isNight(now))}. ${e(likesText(sp))}</p>
<dl class="facts"><div><dt>Bond</dt><dd><span class="hearts" role="img" aria-label="${level} of ${CARE.levels}">${hearts}</span></dd></div>
<div><dt>Hunger</dt><dd>${HUNGER[hunger]}</dd></div><div><dt>${item.from ? 'A gift from' : 'Moved in'}</dt><dd>${item.from ? e(item.from) : dateText(item.at)}</dd></div></dl>
${level < CARE.levels ? `<div class="meter" role="progressbar" aria-label="Progress to the next bond level" aria-valuemin="0" aria-valuemax="20" aria-valuenow="${into}"><i style="width:${into * 5}%"></i></div><p class="note">Feeding and petting grow the bond. Each new level pays coins.</p>` : '<p class="note">You are as close as can be.</p>'}
<div class="button-row"><button class="secondary" data-action="pet" data-id="${e(id)}">${icon('heart')}Pet</button>${feed}</div>
<p class="note">You have ${store.state.food} ${store.state.food === 1 ? 'treat' : 'treats'}. Every finished session earns more.</p>
${breed}<form data-form="rename" data-id="${e(id)}" class="inline-form">${field('Name', `<input name="name" maxlength="20" value="${e(item.name || '')}" placeholder="${e(sp.name)}" autocomplete="off">`)}<button class="secondary" type="submit">Save name</button></form>
<div class="button-row quiet"><button class="linklike" data-action="store-this" data-id="${e(id)}">Put in storage</button><button class="linklike danger" data-action="release-this" data-id="${e(id)}">Let it go</button></div>`);
}

function thingDialog(app, id) {
  const { store } = app, item = store.item(id);
  if (!item) return;
  const sp = speciesById(item.s);
  openDialog(sp.name, `<div class="result-art small">${sprite(sp.id, { kind: sp.kind, label: sp.name })}</div>
<p class="lead">${e(sp.blurb)} ${e(fansText(sp))}</p>
<dl class="facts"><div><dt>${item.from ? 'A gift from' : sp.kind === 'nature' ? 'Built' : 'Grown'}</dt><dd>${item.from ? e(item.from) : dateText(item.at)}</dd></div><div><dt>Size</dt><dd>${['Small', 'Medium', 'Large'][item.z - 1]}</dd></div></dl>
<div class="button-row"><button class="secondary" data-action="store-this" data-id="${e(id)}">Put in storage</button><button class="secondary danger" data-action="release-this" data-id="${e(id)}">Let it go</button></div>
<p class="note">To move it, close this and choose Arrange.</p>`);
}

function careList(app) {
  const { store } = app, now = app.now(), night = isNight(now);
  const animals = store.animals().sort((a, b) => (a.fed || 0) - (b.fed || 0));
  const waiting = animals.filter(i => hungerOf(i, now) !== 'full').length;
  const rows = animals.map(item => { const hunger = hungerOf(item, now); return `<li class="row"><button class="row-main pick" data-action="open-care" data-id="${e(item.id)}">${avatar(artOf(item.s, item.breed))}<span><b>${e(store.nameOf(item))}</b><small>${moodOf(item, now, night)}, bond ${bondLevel(item.bond)} of ${CARE.levels}</small></span></button><div class="row-end">${hunger === 'full' ? '<span class="minutes">Full</span>' : `<button class="secondary" data-action="feed" data-id="${e(item.id)}" data-list="1" ${store.state.food < 1 ? 'disabled' : ''}>Feed</button>`}</div></li>`; }).join('');
  openDialog('Care', `<p class="lead">You have ${store.state.food} ${store.state.food === 1 ? 'treat' : 'treats'}. Every finished session earns more: one, and one more for each 15 min.</p>
${rows ? `<ul class="rows">${rows}</ul>` : empty('No animals live here yet. Choose an animal to grow in your next session.')}
${waiting ? `<div class="button-row"><button class="primary wide" data-action="feed-all" ${store.state.food < 1 ? 'disabled' : ''}>Feed everyone who will eat</button></div>` : rows ? '<p class="note">Everyone is full. Animals get peckish after 6 hours. They never leave or come to harm if you are away.</p>' : ''}`);
}

/** Say what a feed or a pat did. */
function careToast(app, name, lead, r) {
  const bond = r.bond ? ` Bond level ${r.bond.level}. +${r.bond.coins} coins.` : '';
  app.announce(r.achievements, `${lead}${bond}`);
}

export const actions = {
  arrange(app) { app.ui.edit = { on: !app.ui.edit.on, picked: null, item: null }; app.render(); },
  tray(app, d) { app.ui.edit = { on: true, picked: null, item: app.ui.edit.item === d.id ? null : d.id }; app.render(); },
  ent(app, d) {
    if (Date.now() - justDragged < 350) return;
    const item = app.store.item(d.ent);
    if (!item) return;
    if (app.ui.edit.on) { app.ui.edit = { on: true, picked: app.ui.edit.picked === d.ent ? null : d.ent, item: null }; app.render(); return; }
    if (speciesById(item.s).kind === 'animal') careDialog(app, d.ent); else thingDialog(app, d.ent);
  },
  'place-anywhere'(app) {
    const id = app.ui.edit.item, spot = app.store.placeAnywhere(id);
    if (!spot) return toast(`Your land is full. It holds ${app.store.capacity()} things at this level.`);
    app.world?.drop(id, spot[0], spot[1]);
    app.ui.edit = { on: true, picked: null, item: null };
    app.render();
  },
  'store-item'(app) { app.store.unplace(app.ui.edit.picked); app.ui.edit = { on: true, picked: null, item: null }; app.render(); toast('Put in storage.'); },
  'release-item': app => actions['release-this'](app, { id: app.ui.edit.picked }),
  'store-this'(app, d) { app.store.unplace(d.id); closeDialog(); toast('Put in storage. Choose Arrange to bring it back.'); },
  'release-this': async (app, d) => {
    const item = app.store.item(d.id);
    if (!item) return;
    const sp = speciesById(item.s);
    if (!(await app.confirm('Let it go?', `${sp.kind === 'animal' ? e(app.store.nameOf(item)) : `The ${lower(sp)}`} leaves your haven for good. The session that brought it still counts.`, 'Let it go'))) return;
    app.store.release(d.id);
    app.ui.edit = { on: app.ui.edit.on, picked: null, item: null };
    app.render();
  },
  care: app => careList(app),
  'open-care': (app, d) => careDialog(app, d.id),
  feed(app, d) {
    const item = app.store.item(d.id), r = app.store.feed(d.id);
    if (!r.ok) return toast(r.error);
    app.world?.react(d.id, 'eat');
    app.world?.emote(d.id, 'heart', 3);
    careToast(app, '', `${app.store.nameOf(item)} ate.`, r);
    if (d.list) careList(app); else careDialog(app, d.id);
  },
  'feed-all'(app) {
    const r = app.store.feedAll();
    if (!r.ok) return toast('You have no treats. Every finished session earns some.');
    for (const id of r.fed) { app.world?.react(id, 'eat'); app.world?.emote(id, 'heart', 3); }
    const coins = r.bonds.reduce((n, b) => n + b.coins, 0);
    app.announce(r.achievements, `Fed ${r.fed.length} ${r.fed.length === 1 ? 'animal' : 'animals'}.${r.left ? ` ${r.left} still waiting: no treats left.` : ''}${coins ? ` Bonds grew. +${coins} coins.` : ''}`);
    careList(app);
  },
  pet(app, d) {
    const item = app.store.item(d.id), r = app.store.pet(d.id);
    if (!r.ok) return;
    app.world?.react(d.id, 'joy');
    app.world?.emote(d.id, 'heart', 2.5);
    if (r.counted) { careToast(app, '', `${app.store.nameOf(item)} liked that.`, r); careDialog(app, d.id); }
    else toast(`${app.store.nameOf(item)} liked that. Pats count toward the bond once an hour.`);
  },
};

export const changes = {
  breed(app, el) { if (app.store.setBreed(el.dataset.id, el.value).ok) careDialog(app, el.dataset.id); },
};

export const forms = {
  rename(app, form) { app.store.rename(form.dataset.id, form.name.value); toast('Name saved.'); careDialog(app, form.dataset.id); },
};
export { canPet };
