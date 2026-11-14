// The Collection screen: every plant and animal, and how to get each one.
import { e, $, icon, segmented, openDialog, closeDialog, toast, avatar } from '../ui.js';
import { availability, facts, goalProgress } from '../core.js';
import { KINDS, ofKind, HABITATS, speciesById, seasonText, goalText, inSeason } from '../catalog.js';
import { pickSpecies } from './focus.js';
import { traitsOf } from '../world.js';
import { sprite } from '../art.js';

function status(app, sp) {
  const { store } = app, how = availability(store.state, sp, app.now());
  if (how === 'owned') return { how, text: 'Yours' };
  if (how === 'season') return { how, text: 'Free this season' };
  if (how === 'goal') return { how, text: 'Earned, free' };
  return { how, text: `${sp.price} coins` };
}

export function render(app) {
  const { store } = app, kind = app.ui.collection, list = ofKind(kind);
  const owned = list.filter(sp => store.state.unlocked.includes(sp.id)).length;
  const cards = list.map(sp => { const st = status(app, sp); return `<button class="species-card ${st.how}" data-action="species" data-id="${sp.id}">${sprite(sp.id, { kind: sp.kind })}<b>${e(sp.name)}</b><small>${st.how === 'owned' ? '' : st.how === 'locked' ? icon('lock') : ''}${e(st.text)}</small></button>`; }).join('');
  return `<section class="page collection" data-page="collection"><h1 class="page-title">Collection</h1>
<p class="lead">${owned} of ${list.length} ${kind === 'plant' ? 'plants' : kind === 'animal' ? 'animals' : 'nature items'} unlocked. You have ${store.state.coins} coins.${kind === 'nature' ? ' Nature is built with longer sessions, and animals come to use it.' : ''}</p>
${segmented('collection-tab', KINDS.map(([id, label]) => [id, label]), kind, 'Plants, animals or nature')}
<div class="species-grid">${cards}</div></section>`;
}

/** Who likes it, or what it likes: the reason to have both. */
function extra(sp) {
  const names = ids => [...new Set(ids.map(id => speciesById(id)?.name).filter(Boolean))].slice(0, 4).join(', ');
  if (sp.kind === 'animal') { const likes = names(traitsOf(sp.id).likes); return likes ? `<div><dt>Likes</dt><dd>${likes}</dd></div>` : ''; }
  const fans = names(ofKind('animal').filter(a => traitsOf(a.id).likes.includes(sp.id)).map(a => a.id));
  return fans ? `<div><dt>Liked by</dt><dd>${fans}</dd></div>` : '';
}

export function speciesDialog(app, id) {
  const { store, social } = app, sp = speciesById(id), st = status(app, sp), now = app.now();
  const have = store.state.items.filter(i => i.s === id).length;
  const ways = [];
  if (st.how !== 'owned') {
    if (sp.season) ways.push(`Free from ${seasonText(sp)}.${inSeason(sp, new Date(now).getMonth() + 1) ? ' That is now.' : ''}`);
    if (sp.goal) { const g = goalProgress(sp.goal, facts(store.state, now)); ways.push(`${goalText(sp.goal)} to earn it free. You are at ${g.have} of ${g.need}.`); }
    if (sp.price) ways.push(`${sp.season || sp.goal ? 'Or unlock it' : 'Unlock it'} for ${sp.price} coins.`);
  }
  const short = sp.price - store.state.coins;
  const buttons = st.how === 'owned'
    ? `<button class="secondary" data-action="gift-start" data-id="${id}" ${social.signedIn && social.data.friends.length ? '' : 'disabled'}>${icon('gift')}Send to a friend</button><button class="primary" data-action="grow-next" data-id="${id}">${sp.kind === 'nature' ? 'Build' : 'Grow'} this next</button>`
    : st.how === 'locked' ? `<button class="primary wide" disabled>You need ${short} more coins</button>`
    : `<button class="primary wide" data-action="unlock" data-id="${id}">${st.how === 'buy' ? `Unlock for ${sp.price} coins` : 'Unlock free'}</button>`;
  openDialog(sp.name, `<div class="result-art${st.how === 'locked' ? ' dim' : ''}">${sprite(id, { kind: sp.kind, label: sp.name })}</div>
<p class="lead">${e(sp.blurb)}</p>
<dl class="facts"><div><dt>${sp.kind === 'nature' ? 'Part of the' : 'Lives in'}</dt><dd>${HABITATS[sp.habitat]}</dd></div>${sp.minMinutes ? `<div><dt>Takes</dt><dd>A session of ${sp.minMinutes} min or more</dd></div>` : ''}${extra(sp)}${st.how === 'owned' ? `<div><dt>You have grown</dt><dd>${have}</dd></div>` : ''}</dl>
${ways.length ? `<ul class="plain">${ways.map(w => `<li>${e(w)}</li>`).join('')}</ul>` : ''}
${st.how === 'owned' && !(social.signedIn && social.data.friends.length) ? '<p class="note">Add a friend to send gifts.</p>' : ''}
<div class="button-row">${buttons}</div>`);
}

function giftDialog(app, id) {
  const { store, social } = app, sp = speciesById(id), price = store.giftPrice(id);
  const rows = social.data.friends.map(f => `<li class="row"><button class="row-main pick" data-action="gift-send" data-id="${id}" data-to="${f.id}">${avatar(f.avatar)}<span><b>${e(f.name)}</b><small>@${e(f.handle)}</small></span></button></li>`).join('');
  openDialog(`Send a ${sp.name.toLowerCase()}`, `<p class="lead">Costs ${price} coins. You have ${store.state.coins}. It arrives ready to place in their haven.</p><ul class="rows">${rows}</ul>`);
}

export const actions = {
  'collection-tab'(app, d) { app.ui.collection = d.value; app.render(); },
  species: (app, d) => speciesDialog(app, d.id),
  unlock(app, d) {
    const r = app.store.unlock(d.id);
    if (!r.ok) return toast(r.error);
    app.announce(r.achievements, `Unlocked: ${speciesById(d.id).name}.`);
    speciesDialog(app, d.id);
  },
  'grow-next'(app, d) { closeDialog(); app.go('focus'); toast(`${speciesById(d.id).kind === 'nature' ? 'Building' : 'Growing'} next: ${speciesById(d.id).name}.`); pickSpecies(app, d.id); },
  'gift-start': (app, d) => giftDialog(app, d.id),
  'gift-send': async (app, d, el) => {
    const paid = app.store.payForGift(d.id);
    if (!paid.ok) return toast(paid.error);
    el.disabled = true;
    try {
      await app.social.gift(d.to, d.id);
      closeDialog();
      app.announce(paid.achievements, `Sent to ${app.social.data.friends.find(f => f.id === d.to)?.name || 'your friend'}.`);
    } catch (error) { app.store.refundGift(d.id); toast(error.message); el.disabled = false; }
  },
};
