// Settings: how sessions behave, sounds, reminders, the look, your profile and your data.
import { e, $, icon, openDialog, closeDialog, toast, field, switchRow, formError, busy, avatar } from '../ui.js';
import { ANIMALS } from '../catalog.js';
import { SOUNDS } from '../sound.js';
import { prettyCode } from '../social.js';
import { formatAgo, formatAway, warnAfter } from '../core.js';
import * as device from '../device.js';

const ALLOWANCES = [[30, '30 s'], [45, '45 s'], [60, '1 min'], [90, '1.5 min'], [120, '2 min']];
const select = (action, options, current) => `<select data-change="${action}">${options.map(([v, t]) => `<option value="${e(v)}" ${String(v) === String(current) ? 'selected' : ''}>${e(t)}</option>`).join('')}</select>`;

export function settingsDialog(app, section = null) {
  const { store, social } = app, s = store.state.settings, native = device.bridge();
  const notifySwitch = (kind, label, hint) => `<label class="switch-row"><span><b>${e(label)}</b>${hint ? `<small>${e(hint)}</small>` : ''}</span><input type="checkbox" data-change="notify" data-kind="${kind}" ${s.notify[kind] ? 'checked' : ''}></label>`;
  const lockNote = native ? 'Locking the phone does not count as leaving.' : 'A browser cannot tell a locked phone from a switched app, so keep the screen on, or use the iOS or Android app.';
  const profile = !social.base ? '<p class="note">Friends are not switched on for this copy of Haven.</p>'
    : social.signedIn ? `<div class="me-card">${avatar(social.account.avatar, 'large')}<div class="row-main"><b>${e(social.account.name)}</b><span>@${e(social.account.handle)}, code ${prettyCode(social.account.code)}</span></div></div>
<div class="button-row"><button class="secondary" data-action="edit-profile">Edit profile</button><button class="secondary" data-action="add-device">Add another device</button></div>
<p class="note">${social.data.backupAt ? `Backed up ${formatAgo(social.data.backupAt, social.serverNow())}.` : 'Not backed up yet.'} <button class="linklike" data-action="backup-now">Back up now</button></p>
<div class="button-row quiet"><button class="linklike" data-action="sign-out">Sign out</button><button class="linklike danger" data-action="delete-profile">Delete profile</button></div>`
    : '<p class="note">Make a profile on the Friends screen to add friends and back up your haven.</p><div class="button-row"><button class="secondary wide" data-action="go" data-page="friends">Open Friends</button></div>';
  openDialog('Settings', `<h3 class="group-title" id="set-focus">Focus</h3>
${switchRow('Deep focus', 'deep', s.deep, `Leaving Haven during a session withers the plant. ${lockNote}`)}
${field('Time away that is forgiven', select('allowance', ALLOWANCES, s.allowance), 'Enough to answer a message or change a song.')}
${device.canKeepAwake() ? switchRow('Keep the screen on', 'keepAwake', s.keepAwake, native ? 'While a session runs. Off lets the phone lock as usual, which is not leaving.' : 'While a session runs.') : ''}
${switchRow('Place new plants and animals for me', 'autoPlace', s.autoPlace, 'On a free tile. You can move them later.')}
<h3 class="group-title">Sounds</h3>
${field('Background sound', select('sound', SOUNDS.map(x => [x.id, x.name]), s.sound))}
<label class="form-field"><span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-input="volume"></label>
${switchRow('Chime when a session finishes', 'chime', s.chime)}
${switchRow('Vibration', 'haptics', s.haptics)}
<h3 class="group-title" id="set-notify">Notifications</h3>
${native ? '' : '<p class="note">In a browser, Haven can notify you only while it is open in a tab. Reminders need the iOS or Android app.</p><div class="button-row"><button class="secondary wide" data-action="allow-notify">Allow notifications</button></div>'}
${notifySwitch('done', 'A session finishes', '')}
${notifySwitch('away', 'Come back to Haven', `If you switch apps during a session, after ${formatAway(warnAfter(s.allowance))}.`)}
${notifySwitch('friends', 'Friend requests and invitations', native ? 'Checked about every 15 minutes while Haven is closed.' : '')}
${notifySwitch('social', 'Cheers, nudges and gifts', '')}
${native ? `${notifySwitch('streak', 'Streak about to end', 'At 8 pm on a day you have not focused yet.')}
${notifySwitch('hungry', 'Animals are hungry', 'Once a day at most, never at night.')}
${switchRow('Remind me to focus every day', 'reminder-on', s.reminder.on)}${field('At', `<input type="time" value="${s.reminder.time}" data-change="reminder-time">`)}` : ''}
<h3 class="group-title">Look</h3>
${field('Theme', select('theme', [['system', 'Same as the phone'], ['light', 'Light'], ['dark', 'Dark']], s.theme))}
<h3 class="group-title">Profile</h3>${profile}
<h3 class="group-title">Your data</h3>
<p class="note">Everything is kept on this phone. A backup file holds your sessions, coins and haven.</p>
<div class="button-row"><button class="secondary" data-action="export">Save a backup file</button><button class="secondary" data-action="import">Open a backup file</button></div>
<div class="button-row quiet"><button class="linklike danger" data-action="reset">Erase everything on this phone</button></div>
<h3 class="group-title">About</h3>
<p class="note">Haven ${e(app.version)}. Friends server: ${social.base ? ({ live: 'connected', connecting: 'connecting', offline: 'not reachable', 'signed-out': 'ready' }[social.status]) : 'not set'}. <a href="https://github.com/shira421/haven" target="_blank" rel="noopener">Source on GitHub</a></p>
${field('Friends server address', `<input type="url" inputmode="url" value="${e(social.base || '')}" placeholder="https://" data-change="api-base">`, 'Leave as it is unless you run your own server.')}`, { cls: 'settings' });
  if (section) $('#set-' + section)?.scrollIntoView({ block: 'start' });
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
  'edit-profile': app => profileDialog(app),
  'add-device': async app => {
    try {
      const r = await app.social.linkCode();
      openDialog('Add another device', `<p class="lead">On the other device, open Haven, go to Friends, and choose "I already have a profile on another device". Enter this code within 10 minutes.</p><div class="code-box"><span>One-time code</span><b>${prettyCode(r.code)}</b></div><p class="note">Anyone with this code can sign in as you until it runs out. It works once.</p><div class="button-row"><button class="primary wide" data-action="close-dialog">Done</button></div>`);
    } catch (error) { toast(error.message); }
  },
  'backup-now': async app => { try { await app.social.backup(); toast('Backed up.'); settingsDialog(app); } catch (error) { toast(error.message); } },
  'sign-out': async app => {
    if (!(await app.confirm('Sign out?', 'Your haven stays on this phone. Friends will not see new sessions until you sign in again. To sign in again you need another device that is still signed in.', 'Sign out'))) return;
    await app.social.signOut(); toast('Signed out.');
  },
  'delete-profile': async app => {
    if (!(await app.confirm('Delete your profile?', 'Your name, friends, and everything the server holds about you are removed for good. Your haven stays on this phone.', 'Delete profile'))) return;
    try { await app.social.deleteAccount(); toast('Profile deleted.'); } catch (error) { toast(error.message); }
  },
  'allow-notify': async () => { const p = await device.notificationPermission(true); toast(p === 'granted' ? 'Notifications allowed.' : p === 'unsupported' ? 'This browser does not support notifications.' : 'Notifications are blocked. Allow them in the browser settings.'); },
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
    if (el.checked && (await device.notificationPermission(true)) === 'denied') { el.checked = false; toast('Allow notifications for Haven in the phone settings first.'); return; }
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
