// What the phone itself does for Haven: notifications, keeping the screen on, haptics, sharing,
// and telling a locked phone apart from a switched app. Inside the iOS or Android app these go to
// native code; in a browser they use web APIs where there are any.
const g = typeof window !== 'undefined' ? window : globalThis;
const pending = new Map();
let seq = 0;

if (typeof window !== 'undefined') {
  // Android answers by calling this; iOS answers through the message handler's promise.
  window.__havenReply = (id, reply) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    if (reply && !reply.error) p.resolve(reply.value ?? null); else p.reject(new Error(reply?.error || 'The device did not answer.'));
  };
}

/** 'ios', 'android', or null in a browser. */
export function bridge() {
  if (g.webkit?.messageHandlers?.havenDevice) return 'ios';
  // The Android app hands Haven's own page HavenNative.postMessage; very old web views get .device.
  if (g.HavenNative?.postMessage || g.HavenNative?.device) return 'android';
  return null;
}

export function nativeCall(action, payload = {}, timeout = 15000) {
  const kind = bridge();
  if (kind === 'ios') {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The device did not answer.')), timeout);
      Promise.resolve().then(() => g.webkit.messageHandlers.havenDevice.postMessage({ action, ...payload })).then(resolve, reject).finally(() => clearTimeout(timer));
    });
  }
  if (kind === 'android') {
    return new Promise((resolve, reject) => {
      const id = 'd' + (++seq);
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('The device did not answer.')); }, timeout);
      pending.set(id, { resolve, reject, timer });
      const json = JSON.stringify({ action, ...payload });
      if (g.HavenNative.postMessage) g.HavenNative.postMessage(JSON.stringify({ id, json })); else g.HavenNative.device(id, json);
    });
  }
  return Promise.reject(new Error('Not available in a browser.'));
}
const quiet = promise => promise.catch(() => null);

/** A browser on a phone or tablet (not the apps): it cannot tell a locked screen from another app. */
export function phoneBrowser() {
  if (bridge()) return false;
  try { return g.matchMedia('(pointer: coarse)').matches && (g.navigator.maxTouchPoints || 0) > 0; } catch { return false; }
}

/**
 * Open an address outside the app, to sign in with Google. Apps only. On iOS this resolves with
 * what came back (the query of haven://auth?...); on Android the answer arrives later (takeAuth).
 */
export function openExternal(url) {
  return bridge() ? quiet(nativeCall('openExternal', { url }, 15 * 60000)) : Promise.resolve(null);
}
/** On Android: what came back from signing in with Google, if anything is waiting. */
export function takeAuth() {
  return bridge() === 'android' ? quiet(nativeCall('takeAuth')) : Promise.resolve(null);
}

/** Open the phone's settings for Haven's notifications, where a refusal can be undone. Apps only. */
export function openNotificationSettings() {
  return bridge() ? quiet(nativeCall('openSettings')) : Promise.resolve(null);
}

/** What went wrong the last time the app closed unexpectedly, if anything. Asked once. */
export function lastCrash() {
  return bridge() ? quiet(nativeCall('lastCrash', {}, 3000)) : Promise.resolve(null);
}

/** 'granted' | 'denied' | 'default' | 'unsupported'. With request = true, asks the person. */
export async function notificationPermission(request = false) {
  if (bridge()) return (await quiet(nativeCall('notifyPermission', { request }, 60000))) || 'unsupported';
  if (!('Notification' in g)) return 'unsupported';
  if (request && g.Notification.permission === 'default') { try { return await g.Notification.requestPermission(); } catch { return 'denied'; } }
  return g.Notification.permission;
}

/** Whether a notification can be set for a later time even if Haven is closed. Only the apps can. */
export const canSchedule = () => Boolean(bridge());

/** Show a notification at `at` (ms). In a browser nothing is scheduled; see notifyNow. */
export function notifyAt(id, at, title, body) {
  return bridge() ? quiet(nativeCall('schedule', { id, at, title, body })) : Promise.resolve(null);
}
export function cancelNotification(id) {
  return bridge() ? quiet(nativeCall('cancel', { id })) : Promise.resolve(null);
}
export async function notifyNow(title, body, tag) {
  if (bridge()) return quiet(nativeCall('notify', { id: tag, title, body }));
  if (!('Notification' in g) || g.Notification.permission !== 'granted') return null;
  try {
    const registration = await g.navigator.serviceWorker?.getRegistration?.();
    if (registration?.showNotification) return await registration.showNotification(title, { body, tag, icon: './icons/icon-192.png' });
    return new g.Notification(title, { body, tag, icon: './icons/icon-192.png' });
  } catch { return null; }
}
/** A daily reminder at a local time ("19:00"). Only the apps can keep one. */
export function setReminder({ on, time, title, body }) {
  if (!bridge()) return Promise.resolve(null);
  const [hour, minute] = time.split(':').map(Number);
  return quiet(nativeCall('reminder', { on, hour, minute, title, body }));
}

/**
 * Let the app check the friends server for news while Haven is closed (friend requests, cheers,
 * gifts, invitations) and show them as notifications. An empty token stops it.
 */
export function setNewsAccount({ base, token, kinds }) {
  return bridge() ? quiet(nativeCall('account', { base: base || '', token: token || '', kinds })) : Promise.resolve(null);
}

let wakeLock = null, wantAwake = false;
async function acquire() {
  if (!wantAwake || wakeLock || !g.navigator?.wakeLock || g.document?.visibilityState !== 'visible') return;
  try { wakeLock = await g.navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch { wakeLock = null; }
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') acquire(); });
/** Keep the screen from dimming and locking while a session runs. */
export function keepAwake(on) {
  wantAwake = on;
  if (bridge()) { quiet(nativeCall('keepAwake', { on })); return; }
  if (on) acquire(); else if (wakeLock) { quiet(wakeLock.release()); wakeLock = null; }
}
export const canKeepAwake = () => Boolean(bridge() || g.navigator?.wakeLock);

/** A short buzz: 'light' for taps, 'success' when something is earned, 'warning' when something is lost. */
export function haptic(kind = 'light') {
  if (bridge()) { quiet(nativeCall('haptic', { kind })); return; }
  try { g.navigator?.vibrate?.(kind === 'success' ? [12, 60, 18] : kind === 'warning' ? [30, 50, 30] : 8); } catch { /* not supported */ }
}

export async function copyText(text) {
  try { await g.navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const area = document.createElement('textarea');
    area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
    (document.querySelector('dialog[open]') || document.body).append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch { return false; }
}
/** Offer text to another app. Resolves 'shared', 'copied' or 'failed'. */
export async function share({ title, text, url }) {
  const full = [text, url].filter(Boolean).join(' ');
  if (bridge()) { const sent = await quiet(nativeCall('share', { text: full })); if (sent) return 'shared'; }
  else if (g.navigator?.share) { try { await g.navigator.share({ title, text, url }); return 'shared'; } catch (error) { if (error?.name === 'AbortError') return 'failed'; } }
  return (await copyText(full)) ? 'copied' : 'failed';
}

/**
 * The last time the app went to the background: {at, locked}. `locked` is true when the phone was
 * locked or its screen turned off, which Haven does not count as leaving. A browser cannot tell.
 */
export async function lastAway() {
  if (!bridge()) return null;
  const value = await quiet(nativeCall('away', {}, 1500));
  return value && typeof value === 'object' ? { at: Number(value.at) || 0, locked: Boolean(value.locked) } : null;
}
