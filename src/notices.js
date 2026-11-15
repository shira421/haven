// The notifications Haven sets up on its own: a streak about to end, animals getting hungry, and
// news from friends while Haven is closed. Each follows the switches in Settings.
import * as device from './device.js';
import { streakNudge, hungryNudge } from './core.js';

/** Words for one piece of news from a friend, or null for kinds that are not shown. */
export function newsText(item) {
  const who = item.from?.name || item.name || 'A friend';
  switch (item.kind) {
    case 'request': return { kind: 'friends', title: 'New friend request', body: `${who} wants to be friends on Haven.` };
    case 'accepted': return { kind: 'friends', title: 'Friend request accepted', body: `${who} accepted your request.` };
    case 'invite': return { kind: 'friends', title: 'Focus together?', body: `${who} invited you to focus together${item.data?.minutes ? ` for ${item.data.minutes} min` : ''}.` };
    case 'cheer': return { kind: 'social', title: 'A cheer for you', body: `${who} cheered you on.` };
    case 'nudge': return { kind: 'social', title: 'Time to focus?', body: `${who} is nudging you to focus.` };
    case 'gift': return { kind: 'social', title: 'You got a gift', body: `${who} sent you something for your haven.` };
    case 'sanctuary': return { kind: 'friends', title: 'Join a sanctuary?', body: `${who} invited you to join ${item.data?.name ? `"${item.data.name}"` : 'their sanctuary'}.` };
    default: return null;
  }
}

/** Schedule or clear the streak and hunger reminders. Only the apps can schedule. */
export function syncReminders(store, now = Date.now()) {
  if (!device.canSchedule()) return;
  const n = store.state.settings.notify;
  const streak = n.streak ? streakNudge(store.state.sessions, now) : null;
  if (streak) device.notifyAt('streak', streak.at, `Keep your ${streak.days}-day streak`, 'You have not focused today. A short session keeps the streak going.');
  else device.cancelNotification('streak');
  const animals = store.animals();
  const hungry = n.hungry ? hungryNudge(animals, now) : null;
  if (hungry) device.notifyAt('hungry', hungry, 'Your animals are hungry', 'Open Haven and give them a treat.');
  else device.cancelNotification('hungry');
}

/** Tell the phone which server to check for news, and what is wanted. Signing out stops it. */
export function syncNewsAccount(social, store) {
  const n = store.state.settings.notify;
  const on = social.signedIn && social.base && (n.friends || n.social);
  return device.setNewsAccount({ base: on ? social.base : '', token: on ? social.account.token : '', kinds: { friends: n.friends, social: n.social } });
}
