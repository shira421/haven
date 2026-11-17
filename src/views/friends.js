// The Friends screen: your profile, adding people, who is focusing now, rooms, the board and the feed.
import { e, $, icon, segmented, openDialog, updateDialog, closeDialog, dialogOpen, toast, field, avatar, empty, formError, busy } from '../ui.js';
import { formatMinutes, formatAgo, formatClock } from '../core.js';
import { speciesById } from '../catalog.js';
import { inviteLink, prettyCode } from '../social.js';
import { worldHTML, thingsFromCard } from '../scene.js';
import { share, copyText } from '../device.js';
import * as sanctuary from './sanctuary.js';

const TABS = [['friends', 'Friends'], ['campfire', 'Campfire'], ['sanctuary', 'Sanctuary'], ['board', 'Board'], ['activity', 'Activity']];
const STATUS = { live: 'Live', connecting: 'Connecting', offline: 'Reconnecting', 'signed-out': '' };

function presence(f, now) {
  if (f.focusing) {
    const left = f.focusing.until ? Math.max(0, Math.round((f.focusing.until - now) / 60000)) : null;
    const what = speciesById(f.focusing.species)?.name.toLowerCase() || 'something';
    return { cls: 'focusing', text: left === null ? `Focusing, growing a ${what}` : left > 0 ? `Focusing, ${left} min left` : 'Finishing a session' };
  }
  if (f.online) return { cls: 'online', text: 'Online' };
  return { cls: 'away', text: f.last ? `Focused ${formatAgo(f.last, now)}` : 'Not focused yet' };
}

export function render(app) {
  const { social } = app;
  if (!social.base) return `<section class="page friends" data-page="friends"><h1 class="page-title">Friends</h1>${empty('This copy of Haven has no server yet, so there are no accounts or friends. Everything else works. The README in the repository explains how to set one up.')}</section>`;
  if (!social.signedIn) return `<section class="page friends" data-page="friends"><h1 class="page-title">Friends</h1>${empty('Sign in to see your friends.')}</section>`;
  const tab = app.ui.friendsTab, me = social.account;
  const body = tab === 'friends' ? friendsTab(app) : tab === 'campfire' ? campfireTab(app) : tab === 'sanctuary' ? sanctuary.tab(app) : tab === 'board' ? boardTab(app) : activityTab(app);
  return `<section class="page friends" data-page="friends"><h1 class="page-title">Friends</h1>
<div class="me-card">${avatar(me.avatar, 'large')}<div class="row-main"><b>${e(me.name)}</b><span>@${e(me.handle)}</span><span class="live ${social.status}" role="status">${STATUS[social.status]}</span></div>
<button class="primary" data-action="add-friend">${icon('plus')}Add friend</button></div>
${social.status === 'offline' ? '<p class="note">Cannot reach Haven. Sessions are saved on this phone and sent when you are back.</p>' : ''}
${segmented('friends-tab', TABS, tab, 'Friends sections')}${body}</section>`;
}

function friendsTab(app) {
  const { social } = app, d = social.data, now = social.serverNow();
  if (!d.loaded) return empty('Loading your friends.');
  const incoming = d.incoming.map(u => `<li class="row">${avatar(u.avatar)}<div class="row-main"><b>${e(u.name)}</b><span>@${e(u.handle)} wants to be friends</span></div><div class="row-end"><button class="secondary" data-action="respond" data-id="${u.id}" data-accept="0">Decline</button><button class="primary" data-action="respond" data-id="${u.id}" data-accept="1">Accept</button></div></li>`).join('');
  const outgoing = d.outgoing.map(u => `<li class="row">${avatar(u.avatar)}<div class="row-main"><b>${e(u.name)}</b><span>Request sent</span></div><div class="row-end"><button class="secondary" data-action="cancel-request" data-id="${u.id}">Cancel</button></div></li>`).join('');
  const friends = d.friends.map(f => { const p = presence(f, now); return `<li class="row friend ${p.cls}"><button class="row-main pick" data-action="friend" data-id="${f.id}">${avatar(f.avatar)}<span><b>${e(f.name)}</b><small class="presence">${e(p.text)}</small></span></button><div class="row-end"><span class="minutes">${f.today ? formatMinutes(f.today) : ''}</span><button class="iconbutton" data-action="cheer" data-id="${f.id}" data-kind="${f.focusing ? 'cheer' : 'nudge'}" aria-label="${f.focusing ? 'Cheer' : 'Nudge'} ${e(f.name)}">${icon(f.focusing ? 'cheer' : 'nudge')}</button></div></li>`; }).join('');
  return `${incoming ? `<h2 class="section-title">Requests</h2><ul class="rows">${incoming}</ul>` : ''}
${friends ? `<h2 class="section-title">${d.friends.filter(f => f.focusing).length ? `${d.friends.filter(f => f.focusing).length} focusing now` : 'Your friends'}</h2><ul class="rows">${friends}</ul>` : empty('No friends here yet. Share your code, or enter theirs.', '<button class="primary" data-action="add-friend">Add friend</button>')}
${outgoing ? `<h2 class="section-title">Waiting for an answer</h2><ul class="rows">${outgoing}</ul>` : ''}`;
}

function roomCard(app, room) {
  const { social, store } = app, me = social.account.id, host = room.host === me;
  const members = room.members.map(m => { const sp = speciesById(m.species); return `<li class="row">${avatar(m.avatar)}<div class="row-main"><b>${e(m.id === me ? 'You' : m.name)}</b><span>${m.id === room.host ? 'Lit it, growing' : 'Growing'} a ${e(sp?.name.toLowerCase() || 'clover')}</span></div></li>`; }).join('');
  const rule = room.rule === 'together' ? 'If one person leaves, the fire goes out for everyone.' : 'Someone leaving costs only them.';
  return `<div class="room"><h2 class="section-title">Campfire ${prettyRoom(room.code)}${room.sanctuary ? ` in ${e(room.sanctuary)}` : ''}</h2>
<p class="lead">${formatMinutes(room.minutes)} round the fire. ${rule} Finishing together earns 10% more coins for each friend who finishes too.</p>
<ul class="rows">${members}</ul>
<div class="button-row"><button class="secondary" data-action="room-invite">${icon('users')}Invite friends</button><button class="secondary" data-action="room-share">${icon('share')}Share the code</button></div>
<div class="button-row"><button class="secondary danger" data-action="room-leave">${host ? 'Put it out' : 'Leave'}</button>${host ? `<button class="primary" data-action="room-start">Start for ${room.members.length === 1 ? 'yourself' : `all ${room.members.length}`}</button>` : ''}</div>
${host ? '' : '<p class="note">Whoever lit it starts the session. Keep Haven open.</p>'}
<p class="note">You are growing a ${e(speciesById(store.state.settings.species).name.toLowerCase())}. <button class="linklike" data-action="choose-species">Change</button></p></div>`;
}
const prettyRoom = code => `${code.slice(0, 3)} ${code.slice(3)}`;

function campfireTab(app) {
  const { social, store } = app, room = social.data.room;
  if (room?.state === 'lobby') return roomCard(app, room);
  if (room?.state === 'running') return `<div class="room"><p class="lead">Your campfire is burning. Everyone round it is focusing.</p><button class="primary wide" data-action="go" data-page="focus">Go to the session</button></div>`;
  const minutes = store.state.settings.minutes;
  return `<p class="lead">Focus with friends round one fire. Everyone starts at the same moment, and finishing together earns more.</p>
<h2 class="section-title">Light a campfire</h2>
<form data-form="room-create" class="card-form">
${field('Length', `<select name="minutes">${[15, 25, 30, 45, 50, 60, 90, 120].map(m => `<option value="${m}" ${m === minutes || (m === 25 && ![15, 30, 45, 50, 60, 90, 120].includes(minutes)) ? 'selected' : ''}>${formatMinutes(m)}</option>`).join('')}</select>`)}
<fieldset class="choices"><legend>If someone leaves</legend>
<label><input type="radio" name="rule" value="together" checked><span><b>The fire goes out for everyone</b><small>Everyone's plant withers. You hold each other to it.</small></span></label>
<label><input type="radio" name="rule" value="gentle"><span><b>Only they lose theirs</b><small>The rest carry on.</small></span></label></fieldset>
<p class="form-error" role="alert" hidden></p><button class="primary wide" type="submit">Light it</button></form>
<h2 class="section-title">Join a campfire</h2>
<form data-form="room-join" class="inline-form">${field('Campfire code', '<input name="code" maxlength="7" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABC DEF" required>')}<button class="secondary" type="submit">Join</button><p class="form-error" role="alert" hidden></p></form>`;
}

const PERIODS = [['today', 'Today'], ['week', 'Week'], ['month', 'Month'], ['all', 'All time']];
function boardTab(app) {
  const board = app.ui.board;
  const rows = !board ? '' : board.map((r, i) => `<li class="row${r.me ? ' me' : ''}"><span class="rank">${i + 1}</span>${avatar(r.avatar)}<div class="row-main"><b>${e(r.me ? 'You' : r.name)}</b><span>${r.sessions} ${r.sessions === 1 ? 'session' : 'sessions'}</span></div><div class="row-end"><span class="minutes">${formatMinutes(r.minutes)}</span></div></li>`).join('');
  return `${segmented('board-period', PERIODS, app.ui.boardPeriod, 'Board period')}
${!board ? empty('Loading the board.') : board.length < 2 ? `<ul class="rows">${rows}</ul>${empty('Add a friend to see how you compare.')}` : `<ol class="rows">${rows}</ol>`}`;
}

function activityTab(app) {
  const feed = app.social.data.feed, now = app.social.serverNow(), me = app.social.account.id;
  if (!feed) return empty('Loading what your friends grew.');
  if (!feed.length) return empty('Nothing here yet. Finished sessions from you and your friends show up here.');
  return `<ul class="rows">${feed.map(f => { const sp = speciesById(f.species); return `<li class="row">${avatar(f.species)}<div class="row-main"><b>${e(f.user.id === me ? 'You' : f.user.name)}</b><span>${formatMinutes(f.minutes)}${f.room ? ' at a campfire' : ''}, grew a ${e(sp?.name.toLowerCase() || 'plant')}. ${formatAgo(f.start + f.minutes * 60000, now)}</span></div>${f.user.id === me ? '' : `<div class="row-end"><button class="iconbutton" data-action="cheer" data-id="${f.user.id}" data-kind="cheer" aria-label="Cheer ${e(f.user.name)}">${icon('cheer')}</button></div>`}</li>`; }).join('')}</ul>`;
}

/** Load what a tab needs from the server. */
export async function load(app) {
  const { social } = app, tab = app.ui.friendsTab;
  if (!social.signedIn || !social.base) return;
  try {
    if (tab === 'board') { app.ui.board = await social.board(app.ui.boardPeriod); app.renderIf('friends'); }
    if (tab === 'activity') await social.feed();
    if (tab === 'sanctuary') await sanctuary.loadList(app);
  } catch (error) { toast(error.message); }
}

// ——— Dialogs ———

function addDialog(app, prefill = '') {
  const me = app.social.account;
  openDialog('Add a friend', `<div class="code-box"><span>Your friend code</span><b>${prettyCode(me.code)}</b>
<div class="button-row"><button class="secondary" data-action="copy-code">${icon('copy')}Copy code</button><button class="secondary" data-action="share-invite">${icon('share')}Share invite</button></div></div>
<form data-form="find" novalidate>${field('Their code or username', `<input name="q" value="${e(prefill)}" maxlength="24" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="K7M2-P9QX or @name" required>`)}
<p class="form-error" role="alert" hidden></p><button class="primary wide" type="submit">Find</button></form><div id="find-result" aria-live="polite"></div>`);
  if (prefill) $('#dialog form[data-form="find"]').requestSubmit();
}

async function friendDialog(app, id) {
  const { social } = app, f = social.data.friends.find(x => x.id === id);
  if (!f) return;
  openDialog(f.name, '<p class="note">Loading their haven.</p>');
  let page;
  try { page = await social.friendPage(id); } catch (error) { updateDialog(`<p class="lead">${e(error.message)}</p>`); return; }
  if (!dialogOpen() || $('#dialog-title')?.textContent !== f.name) return;
  const { side, things } = thingsFromCard(page.card), p = presence({ ...f, focusing: page.focusing, online: page.online }, social.serverNow());
  const inRoom = social.data.room?.state === 'lobby';
  updateDialog(`<p class="lead"><span class="presence ${p.cls}">${e(p.text)}</span>. @${e(f.handle)}</p>
<div class="island-wrap friend">${worldHTML({ side, things, label: `${e(f.name)}'s haven` })}</div>
<dl class="facts"><div><dt>Today</dt><dd>${formatMinutes(page.stats.today)}</dd></div><div><dt>This week</dt><dd>${formatMinutes(page.stats.week)}</dd></div><div><dt>All time</dt><dd>${formatMinutes(page.stats.total)} in ${page.stats.sessions} sessions</dd></div><div><dt>Level</dt><dd>${Number(page.card.level) || 1}</dd></div></dl>
<div class="button-row"><button class="secondary" data-action="cheer" data-id="${id}" data-kind="cheer">${icon('cheer')}Cheer</button><button class="secondary" data-action="cheer" data-id="${id}" data-kind="nudge">${icon('nudge')}Nudge</button></div>
<div class="button-row"><button class="secondary" data-action="gift-pick" data-id="${id}">${icon('gift')}Send a gift</button><button class="secondary" data-action="invite-friend" data-id="${id}">${icon('users')}${inRoom ? 'Invite to the campfire' : 'Light a campfire'}</button></div>
<div class="button-row quiet"><button class="linklike" data-action="report" data-id="${id}" data-name="${e(f.name)}" data-place="friend">Report</button><button class="linklike danger" data-action="remove-friend" data-id="${id}">Remove friend</button><button class="linklike danger" data-action="block-friend" data-id="${id}">Block</button></div>`);
}

/** Tell whoever runs Haven about someone: a name that is not right, being unkind, or spam. */
export function reportDialog(app, { id, name, place }) {
  openDialog(`Report ${name}`, `<form data-form="report" data-id="${e(id)}" data-place="${e(place || '')}" novalidate><p class="lead">Reports go to the people who run Haven. ${e(name)} is not told who sent it.</p>
<fieldset class="choices"><legend>What is wrong</legend>
<label><input type="radio" name="reason" value="name" checked><span><b>Their name or username</b><small>It is rude, hateful or pretends to be someone.</small></span></label>
<label><input type="radio" name="reason" value="harassment"><span><b>They are unkind to me</b><small>Cheers, nudges, gifts or invites used to bother you.</small></span></label>
<label><input type="radio" name="reason" value="spam"><span><b>Spam</b><small>Requests or invites over and over.</small></span></label>
<label><input type="radio" name="reason" value="other"><span><b>Something else</b></span></label></fieldset>
<p class="form-error" role="alert" hidden></p><div class="button-row"><button class="primary wide" type="submit">Send report</button></div>
<p class="note">To stop hearing from them straight away, block them as well.</p></form>`);
}

function giftPickDialog(app, to) {
  const { store, social } = app, f = social.data.friends.find(x => x.id === to);
  const cards = store.state.unlocked.map(id => speciesById(id)).map(sp => `<button class="species-card" data-action="gift-send" data-id="${sp.id}" data-to="${to}">${avatar(sp.id)}<b>${e(sp.name)}</b><small>${store.giftPrice(sp.id)} coins</small></button>`).join('');
  openDialog(`A gift for ${f?.name || 'a friend'}`, `<p class="lead">You have ${store.state.coins} coins. Pick something you have unlocked.</p><div class="species-grid">${cards}</div>`);
}

function inviteDialog(app) {
  const { social } = app, room = social.data.room, inside = new Set(room.members.map(m => m.id));
  const rows = social.data.friends.filter(f => !inside.has(f.id)).map(f => `<li class="row">${avatar(f.avatar)}<div class="row-main"><b>${e(f.name)}</b><span>${e(presence(f, social.serverNow()).text)}</span></div><div class="row-end"><button class="secondary" data-action="invite-send" data-id="${f.id}">Invite</button></div></li>`).join('');
  openDialog('Invite friends', rows ? `<ul class="rows">${rows}</ul>` : '<p class="lead">Everyone you know is already here, or you have no friends on Haven yet. Share the campfire code instead.</p>');
}

export function inviteReceived(app, item) {
  const d = item.data, rule = d.rule === 'together' ? 'If one person leaves, the fire goes out for everyone.' : 'Someone leaving costs only them.';
  openDialog('Join the campfire?', `<p class="lead">${e(item.from.name)} lit a campfire${d.sanctuary ? ` in ${e(d.sanctuary)}` : ''} for ${formatMinutes(d.minutes)}. ${rule}</p>
<div class="button-row"><button class="secondary" data-action="invite-decline" data-item="${item.id}">Not now</button><button class="primary" data-action="invite-accept" data-item="${item.id}" data-code="${e(d.code)}" autofocus>Join</button></div>`, { close: () => app.social.ack([item.id]) });
}

// ——— Actions ———

const guard = async (work, el) => { if (el) el.disabled = true; try { return await work(); } catch (error) { toast(error.message); return null; } finally { if (el?.isConnected) el.disabled = false; } };

export const actions = {
  'friends-tab'(app, d) { app.ui.friendsTab = d.value; app.render(); load(app); },
  'board-period'(app, d) { app.ui.boardPeriod = d.value; app.ui.board = null; app.render(); load(app); },
  'add-friend': app => addDialog(app),
  'copy-code': async app => { toast((await copyText(prettyCode(app.social.account.code))) ? 'Code copied.' : 'Could not copy. Read the code out instead.'); },
  'share-invite': async app => {
    const me = app.social.account;
    const how = await share({ title: 'Haven', text: `Add me on Haven. My friend code is ${prettyCode(me.code)}.`, url: inviteLink(me.code) });
    if (how === 'copied') toast('Invite copied.'); else if (how === 'failed') toast('Could not share. Read the code out instead.');
  },
  'send-request': (app, d, el) => guard(async () => {
    const r = await app.social.request(d.id);
    toast(r.status === 'friends' ? `You and ${r.user.name} are now friends.` : `Request sent to ${r.user.name}.`);
    closeDialog();
  }, el),
  respond: (app, d, el) => guard(async () => { const r = await app.social.respond(d.id, d.accept === '1'); toast(r.status === 'friends' ? 'You are now friends.' : 'Request declined.'); if (dialogOpen()) closeDialog(); }, el),
  'cancel-request': (app, d, el) => guard(async () => { await app.social.cancel(d.id); toast('Request cancelled.'); }, el),
  friend: (app, d) => friendDialog(app, d.id),
  cheer: (app, d, el) => guard(async () => {
    await app.social.cheer(d.id, d.kind);
    const name = app.social.data.friends.find(f => f.id === d.id)?.name || 'your friend';
    toast(d.kind === 'nudge' ? `Nudged ${name}.` : `Cheered ${name}.`);
  }, el),
  'gift-pick': (app, d) => giftPickDialog(app, d.id),
  report: (app, d) => reportDialog(app, d),
  'remove-friend': async (app, d) => {
    const f = app.social.data.friends.find(x => x.id === d.id);
    if (!(await app.confirm('Remove friend?', `${e(f?.name || 'They')} will no longer see your sessions, and you will not see theirs.`, 'Remove friend'))) return;
    guard(async () => { await app.social.remove(d.id); toast('Friend removed.'); });
  },
  'block-friend': async (app, d) => {
    const f = app.social.data.friends.find(x => x.id === d.id);
    if (!(await app.confirm('Block?', `${e(f?.name || 'They')} will be removed and will not be able to find you or send you requests.`, 'Block'))) return;
    guard(async () => { await app.social.block(d.id); toast('Blocked.'); });
  },
  'invite-friend': (app, d, el) => guard(async () => {
    if (app.social.data.room?.state !== 'lobby') await app.social.roomCreate(app.store.state.settings.minutes, 'together', app.store.state.settings.species);
    await app.social.roomInvite(d.id);
    closeDialog();
    app.ui.friendsTab = 'campfire';
    app.go('friends');
    toast('Invitation sent. The campfire is lit.');
  }, el),
  'room-invite': app => inviteDialog(app),
  'invite-send': (app, d, el) => guard(async () => { await app.social.roomInvite(d.id); el.textContent = 'Invited'; el.dataset.action = ''; toast('Invitation sent.'); }, null),
  'room-share': async app => {
    const room = app.social.data.room;
    const how = await share({ title: 'Haven', text: `Focus with me round a campfire on Haven for ${formatMinutes(room.minutes)}. Open Friends, then Campfire, and enter the code ${prettyRoom(room.code)}.` });
    if (how === 'copied') toast('Campfire code copied.'); else if (how === 'failed') toast(`Could not share. The code is ${prettyRoom(room.code)}.`);
  },
  'room-leave': (app, d, el) => guard(async () => { await app.social.roomLeave(); toast('You left the campfire.'); }, el),
  'room-start': (app, d, el) => guard(async () => { const room = await app.social.roomStart(); app.timer.startRoom(room); app.go('focus'); }, el),
  'open-room'(app) { app.ui.friendsTab = 'campfire'; app.go('friends'); },
  'invite-accept': (app, d, el) => guard(async () => {
    await app.social.roomJoin(d.code, app.store.state.settings.species);
    closeDialog();
    app.ui.friendsTab = 'campfire';
    app.go('friends');
  }, el),
  'invite-decline': () => closeDialog(),
};

export const forms = {
  report: (app, form) => busy(form, async () => {
    try { await app.social.report(form.dataset.id, form.reason.value, form.dataset.place); closeDialog(); toast('Thanks. Your report was sent.'); }
    catch (error) { formError(form, error.message); }
  }),
  find: (app, form) => busy(form, async () => {
    formError(form, '');
    const out = $('#find-result');
    out.innerHTML = '';
    try {
      const { user, relation } = await app.social.find(form.q.value);
      const action = relation === 'self' ? '<span class="note">This is you.</span>' : relation === 'friend' ? '<span class="note">Already your friend.</span>' : relation === 'outgoing' ? '<span class="note">Request sent.</span>'
        : relation === 'incoming' ? `<button class="primary" data-action="respond" data-id="${user.id}" data-accept="1">Accept request</button>` : `<button class="primary" data-action="send-request" data-id="${user.id}">Send request</button>`;
      out.innerHTML = `<ul class="rows"><li class="row">${avatar(user.avatar)}<div class="row-main"><b>${e(user.name)}</b><span>@${e(user.handle)}</span></div><div class="row-end">${action}</div></li></ul>`;
    } catch (error) { formError(form, error.message); }
  }),
  'room-create': (app, form) => busy(form, async () => {
    formError(form, '');
    try { await app.social.roomCreate(Number(form.minutes.value), form.rule.value, app.store.state.settings.species); app.render(); } catch (error) { formError(form, error.message); }
  }),
  'room-join': (app, form) => busy(form, async () => {
    formError(form, '');
    try { await app.social.roomJoin(form.code.value, app.store.state.settings.species); app.render(); } catch (error) { formError(form, error.message); }
  }),
};
export { addDialog, formatClock };
