// Haven's shell: starts everything, draws the chosen screen, and routes taps, typing and
// server messages to the screen that handles them.
import { e, $, icon, toast, initDialog, openDialog, closeDialog, dialogOpen, confirmDialog, paintRanges, veil, unveil } from './ui.js';
import { Store } from './store.js';
import { Social, discoverApi } from './social.js';
import { Timer } from './timer.js';
import { Ambience } from './sound.js';
import { WITHER_FILTER } from './art.js';
import { speciesById } from './catalog.js';
import * as device from './device.js';
import * as leaving from './leave.js';
import { newsText, syncReminders, syncNewsAccount } from './notices.js';
import * as focus from './views/focus.js';
import * as haven from './views/haven.js';
import * as collection from './views/collection.js';
import * as friends from './views/friends.js';
import * as journal from './views/journal.js';
import * as settings from './views/settings.js';
import * as sanctuary from './views/sanctuary.js';
import * as welcome from './views/welcome.js';

/* global __HAVEN_API__, __HAVEN_VERSION__ */
const VERSION = typeof __HAVEN_VERSION__ === 'string' ? __HAVEN_VERSION__ : 'dev';
const BUILD_API = typeof __HAVEN_API__ === 'string' ? __HAVEN_API__ : '';
// The home screen is the haven itself, with the focus controls under it.
const PAGES = { focus, collection, friends, journal, sanctuary };
const TABS = [['focus', 'Haven', 'haven'], ['collection', 'Collection', 'collection'], ['friends', 'Friends', 'friends'], ['journal', 'Journal', 'journal']];
const views = [focus, haven, collection, friends, journal, settings, sanctuary, welcome];
const merge = key => Object.assign({}, ...views.map(v => v[key] || {}));
const actions = merge('actions'), forms = merge('forms'), inputs = merge('inputs'), changes = merge('changes');

const store = new Store({ storage: safeStorage() });
const sound = new Ambience();
const app = {
  version: VERSION, buildApi: BUILD_API, store, sound, social: null, timer: null,
  now: () => Date.now(),
  ui: { page: 'focus', collection: 'plant', friendsTab: 'friends', boardPeriod: 'week', board: null, journal: { kind: 'week', anchor: Date.now() }, edit: { on: false, picked: null, item: null }, pendingAdd: null },
  render, go, confirm: confirmDialog, applyTheme, syncReminder, veil, unveil,
  renderIf(page) { if (app.ui.page === page) render(); },
  /** Say what just happened and anything it earned, in one message. */
  announce(list, lead = '') {
    const earned = list?.length ? `Earned: ${list.map(a => a.name).join(', ')}. +${list.reduce((n, a) => n + a.coins, 0)} coins.` : '';
    if (lead || earned) toast([lead, earned].filter(Boolean).join(' '));
  },
};

/** Whether Haven is off the screen. Android's web view keeps saying "visible", so the apps' own word counts too. */
const offScreen = () => document.visibilityState === 'hidden' || Boolean(app.away);

function safeStorage() {
  try { localStorage.setItem('haven-probe', '1'); localStorage.removeItem('haven-probe'); return localStorage; } catch { return null; }
}

function shell() {
  document.getElementById('app').innerHTML = `<svg width="0" height="0" class="defs" aria-hidden="true"><defs>${WITHER_FILTER}</defs></svg>
<a class="skip" href="#view">Skip to content</a>
<header class="topbar"><button class="brand" data-action="go" data-page="focus" aria-label="Haven, go to your haven"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="13" r="7" fill="var(--sun)"/><path d="M3 22c5-5 9-5 13-1 4-4 8-4 13 1v5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z" fill="var(--leaf)"/></svg><span>Haven</span></button>
<nav class="tabs" aria-label="Screens">${TABS.map(([id, label, glyph]) => `<button data-action="go" data-page="${id}">${icon(glyph)}<span>${label}</span></button>`).join('')}</nav>
<div class="top-actions"><button class="coins" data-action="go" data-page="collection">${icon('coin')}<b id="coins">0</b><span class="sr-only"> coins. Open the collection</span></button>
<button class="iconbutton" data-action="settings" aria-label="Settings">${icon('settings')}</button></div></header>
<main id="view" tabindex="-1"></main>
<dialog id="dialog" aria-labelledby="dialog-title"></dialog>
<div id="veil" class="veil" role="status" aria-live="polite" hidden></div>
<div id="toast" class="toast" role="status" aria-live="polite"></div>`;
}

/** The screen in front of the app while nobody is signed in (or a password is still to be set). */
let gated = null;
function render() {
  const view = $('#view'), was = gated;
  gated = welcome.gate(app);
  document.body.classList.toggle('gated', Boolean(gated));
  if (gated) {
    // Typing is never interrupted: the screen is only drawn again when it becomes a different one.
    if (was === gated && view.querySelector('.welcome') && view.dataset.welcome === welcomeKey()) return;
    view.innerHTML = welcome.render(app, gated);
    view.dataset.welcome = welcomeKey();
    document.body.dataset.page = 'welcome';
    if (was !== gated) { view.scrollTop = 0; window.scrollTo(0, 0); }
    return;
  }
  delete view.dataset.welcome;
  const page = PAGES[app.ui.page] || focus;
  const scroll = view.scrollTop, focused = document.activeElement?.closest?.('#view') ? document.activeElement : null;
  const key = focused ? [focused.dataset.action, focused.dataset.id, focused.dataset.value, focused.dataset.page].join('|') : null;
  view.innerHTML = page.render(app);
  paintRanges(view);
  view.scrollTop = scroll;
  if (key) [...view.querySelectorAll('[data-action]')].find(el => [el.dataset.action, el.dataset.id, el.dataset.value, el.dataset.page].join('|') === key)?.focus({ preventScroll: true });
  // A sanctuary is reached from Friends, so Friends stays lit while it is open.
  const lit = app.ui.page === 'sanctuary' ? 'friends' : app.ui.page;
  for (const tab of document.querySelectorAll('.tabs button')) { if (tab.dataset.page === lit) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current'); }
  $('#coins').textContent = store.state.coins;
  document.body.classList.toggle('in-session', Boolean(store.state.active || store.state.cycle?.breakUntil));
  document.body.dataset.page = app.ui.page;
  page.mounted?.(app);
}

const welcomeKey = () => [gated, app.ui.welcomeTab || 'in', app.social.features.google, Boolean(app.ui.pendingAdd)].join('|');

function go(page) {
  if (page === 'haven') page = 'focus';
  if (!PAGES[page]) return;
  if (welcome.gate(app)) { app.ui.page = page; render(); return; }
  if (dialogOpen()) closeDialog();
  if (page !== 'focus' || app.ui.page !== 'focus') app.ui.edit = { on: false, picked: null, item: null };
  const changed = app.ui.page !== page;
  app.ui.page = page;
  render();
  if (changed) { $('#view').scrollTop = 0; window.scrollTo(0, 0); }
  if (page === 'friends') { friends.load(app); app.social.wake(); }
  if (page === 'journal' && changed) app.ui.journal.anchor = app.now();
}

function applyTheme() {
  const theme = store.state.settings.theme;
  if (theme === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#14152b' : '#f5f5fb');
}

function syncReminder() {
  const r = store.state.settings.reminder;
  device.setReminder({ on: r.on, time: r.time, title: 'Time to focus', body: 'Your haven is waiting. Start a session when you are ready.' });
}

// ——— Events from the page ———

function wire() {
  document.addEventListener('click', event => {
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled || !el.dataset.action) return;
    const name = el.dataset.action;
    if (name === 'close-dialog') return closeDialog();
    if (name === 'go') return go(el.dataset.page);
    if (name === 'copy-crash') { device.copyText(app.crashText || '').then(ok => toast(ok ? 'Details copied.' : 'Could not copy.')); return; }
    const handler = actions[name];
    if (handler) { if (store.state.settings.haptics && el.matches('.primary')) device.haptic('light'); handler(app, el.dataset, el, event); }
  });
  // Island tiles are SVG groups acting as buttons: give them the keys a button has.
  document.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches?.('.tile')) { event.preventDefault(); event.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });
  document.addEventListener('submit', event => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    forms[form.dataset.form]?.(app, form);
  });
  document.addEventListener('input', event => {
    if (event.target.type === 'range') paintRanges(event.target.parentElement || document);
    const name = event.target.dataset?.input;
    if (name) inputs[name]?.(app, event.target);
  });
  document.addEventListener('change', event => { const name = event.target.dataset?.change; if (name) changes[name]?.(app, event.target); });
  if (device.phoneBrowser()) leaving.install(window);
  const shown = () => { app.timer.visible(); app.social.wake(); if (!store.state.active) render(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') app.timer.hidden(); else shown(); });
  // The apps also say so themselves: Android's web view is not told when the app goes to the
  // background, so without this time away would not count there. `at` is when it happened.
  window.__havenLifecycle = (state, at) => {
    if (state === 'hidden') { app.away = true; app.timer.hidden(Number(at) || null); }
    else if (app.away) { app.away = false; shown(); }
  };
  window.addEventListener('pagehide', () => app.timer.hidden());
  window.addEventListener('online', () => app.social.wake());
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
}

// ——— Events from the store, the timer and the server ———

/**
 * Ask once to send notifications, at the moment they start to matter: the first session (it ends
 * with one) or a new profile (friends' news). The phone shows its own prompt.
 */
async function askForNotifications() {
  try { if (localStorage.getItem('haven-asked-notify')) return; } catch { return; }
  if ((await device.notificationPermission(false)) !== 'default') return;
  try { localStorage.setItem('haven-asked-notify', '1'); } catch { /* storage closed */ }
  const answer = await device.notificationPermission(true);
  if (answer === 'granted') { syncReminders(store, app.now()); syncNewsAccount(app.social, store); }
}
app.askForNotifications = askForNotifications;

/** If the app closed unexpectedly last time, say so and offer the details for a bug report. */
async function reportLastCrash() {
  const text = await device.lastCrash();
  if (!text) return;
  openDialog('Haven closed unexpectedly', `<p class="lead">Your haven is safe. If it keeps happening, copy the details and send them to Haven support.</p>
<div class="button-row"><button class="secondary" data-action="copy-crash">Copy details</button><button class="primary" data-action="close-dialog" autofocus>OK</button></div>`);
  app.crashText = String(text);
}

/** Reminders depend on sessions and animals; work them out again shortly after either changes. */
let reminderTimer = null;
function remindersSoon() { clearTimeout(reminderTimer); reminderTimer = setTimeout(() => syncReminders(store, app.now()), 1500); }

/** A friend did something. In the app it is a message; with Haven in the background, a notification. */
function news(item) {
  const text = newsText(item);
  if (!text) return;
  if (offScreen()) { if (store.state.settings.notify[text.kind]) device.notifyNow(text.title, text.body, 'news-' + (item.id || item.kind)); return; }
  toast(text.body);
}

function listen() {
  store.subscribe(what => {
    if (what === 'away') return;
    if (['session', 'sessions', 'care', 'haven', 'state'].includes(what)) remindersSoon();
    if (what === 'settings') { remindersSoon(); syncNewsAccount(app.social, store); }
    if (what === 'care') { app.social.scheduleBackup(); app.social.pushCard(); if (app.ui.page === 'focus') render(); else { $('#coins').textContent = store.state.coins; if (app.ui.page === 'sanctuary') sanctuary.cared(app); } return; }
    if (what === 'haven' || what === 'session' || what === 'collection' || what === 'sessions' || what === 'state') app.social.pushCard();
    // Every change reaches this account's other devices a few seconds later.
    if (what !== 'cycle') app.social.scheduleBackup();
    if (what === 'state') applyTheme();
    if (store.saveError && !listen.warned) { listen.warned = true; toast('Haven can\'t save. Free some space on your phone.'); }
    render();
  });

  app.timer.on((type, payload) => {
    if (type === 'tick') return focus.tick(app, payload);
    if (type === 'break-tick') return focus.tickBreak(app, payload);
    if (type === 'started') { askForNotifications(); if (dialogOpen()) closeDialog(); app.ui.edit = { on: false, picked: null, item: null }; app.ui.feeding = false; if (app.ui.page !== 'focus') go('focus'); else render(); return; }
    if (type === 'finished') { render(); focus.resultDialog(app, payload); if (offScreen() && store.state.settings.notify.done) notifyDone(payload); return; }
    if (type === 'failed') { render(); focus.failedDialog(app, payload); return; }
    if (type === 'cancelled') { render(); toast('Session cancelled.'); return; }
    if (type === 'short') { render(); toast(`Under ${payload.least} min, so nothing grew.`); return; }
    if (type === 'break-over') { render(); toast('Break over.'); return; }
    if (type === 'cycle-done') { render(); toast('Pomodoro run finished.'); }
  });

  app.social.subscribe((type, payload) => {
    if (type === 'toast') return toast(payload);
    if (type === 'news') return news(payload);
    if (type === 'status') syncNewsAccount(app.social, store);
    if (type === 'friends-count') return app.announce(store.setFriendCount(payload));
    if (type === 'status' || type === 'change') {
      if (gated || welcome.gate(app)) { if (dialogOpen() && !gated) closeDialog(); render(); return; }
      if (app.ui.page === 'friends' || app.ui.page === 'sanctuary' || (app.ui.page === 'focus' && !store.state.active)) { if (!document.activeElement?.closest?.('#view form')) render(); }
      else if (store.state.active?.room && app.ui.page === 'focus') render();
      return;
    }
    if (type === 'inbox') return inbox(payload);
    if (type === 'sanctuary') return sanctuary.changed(app, payload);
    if (type === 'room') return roomChanged(payload);
    if (type === 'friend-focus' && app.ui.page !== 'friends' && !store.state.active) toast(`${payload.name} started focusing.`);
  });
}

function notifyDone({ session }) {
  const sp = speciesById(session.species);
  device.notifyNow(sp.kind === 'animal' ? `The ${sp.name.toLowerCase()} has arrived` : `Your ${sp.name.toLowerCase()} is fully grown`, `${session.minutes} min focused.`, 'session');
}

/** A cheer, a nudge, a gift or an invitation has arrived. */
function inbox(item) {
  const from = item.from.name;
  if (item.kind === 'invite') {
    if (store.state.active || app.social.roomLive() || item.kind === 'fire-out') { app.social.ack([item.id]); return; }
    if (offScreen()) news(item);
    return friends.inviteReceived(app, item);
  }
  if (item.kind === 'sanctuary') {
    if (offScreen()) news(item);
    return sanctuary.invited(app, item);
  }
  if (item.kind === 'care' && item.data?.kind === 'treat') store.fedByFriend(String(item.data.item || ''), item.created);
  if (item.kind === 'gift') {
    const got = store.receiveGift(item.data.species, from, item.id), sp = speciesById(item.data.species);
    if (got && sp) toast(`${from} sent you a ${sp.name.toLowerCase()}. ${store.state.haven.spots[got.id] ? 'It is in your haven.' : 'It is in storage.'}`);
    if (got && offScreen()) news(item);
  } else news(item);
  if (store.state.settings.haptics) device.haptic('light');
  app.social.ack([item.id]);
}

/** The room this person is in changed: it started, someone left, or it closed. */
function roomChanged({ room, by }) {
  if (!room) return;
  const active = store.state.active;
  if (room.state === 'running' && !active) { app.timer.startRoom(room); return; }
  if (room.state === 'failed' && active?.room === room.code) {
    // Told now, or on opening Haven later: then who left is in the inbox.
    const who = by || app.social.data.inbox?.find(i => i.kind === 'fire-out' && i.data?.code === room.code)?.from;
    app.timer.fail('friend-left', { who: who?.id === app.social.account?.id ? 'You' : who?.name });
    return;
  }
  if (room.state === 'closed' && app.ui.page === 'friends') toast('The campfire was put out.');
}

// ——— Start ———

/** The opening screen is taken away once Haven knows what to show first. */
function hideSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  el.classList.add('gone');
  setTimeout(() => el.remove(), 400);
}

/** Back from Google in a browser: the answer is in the address, which is then tidied. */
function googleFromAddress() {
  if (!/[#&]google(-error)?=/.test(location.hash)) return null;
  const params = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  return params;
}

async function boot() {
  const opened = Date.now();
  shell();
  initDialog();
  applyTheme();
  const storage = safeStorage() || { getItem: () => null, setItem() {}, removeItem() {} };
  app.social = new Social({ store, storage, base: null });
  app.timer = new Timer({ store, social: app.social, sound });
  wire();
  haven.wire(app);
  sanctuary.wire(app);
  listen();
  const fromGoogle = googleFromAddress();
  const add = /[#&]add=([A-Za-z0-9-]{8,9})/.exec(location.hash);
  if (add) { app.ui.pendingAdd = add[1]; app.ui.page = 'friends'; history.replaceState(null, '', location.pathname + location.search); }
  // The Android app comes back from Google through haven://auth, which the shell keeps until asked.
  const takeAuth = async () => { const query = await device.takeAuth(); if (query) await welcome.googleReturned(app, new URLSearchParams(String(query))); };
  window.__havenTakeAuth = takeAuth;
  app.afterSignIn = () => {
    syncNewsAccount(app.social, store);
    if (app.ui.pendingAdd) { const code = app.ui.pendingAdd; app.ui.pendingAdd = null; app.go('friends'); friends.addDialog(app, code); }
  };
  await app.timer.resume();
  if (!safeStorage()) toast('This browser won\'t let Haven save. Turn off private browsing.');
  app.social.base = await discoverApi({ storage, build: BUILD_API, location });
  // Someone signed in sees their haven at once; someone who is not waits a moment to learn how they can sign in.
  if (app.social.base && !app.social.signedIn) await app.social.discoverFeatures(); else if (app.social.base) app.social.discoverFeatures().then(() => { if (gated) render(); });
  render();
  await new Promise(resolve => setTimeout(resolve, Math.max(0, 600 - (Date.now() - opened))));
  hideSplash();
  if (app.social.base) {
    if (fromGoogle) await welcome.googleReturned(app, fromGoogle);
    await takeAuth();
    if (app.social.signedIn) { await app.social.connect(); app.afterSignIn(); }
  }
  syncReminder();
  reportLastCrash();
  syncReminders(store, app.now());
  syncNewsAccount(app.social, store);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
  // Refresh presence text ("12 min left") once a minute while it is on screen.
  setInterval(() => { if (app.ui.page === 'friends' && document.visibilityState === 'visible' && !dialogOpen() && !document.activeElement?.closest?.('#view form')) render(); }, 60000);
}

// The shells and the tests can ask how things stand.
window.__haven = { app, device, version: VERSION, state: () => ({ page: gated ? 'welcome' : app.ui.page, gate: gated, active: Boolean(store.state.active), social: app.social?.status, friends: app.social?.data.friends.length ?? 0 }) };
boot();
