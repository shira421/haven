// Settings: how sessions behave, sounds, reminders, the look, your profile and your data.
import { e, $, icon, openDialog, closeDialog, toast, field, switchRow, formError, busy, avatar } from '../ui.js';
import { ANIMALS } from '../catalog.js';
import { SOUNDS } from '../sound.js';
import { prettyCode } from '../social.js';
import { formatAgo, formatAway, warnAfter } from '../core.js';
import * as device from '../device.js';
import * as leaving from '../leave.js';

const ALLOWANCES = [[30, '30 s'], [45, '45 s'], [60, '1 min'], [90, '1.5 min'], [120, '2 min']];
const select = (action, options, current) => `<select data-change="${action}">${options.map(([v, t]) => `<option value="${e(v)}" ${String(v) === String(current) ? 'selected' : ''}>${e(t)}</option>`).join('')}</select>`;

export function settingsDialog(app, section = null) {
  const { store, social } = app, s = store.state.settings, native = device.bridge();
  const notifySwitch = (kind, label, hint) => `<label class="switch-row"><span><b>${e(label)}</b>${hint ? `<small>${e(hint)}</small>` : ''}</span><input type="checkbox" data-change="notify" data-kind="${kind}" ${s.notify[kind] ? 'checked' : ''}></label>`;
  const lockNote = native ? 'Locking the phone does not count as leaving.'
    : device.phoneBrowser() ? 'Locking the phone is fine. Haven counts only time it can see you spent in another app, and gives you the benefit of the doubt.'
    : 'Locking the computer counts as leaving.';
  const me = social.account, google = social.features.google;
  const profile = !social.base ? '<p class="note">This copy of Haven has no server, so there is no account. Your haven is kept on this phone.</p>'
    : social.signedIn ? `<div class="me-card">${avatar(me.avatar, 'large')}<div class="row-main"><b>${e(me.name)}</b><span>@${e(me.handle)}, code ${prettyCode(me.code)}</span></div></div>
<div class="button-row"><button class="secondary" data-action="edit-profile">Edit profile</button><button class="secondary" data-action="change-password">${me.hasPassword === false ? 'Set a password' : 'Change password'}</button></div>
${me.google ? `<p class="note">Google is connected, so you can also sign in with it.${me.hasPassword === false ? '' : ' <button class="linklike" data-action="disconnect-google">Disconnect</button>'}</p>` : google ? '<div class="button-row"><button class="secondary wide" data-action="connect-google">Connect Google</button></div><p class="note">Sign in with Google as well as your password, and get back in if you forget it.</p>' : ''}
<p class="note">${social.data.backupAt ? `Saved to your account ${formatAgo(social.data.backupAt, social.serverNow())}.` : 'Not saved to your account yet.'} <button class="linklike" data-action="backup-now">Save now</button></p>
<div class="button-row quiet"><button class="linklike" data-action="sign-out">Sign out</button><button class="linklike danger" data-action="delete-profile">Delete account</button></div>`
    : '<p class="note">You are signed out.</p>';
  openDialog('Settings', `<h3 class="group-title" id="set-focus">Focus</h3>
${switchRow('Deep focus', 'deep', s.deep, `Leaving Haven during a session withers the plant. ${lockNote}`)}
${field('Time away that is forgiven', select('allowance', ALLOWANCES, s.allowance), 'Enough to answer a message or change a song.')}
${device.phoneBrowser() ? browserLeaving(app) : ''}
${device.canKeepAwake() ? switchRow('Keep the screen on', 'keepAwake', s.keepAwake, native ? 'While a session runs. Off lets the phone lock as usual, which is not leaving.' : 'While a session runs.') : ''}
${switchRow('Place new plants and animals for me', 'autoPlace', s.autoPlace, 'On a free tile. You can move them later.')}
<h3 class="group-title">Sounds</h3>
${field('Background sound', select('sound', SOUNDS.map(x => [x.id, x.name]), s.sound))}
<label class="form-field"><span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-input="volume"></label>
${switchRow('Chime when a session finishes', 'chime', s.chime)}
${switchRow('Vibration', 'haptics', s.haptics)}
<h3 class="group-title" id="set-notify">Notifications</h3>
<div id="notify-state" hidden></div>
${native ? '' : '<p class="note">In a browser, Haven can notify you only while it is open in a tab. Reminders need the iOS or Android app.</p>'}
${notifySwitch('done', 'A session finishes', '')}
${notifySwitch('away', 'Come back to Haven', `If you switch apps during a session, after ${formatAway(warnAfter(s.allowance))}.`)}
${notifySwitch('friends', 'Friend requests and invitations', native ? 'Checked about every 15 minutes while Haven is closed.' : '')}
${notifySwitch('social', 'Cheers, nudges and gifts', '')}
${native ? `${notifySwitch('streak', 'Streak about to end', 'At 8 pm on a day you have not focused yet.')}
${notifySwitch('hungry', 'Animals are hungry', 'Once a day at most, never at night.')}
${switchRow('Remind me to focus every day', 'reminder-on', s.reminder.on)}${field('At', `<input type="time" value="${s.reminder.time}" data-change="reminder-time">`)}` : ''}
<h3 class="group-title">Look</h3>
${field('Theme', select('theme', [['system', 'Same as the phone'], ['light', 'Light'], ['dark', 'Dark']], s.theme))}
<h3 class="group-title" id="set-account">Account</h3>${profile}
<h3 class="group-title">Your data</h3>
<p class="note">Your haven is kept on this phone and in your account. A backup file holds your sessions, coins and haven.</p>
<div class="button-row"><button class="secondary" data-action="export">Save a backup file</button><button class="secondary" data-action="import">Open a backup file</button></div>
<div class="button-row quiet"><button class="linklike danger" data-action="reset">Erase everything on this phone</button></div>
<h3 class="group-title">About</h3>
<p class="note">Haven ${e(app.version)}. Friends server: ${social.base ? ({ live: 'connected', connecting: 'connecting', offline: 'not reachable', 'signed-out': 'ready' }[social.status]) : 'not set'}. <a href="https://shira421.github.io/haven/privacy.html" target="_blank" rel="noopener">Privacy policy</a>. <a href="https://github.com/shira421/haven" target="_blank" rel="noopener">Source on GitHub</a>.</p>
${field('Friends server address', `<input type="url" inputmode="url" value="${e(social.base || '')}" placeholder="https://" data-change="api-base">`, 'Leave as it is unless you run your own server.')}`, { cls: 'settings' });
  if (section) $('#set-' + section)?.scrollIntoView({ block: 'start' });
  notifyState();
}

/** In a phone's browser: the way to let Chrome say when the screen locks, and how the last absence was judged. */
function browserLeaving(app) {
  const idle = leaving.idleState(), last = app.timer.lastAway;
  const sec = ms => formatAway(Math.round(ms / 1000));
  const row = !leaving.idleSupported() ? ''
    : idle === 'on' ? '<p class="note">Haven is told when the screen locks.</p>'
    : idle === 'denied' ? '<p class="note">Haven is not allowed to know when the screen locks. You can allow it in the site settings.</p>'
    : '<div class="button-row"><button class="secondary" data-action="allow-idle">Let Haven know when the screen locks</button></div><p class="note">Optional. It makes a locked screen certain, so only another app counts.</p>';
  const told = last ? `<p class="note" id="last-away">Last time away: ${sec(last.wall)}${last.slept != null ? `, phone asleep ${sec(last.slept)}` : ''}. Counted ${sec(last.counted)}. ${e(last.why)}</p>` : '';
  return row + told;
}

/** Say whether the phone lets Haven notify at all, with the way to change it. */
async function notifyState() {
  const p = await device.notificationPermission(false), box = $('#notify-state');
  if (!box || p === 'granted') return;
  const native = device.bridge();
  box.innerHTML = p === 'unsupported' ? '<p class="note">This browser cannot show notifications.</p>'
    : p === 'denied' ? `<p class="notice-text">Notifications are off for Haven${native ? ' in your phone\'s settings' : ' in this browser'}, so none of these will arrive.</p>${native ? '<div class="button-row"><button class="secondary wide" data-action="notify-settings">Open notification settings</button></div>' : ''}`
    : '<p class="notice-text">Haven is not allowed to send notifications yet.</p><div class="button-row"><button class="primary wide" data-action="allow-notify">Allow notifications</button></div>';
  box.hidden = false;
}

function profileDialog(app) {
  const me = app.social.account;
  const choices = ANIMALS.filter(a => app.store.state.unlocked.includes(a.id) || a.id === me.avatar || a.id === 'rabbit');
  openDialog('Edit profile', `<form data-form="profile" novalidate>${field('Name', `<input name="name" maxlength="24" value="${e(me.name)}" required>`)}
<fieldset class="avatar-pick"><legend>Picture</legend>${choices.map(a => `<label><input type="radio" name="avatar" value="${a.id}" ${a.id === me.avatar ? 'checked' : ''}><span class="sr-only">${e(a.name)}</span>${avatar(a.id, 'large')}</label>`).join('')}</fieldset>
<p class="note">Animals you unlock can be your picture.</p><p class="form-error" role="alert" hidden></p>
<div class="button-row"><button class="primary wide" type="submit">Save profile</button></div></form>`);
}

export const actions = {
  settings: (app, d) => settingsDialog(app, d.section),
  'allow-idle': async app => {
    const r = await leaving.askIdle();
    toast(r === 'on' ? 'Haven will know when the screen locks.' : r === 'denied' ? 'Not allowed. Haven will judge from other signs.' : 'This browser cannot say when the screen locks.');
    settingsDialog(app, 'focus');
  },
  'edit-profile': app => profileDialog(app),
  'change-password'(app) {
    const me = app.social.account, has = me.hasPassword !== false;
    openDialog(has ? 'Change password' : 'Set a password', `<form data-form="change-password" novalidate>
<input type="text" name="handle" value="${e(me.handle)}" autocomplete="username" hidden>
${has ? field('Current password', '<input type="password" name="current" maxlength="128" autocomplete="current-password" required>') : ''}
${field('New password', '<input type="password" name="password" maxlength="128" autocomplete="new-password" required>', 'At least 8 characters.')}
<p class="form-error" role="alert" hidden></p>
<div class="button-row"><button class="primary wide" type="submit">Save password</button></div>
${has ? '<p class="note">Your other phones and computers are signed out, and sign in again with the new password.</p>' : '<p class="note">With a password you can sign in with your username as well as with Google.</p>'}</form>`);
  },
  'disconnect-google': async app => {
    if (!(await app.confirm('Disconnect Google?', 'You will sign in with your username and password only.', 'Disconnect'))) return;
    try { await app.social.googleUnlink(); toast('Google disconnected.'); settingsDialog(app, 'account'); } catch (error) { toast(error.message); }
  },
  'backup-now': async app => { try { await app.social.backup(); toast('Saved to your account.'); settingsDialog(app, 'account'); } catch (error) { toast(error.message); } },
  'sign-out': async app => {
    if (app.store.state.active) { toast('Finish or give up your session first.'); return; }
    if (!(await app.confirm('Sign out?', 'Your haven is saved in your account and is taken off this phone. Sign in again with your username and password to get it back.', 'Sign out', { danger: false }))) return;
    app.veil('Saving your haven');
    let saved = true;
    try { await app.social.sync(); } catch { saved = false; }
    await app.unveil();
    if (!saved && !(await app.confirm('Sign out without saving?', 'Haven cannot reach your account right now. Anything you did since it was last saved would be lost.', 'Sign out anyway'))) return;
    await app.social.signOut();
    toast('Signed out.');
  },
  'delete-profile': async app => {
    if (!(await app.confirm('Delete your account?', 'Your name, friends, haven and sessions are removed for good, here and on every other phone or computer. This cannot be undone.', 'Delete account'))) return;
    try { await app.social.deleteAccount(); toast('Account deleted.'); } catch (error) { toast(error.message); }
  },
  'allow-notify': async app => {
    const p = await device.notificationPermission(true);
    toast(p === 'granted' ? 'Notifications allowed.' : p === 'unsupported' ? 'Notifications are not available here.' : device.bridge() ? 'Notifications are off. Turn them on in your phone\'s settings.' : 'Notifications are blocked. Allow them in the browser settings.');
    if (p === 'granted') { app.syncReminder(); settingsDialog(app, 'notify'); }
  },
  'notify-settings': () => device.openNotificationSettings(),
  export: async app => {
    const text = JSON.stringify(app.store.exportState());
    const name = `haven-backup-${new Date(app.now()).toISOString().slice(0, 10)}.json`;
    if (device.bridge()) { toast((await device.copyText(text)) ? 'Backup copied. Paste it into a note to keep it.' : 'Could not copy the backup.'); return; }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Backup file saved.');
  },
  import: app => {
    openDialog('Open a backup', `<form data-form="import" novalidate><label class="form-field"><span>Backup file</span><input type="file" name="file" accept="application/json,.json"></label>
${field('Or paste a backup', '<textarea name="text" rows="4" spellcheck="false"></textarea>')}
<p class="note">The backup is combined with what is on this phone. Nothing is lost.</p><p class="form-error" role="alert" hidden></p><div class="button-row"><button class="primary wide" type="submit">Combine backup</button></div></form>`);
  },
  reset: async app => {
    if (!(await app.confirm('Erase everything?', 'Your sessions, coins, plants and animals on this phone are removed for good. Save a backup file first if you might want them.', 'Erase everything'))) return;
    app.store.reset(); toast('Erased.');
  },
};

export const changes = {
  deep: (app, el) => app.store.set({ deep: el.checked }),
  allowance: (app, el) => app.store.set({ allowance: Number(el.value) }),
  keepAwake: (app, el) => app.store.set({ keepAwake: el.checked }),
  notify: async (app, el) => {
    if (el.checked && ['denied', 'unsupported'].includes(await device.notificationPermission(true))) { el.checked = false; toast(device.bridge() ? 'Turn on notifications for Haven in your phone\'s settings first.' : 'Allow notifications in the browser settings first.'); return; }
    app.store.set({ notify: { ...app.store.state.settings.notify, [el.dataset.kind]: el.checked } });
  },
  autoPlace: (app, el) => app.store.set({ autoPlace: el.checked }),
  sound: (app, el) => { app.store.set({ sound: el.value }); if (app.store.state.active) app.sound.start(el.value, app.store.state.settings.volume); },
  chime: (app, el) => { app.store.set({ chime: el.checked }); if (el.checked) app.sound.chime(); },
  haptics: (app, el) => { app.store.set({ haptics: el.checked }); if (el.checked) device.haptic('success'); },
  theme: (app, el) => { app.store.set({ theme: el.value }); app.applyTheme(); },
  'reminder-on': async (app, el) => {
    if (el.checked && (await device.notificationPermission(true)) !== 'granted') { el.checked = false; toast('Allow notifications for Haven in the phone settings first.'); return; }
    app.store.set({ reminder: { ...app.store.state.settings.reminder, on: el.checked } }); app.syncReminder();
  },
  'reminder-time': (app, el) => { if (!el.value) return; app.store.set({ reminder: { ...app.store.state.settings.reminder, time: el.value } }); app.syncReminder(); },
  'api-base': (app, el) => {
    const v = el.value.trim().replace(/\/+$/, '');
    if (v && !/^https?:\/\/[^\s]+$/.test(v)) { toast('Enter an address that starts with https://'); return; }
    if (v) localStorage.setItem('haven-api', v); else localStorage.removeItem('haven-api');
    toast('Saved. Reopen Haven to use it.');
  },
};

export const forms = {
  'change-password': (app, form) => busy(form, async () => {
    formError(form, '');
    try { await app.social.setPassword(form.password.value, form.current ? form.current.value : undefined); closeDialog(); toast('Password saved.'); } catch (error) { formError(form, error.message); }
  }),
  profile: (app, form) => busy(form, async () => {
    try { await app.social.rename(form.name.value, form.avatar.value); closeDialog(); toast('Profile saved.'); } catch (error) { formError(form, error.message); }
  }),
  import: (app, form) => busy(form, async () => {
    try {
      const file = form.file.files[0];
      const text = file ? await file.text() : form.text.value.trim();
      if (!text) return formError(form, 'Choose a backup file or paste a backup.');
      let data;
      try { data = JSON.parse(text); } catch { return formError(form, 'That is not a Haven backup.'); }
      const r = app.store.importState(data);
      if (!r.ok) return formError(form, r.error);
      closeDialog(); toast('Backup combined.'); app.social.pushCard();
    } catch { formError(form, 'The file could not be read.'); }
  }),
};
