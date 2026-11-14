// The Haven screen: the island, and arranging what stands on it.
import { e, $, icon, empty, toast } from '../ui.js';
import { formatMinutes } from '../core.js';
import { speciesById } from '../catalog.js';
import { sprite } from '../art.js';
import { islandSVG, tilesFromStore } from '../scene.js';

export function render(app) {
  const { store } = app, ui = app.ui.edit, tiles = tilesFromStore(store), side = store.side(), level = store.level();
  const plants = tiles.filter(t => speciesById(t.species).kind === 'plant').length, animals = tiles.length - plants;
  const stored = store.stored();
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const summary = tiles.length ? `${count(plants, 'plant', 'plants')} and ${count(animals, 'animal', 'animals')} live here.` : 'Nothing lives here yet. Finish a session and it will.';
  const nextLand = side < 10 ? ` Your land grows at level ${level.level + (level.level % 2 === 0 ? 1 : 2)}.` : '';
  const picked = ui.picked ? store.state.haven.tiles[ui.picked] : null;
  const pickedItem = picked ? store.item(picked) : ui.item ? store.item(ui.item) : null;
  const groups = new Map();
  for (const item of stored) { const key = `${item.s}:${item.z}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); }
  const tray = [...groups.values()].map(list => { const item = list[0], sp = speciesById(item.s); return `<button class="tray-item" data-action="tray" data-id="${e(item.id)}" aria-pressed="${ui.item && list.some(i => i.id === ui.item)}" aria-label="${e(sp.name)}, ${['small', 'medium', 'large'][item.z - 1]}, ${list.length} in storage">${sprite(sp.id, { kind: sp.kind })}<span>${list.length}</span></button>`; }).join('');
  const hint = pickedItem ? `${speciesById(pickedItem.s).name}${pickedItem.from ? `, a gift from ${e(pickedItem.from)}` : ''}. Tap a tile to put it there.` : stored.length ? 'Tap something, then tap a tile.' : 'Tap something on the island to move it.';
  return `<section class="page haven" data-page="haven"><h1 class="page-title">Your haven</h1>
<p class="lead">${summary}</p>
<div class="island-wrap${ui.on ? ' editing' : ''}">${islandSVG({ side, tiles, interactive: ui.on, selected: ui.picked, label: 'Your haven' })}</div>
${ui.on ? `<div class="edit-bar"><p class="note" aria-live="polite">${hint}</p>
${tray ? `<div class="tray" role="group" aria-label="In storage">${tray}</div>` : ''}
<div class="button-row">${picked ? '<button class="secondary" data-action="store-item">Put in storage</button><button class="secondary danger" data-action="release-item">Let it go</button>' : ''}<button class="primary" data-action="arrange">Done</button></div></div>`
    : `<div class="button-row"><button class="secondary" data-action="arrange">${icon('edit')}Arrange</button><button class="secondary" data-action="go" data-page="collection">${icon('collection')}Collection</button></div>`}
<div class="level"><div class="level-head"><b>Level ${level.level}</b><span>${formatMinutes(level.need - level.into)} to level ${level.level + 1}</span></div>
<div class="meter" role="progressbar" aria-label="Progress to the next level" aria-valuemin="0" aria-valuemax="${level.need}" aria-valuenow="${level.into}"><i style="width:${Math.round(level.into / level.need * 100)}%"></i></div>
<p class="note">${side} by ${side} tiles, ${store.freeTiles().length} free.${nextLand}${stored.length && !ui.on ? ` ${stored.length} in storage.` : ''}</p></div>
</section>`;
}

export const actions = {
  arrange(app) { app.ui.edit = { on: !app.ui.edit.on, picked: null, item: null }; app.render(); },
  tray(app, d) { app.ui.edit.item = app.ui.edit.item === d.id ? null : d.id; app.ui.edit.picked = null; app.render(); },
  tile(app, d) {
    const { store } = app, ui = app.ui.edit, key = `${d.r},${d.c}`, here = store.state.haven.tiles[key];
    const moving = ui.item || (ui.picked ? store.state.haven.tiles[ui.picked] : null);
    if (moving && ui.picked !== key) {
      const r = store.place(moving, Number(d.r), Number(d.c));
      if (!r.ok) toast(r.error);
      app.announce(r.achievements);
      app.ui.edit = { on: true, picked: null, item: null };
    } else if (here && ui.picked !== key) app.ui.edit = { on: true, picked: key, item: null };
    else app.ui.edit = { on: true, picked: null, item: null };
    app.social.pushCard();
    app.render();
    $(`.tile[data-r="${d.r}"][data-c="${d.c}"]`)?.focus({ preventScroll: true });
  },
  'store-item'(app) {
    const [r, c] = app.ui.edit.picked.split(',').map(Number);
    app.store.unplace(r, c);
    app.ui.edit = { on: true, picked: null, item: null };
    app.social.pushCard();
    app.render();
    toast('Put in storage.');
  },
  'release-item': async app => {
    const id = app.store.state.haven.tiles[app.ui.edit.picked], item = app.store.item(id);
    if (!item) return;
    const name = speciesById(item.s).name.toLowerCase();
    if (!(await app.confirm('Let it go?', `The ${name} leaves your haven for good. The session that grew it still counts.`, 'Let it go'))) return;
    app.store.release(id);
    app.ui.edit = { on: true, picked: null, item: null };
    app.social.pushCard();
    app.render();
  },
};
export { empty };
