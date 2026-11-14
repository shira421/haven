// The pieces every screen shares: markup helpers, icons, the one dialog, the toast.
import { escapeHTML } from './core.js';
import { sprite } from './art.js';
import { speciesById } from './catalog.js';

export const e = escapeHTML;
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const ICONS = {
  focus: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  haven: 'M12 21v-8M12 13c-4 0-7-3-7-7 4 0 7 3 7 7Zm0-2c0-3 2-6 6-6 0 4-3 6-6 6ZM4 21h16',
  collection: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  friends: 'M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M21 19v-1a3 3 0 0 0-3-3M3 19v-1a3 3 0 0 1 3-3M18 5.5a2.5 2.5 0 0 1 0 5M6 5.5a2.5 2.5 0 0 0 0 5',
  journal: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M13 7a2 2 0 1 0 4 0 2 2 0 0 0-4 0M7 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0M4 12h16',
  close: 'm6 6 12 12M6 18 18 6',
  back: 'M19 12H5m6-6-6 6 6 6',
  prev: 'm14 6-6 6 6 6',
  next: 'm10 6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12 5 5 9-10',
  coin: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7.5v9M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1 1.700 2.500 2 2.500.800 2.500 2-1.100 2-2.500 2c-1.100 0-2.100-.500-2.600-1.500',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  tag: 'M3 12V4h8l10 10-8 8ZM7.5 7.5h.01',
  sound: 'M4 10v4h4l5 4V6L8 10ZM16 9a4 4 0 0 1 0 6M18.5 6.500a8 8 0 0 1 0 11',
  mute: 'M4 10v4h4l5 4V6L8 10ZM17 10l4 4m0-4-4 4',
  cheer: 'M7 11v9H4v-9ZM7 11l4-8c1.700 0 3 1.300 3 3v3h4.500a2 2 0 0 1 2 2.400l-1.300 6A2 2 0 0 1 17.200 20H7',
  nudge: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4Zm4 4a2 2 0 0 0 4 0',
  gift: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.500-4-6-3.500-5-1 .600 1.300 3 1 5 1Zm0 0c1.500-4 6-3.500 5-1-.600 1.300-3 1-5 1Z',
  share: 'M12 15V4m0 0L8 8m4-4 4 4M5 13v6h14v-6',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  trash: 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13',
  lock: 'M6 11h12v9H6zM8.500 11V8a3.500 3.500 0 0 1 7 0v3',
  flame: 'M12 21c-3.500 0-6-2.500-6-6 0-3 2-4.500 3-7 1 1.500 1.500 2.500 1.500 4 1.500-1.500 2.500-4 2-8 3.500 2.500 5.500 6.500 5.500 11 0 3.500-2.500 6-6 6Z',
  users: 'M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  edit: 'M4 20h4L19 9l-4-4L4 16Zm9-13 4 4',
  info: 'M21 12A9 9 0 1 1 3 12a9 9 0 0 1 18 0m-9-1v6m0-10v.100',
  link: 'M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  play: 'M7 5v14l11-7Z',
  stop: 'M7 7h10v10H7z',
  door: 'M14 4h5v16h-5M10 12H3m4-4-4 4 4 4M14 4 9 6v12l5 2',
};
export const icon = (name, cls = '') => `<svg class="icon${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name] || ICONS.info}"/></svg>`;

/** A species drawn at its natural size for lists and cards. */
export function avatar(id, cls = '') {
  const s = speciesById(id) || speciesById('rabbit');
  return `<span class="avatar${cls ? ' ' + cls : ''}">${sprite(s.id, { kind: s.kind })}</span>`;
}

/** A choice among a few views. `items` is [[value, label], …]. */
export function segmented(name, items, current, label) {
  return `<div class="segmented" role="tablist" aria-label="${e(label)}">${items.map(([value, text]) => `<button role="tab" aria-selected="${value === current}" data-action="${name}" data-value="${e(value)}">${e(text)}</button>`).join('')}</div>`;
}

export const empty = (text, action = '') => `<div class="empty"><p>${text}</p>${action}</div>`;
export const field = (label, control, hint = '') => `<label class="form-field"><span>${e(label)}</span>${control}${hint ? `<small>${hint}</small>` : ''}</label>`;
export const switchRow = (label, action, on, hint = '') => `<label class="switch-row"><span><b>${e(label)}</b>${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" data-change="${action}" ${on ? 'checked' : ''}></label>`;

// ——— Toast ———

let toastTimer;
export function toast(text) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 4200);
}

// ——— The dialog ———

let returnFocus = null, onClose = null;
/**
 * Show the dialog. `body` is HTML. `options.close` runs when it is closed for any reason.
 * `options.locked` hides the close button (for results that need one of the offered answers).
 */
export function openDialog(title, body, options = {}) {
  const dialog = $('#dialog');
  if (!dialog.open) returnFocus = document.activeElement;
  else if (onClose) { const previous = onClose; onClose = null; previous(); }
  onClose = options.close || null;
  dialog.className = options.cls || '';
  dialog.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${e(title)}</h2>${options.locked ? '' : `<button class="iconbutton" data-action="close-dialog" aria-label="Close">${icon('close')}</button>`}</div><div class="dialog-body">${body}</div>`;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  const first = dialog.querySelector('[autofocus]') || dialog.querySelector('.dialog-body button, .dialog-body input, .dialog-body select') || dialog.querySelector('button');
  first?.focus({ preventScroll: true });
}
/** Replace the dialog's content without closing it or moving focus away from a field being typed in. */
export function updateDialog(body) {
  const el = $('#dialog .dialog-body');
  if (el) el.innerHTML = body;
}
export function closeDialog() {
  const dialog = $('#dialog');
  if (dialog?.open) dialog.close();
}
export const dialogOpen = () => Boolean($('#dialog')?.open);
export function initDialog() {
  const dialog = $('#dialog');
  dialog.addEventListener('close', () => {
    const done = onClose;
    onClose = null;
    dialog.innerHTML = '';
    if (done) done();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  });
  // A tap on the dimmed area outside the sheet closes it, unless the dialog is locked.
  dialog.addEventListener('click', event => { if (event.target === dialog && dialog.querySelector('[data-action="close-dialog"]')) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (!dialog.querySelector('[data-action="close-dialog"]')) event.preventDefault(); });
}

/** Ask before something that cannot be undone. Resolves true when confirmed. */
export function confirmDialog(title, text, confirmLabel, { danger = true } = {}) {
  return new Promise(resolve => {
    let answer = false;
    openDialog(title, `<p class="lead">${text}</p><div class="button-row"><button class="secondary" data-action="close-dialog">Cancel</button><button class="${danger ? 'secondary danger' : 'primary'}" data-action="confirm-yes">${e(confirmLabel)}</button></div>`, { close: () => resolve(answer) });
    $('#dialog [data-action="confirm-yes"]').addEventListener('click', () => { answer = true; closeDialog(); }, { once: true });
  });
}

/** Show a form's error in its .form-error, or clear it. */
export function formError(form, message) {
  const el = form.querySelector('.form-error');
  if (el) { el.textContent = message || ''; el.hidden = !message; }
}
/** Disable a form's submit button while its request runs. */
export async function busy(form, work) {
  const button = form.querySelector('[type="submit"]');
  if (button) button.disabled = true;
  try { return await work(); } finally { if (button?.isConnected) button.disabled = false; }
}
