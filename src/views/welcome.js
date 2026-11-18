// What stands in front of Haven until someone is signed in: signing in or creating an account,
// choosing a username after "Continue with Google", and, for an account made before passwords,
// setting one. Also the way to and back from Google.
import { e, $, field, formError, busy, toast, openDialog, closeDialog, dialogOpen, veil, unveil } from '../ui.js';
import { speciesById } from '../catalog.js';
import * as device from '../device.js';

const GOOGLE_ERRORS = {
  cancelled: 'Signing in with Google was cancelled.',
  taken: 'That Google account is already connected to another Haven account.',
  gone: 'That account no longer exists.',
};

/** Which screen stands in front of the app, or null when it is open. */
export function gate(app) {
  const { social } = app;
  if (!social?.base) return null; // a copy of Haven with no server works on its own
  if (app.ui.googleNew) return 'google-profile';
  if (!social.signedIn) return 'welcome';
  if (social.needsPassword) return 'password';
  return null;
}

const password = (name, label, hint, complete) => field(label, `<span class="password-box"><input type="password" name="${name}" maxlength="128" autocomplete="${complete}" autocapitalize="none" spellcheck="false" required><button type="button" class="linklike" data-action="show-password" aria-pressed="false">Show</button></span>`, hint);
const username = hint => field('Username', '<input name="handle" maxlength="21" autocapitalize="none" autocomplete="username" spellcheck="false" required>', hint);
const hero = (title, text) => `<div class="welcome-hero"><img src="./icons/icon.svg" alt="" width="96" height="96"><h1 class="page-title">${title}</h1><p class="lead">${text}</p></div>`;

export function render(app, kind) {
  const { social, store } = app;
  if (kind === 'password') {
    return `<section class="page welcome" data-page="welcome">${hero('Set a password', `So you can sign in anywhere as <b>@${e(social.account.handle)}</b>.`)}
<form data-form="set-password" class="card-form" novalidate>
<input type="text" name="handle" value="${e(social.account.handle)}" autocomplete="username" hidden>
${password('password', 'Password', 'At least 8 characters.', 'new-password')}
<p class="form-error" role="alert" hidden></p>
<button class="primary wide" type="submit">Save password</button></form></section>`;
  }
  if (kind === 'google-profile') {
    return `<section class="page welcome" data-page="welcome">${hero('Choose a username', 'Friends find you by it.')}
<form data-form="google-profile" class="card-form" novalidate>
${field('Name', `<input name="name" maxlength="24" autocomplete="nickname" value="${e(app.ui.googleNew.name || '')}" required>`, 'What friends see.')}
${username('3 to 20 letters, numbers or underscores.')}
<p class="form-error" role="alert" hidden></p>
<button class="primary wide" type="submit">Create account</button></form>
<p class="note"><button class="linklike" data-action="google-cancel">Use a different way to sign in</button></p></section>`;
  }
  const tab = app.ui.welcomeTab || 'in', create = tab === 'up';
  const kept = store.state.sessions.length || store.state.items.length ? '<p class="notice-text">The haven on this phone moves into your account.</p>' : '';
  const google = social.features.google ? `<div class="or"><span>or</span></div><button type="button" class="secondary wide" data-action="google">Continue with Google</button>` : '';
  const form = create ? `<form data-form="sign-up" class="card-form" novalidate>
${field('Name', '<input name="name" maxlength="24" autocomplete="nickname" required>', 'What friends see.')}
${username('3 to 20 letters, numbers or underscores.')}
${password('password', 'Password', 'At least 8 characters.', 'new-password')}
<p class="form-error" role="alert" hidden></p>
<button class="primary wide" type="submit">Create account</button>${google}</form>`
    : `<form data-form="sign-in" class="card-form" novalidate>
${username('')}
${password('password', 'Password', '', 'current-password')}
<p class="form-error" role="alert" hidden></p>
<button class="primary wide" type="submit">Sign in</button>${google}
<p class="note"><button type="button" class="linklike" data-action="forgot-password">Forgot your password?</button></p></form>`;
  return `<section class="page welcome" data-page="welcome">${hero('Haven', 'Focus, and grow a sanctuary of plants and animals.')}
<div class="segmented" role="tablist" aria-label="Sign in or create an account"><button role="tab" aria-selected="${!create}" data-action="welcome-tab" data-value="in">Sign in</button><button role="tab" aria-selected="${create}" data-action="welcome-tab" data-value="up">Create account</button></div>
${app.ui.pendingAdd ? '<p class="notice-text">Sign in to add the friend who invited you.</p>' : ''}${create ? kept : ''}${form}</section>`;
}

/** Signed in: say so, and open the haven. */
function entered(app, text) {
  app.ui.googleNew = null;
  if (dialogOpen()) closeDialog();
  app.social.syncSessions().catch(() => {});
  app.go('focus');
  app.render();
  toast(text);
  app.afterSignIn?.();
}

/** Run something that signs in, under the loading screen. Errors go to the form. */
async function signingIn(form, text, work) {
  formError(form, '');
  veil(text);
  try { return await work(); } catch (error) { formError(form, error.message); return null; } finally { await unveil(); }
}

const avatarFor = app => (speciesById(app.store.state.settings.species)?.kind === 'animal' ? app.store.state.settings.species : 'rabbit');

/** Where Google sends people back to: the apps have their own address, a browser returns to this page. */
const returnAddress = () => (device.bridge() ? 'haven://auth' : location.origin + location.pathname);
async function toGoogle(app, link = null) {
  const url = await app.social.googleUrl(returnAddress(), link);
  if (!device.bridge()) { location.assign(url); return; }
  const back = await device.openExternal(url);
  if (typeof back === 'string' && back) googleReturned(app, new URLSearchParams(back));
}

/**
 * Back from Google. `params` holds `google` (a one-time code, or "linked") or `google-error`.
 */
export async function googleReturned(app, params) {
  const error = params.get('google-error'), code = params.get('google');
  if (error) { toast(GOOGLE_ERRORS[error] || 'Signing in with Google did not work. Try again.'); return; }
  if (!code) return;
  if (code === 'linked') { await app.social.refresh().catch(() => {}); toast('Google connected.'); return; }
  if (app.social.signedIn) return;
  veil('Signing you in');
  try {
    const r = await app.social.googleClaim(code);
    if (r.needsProfile) { app.ui.googleNew = { code, name: r.name }; app.render(); }
    else entered(app, `Welcome back, ${r.name}.`);
  } catch (err) { toast(err.message); } finally { await unveil(); }
}

export const actions = {
  'welcome-tab'(app, d) { app.ui.welcomeTab = d.value; app.render(); $('#view form input')?.focus({ preventScroll: true }); },
  'show-password'(app, d, el) {
    const input = el.closest('.password-box').querySelector('input'), show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    el.textContent = show ? 'Hide' : 'Show';
    el.setAttribute('aria-pressed', String(show));
  },
  google: app => toGoogle(app),
  'google-cancel'(app) { app.ui.googleNew = null; app.render(); },
  'connect-google': async app => { try { toGoogle(app, await app.social.googleLinkCode()); } catch (error) { toast(error.message); } },
  'forgot-password'(app) {
    openDialog('Forgot your password?', `${app.social.features.google ? '<p class="lead">If Google is connected, use Continue with Google, then set a new password in Settings.</p>' : ''}
<p class="lead">If you are still signed in on another device, change it there in Settings. Otherwise, write to the support email on Haven's Google Play page.</p>
<div class="button-row"><button class="primary wide" data-action="close-dialog">OK</button></div>`);
  },
};

export const forms = {
  'sign-in': (app, form) => busy(form, async () => {
    const user = await signingIn(form, 'Bringing your haven over', () => app.social.login(form.handle.value, form.password.value));
    if (user) entered(app, `Welcome back, ${user.name}.`);
  }),
  'sign-up': (app, form) => busy(form, async () => {
    const user = await signingIn(form, 'Making your account', () => app.social.register(form.name.value, form.handle.value, form.password.value, avatarFor(app)));
    if (user) entered(app, `Welcome to Haven, ${user.name}.`);
  }),
  'google-profile': (app, form) => busy(form, async () => {
    const user = await signingIn(form, 'Making your account', () => app.social.googleClaim(app.ui.googleNew.code, { name: form.name.value, handle: form.handle.value, avatar: avatarFor(app) }));
    if (user) entered(app, `Welcome to Haven, ${user.name}.`);
  }),
  'set-password': (app, form) => busy(form, async () => {
    formError(form, '');
    try { await app.social.setPassword(form.password.value); app.render(); toast('Password saved.'); } catch (error) { formError(form, error.message); }
  }),
};
