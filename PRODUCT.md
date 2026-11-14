# Haven: what is built

This file says what Haven does today and what it does not, so nothing is taken for built that is not.

## Who it is for

People who study or work in focused blocks and want a reason to stay off their phone, alone or with friends.

## Built

### Focusing

| Feature | Notes |
| --- | --- |
| Timer | 5 to 180 min in 5 min steps. Cancel free in the first 10 s. |
| Stopwatch | Counts up. Grows something from 10 min, stops by itself at 180 min. |
| Pomodoro | Focus, short break, long break and rounds are all adjustable. The next round can start by itself. |
| Deep focus | Away from Haven for longer than the allowance (5 s to 5 min) and the session fails. Can be turned off. |
| Lock is not leaving | In the iOS and Android apps. A browser cannot tell the two apart, so the web app offers "Keep the screen on" instead. |
| Tags | Up to 12, each with a colour, shown in the journal. |
| Sounds | Seven background sounds and a finishing chime, generated on the device. |
| Session survives a restart | A running session is stored and resumes, or is judged by how long Haven was closed. |

### Growing

| Feature | Notes |
| --- | --- |
| 27 plants and 27 animals | Original drawings. Four growth stages during a session. Three sizes by session length. |
| Coins | 2 a minute, more for longer sessions, streaks and friends. |
| Unlocks | Coins, goals (for example a 120 min session for the bonsai) or free in season. Nothing costs money. |
| Levels and land | Level from total focused time. The haven grows from 5 by 5 to 10 by 10 tiles. |
| Arranging | Place, move, swap, store and release. New arrivals can place themselves. |
| 25 achievements | Each pays coins. |

### Friends

| Feature | Notes |
| --- | --- |
| Profile | Name and username. No email or password. |
| Adding friends | By friend code, exact username or invite link. Requests, accept, decline, cancel, remove, block. |
| Live presence | Online, focusing and time left, today's minutes. Arrives over a live connection. |
| Cheer and nudge | Delivered at once, or when the friend is next online. |
| Gifts | Send a plant or animal you have unlocked. It arrives ready to place. |
| Visit | See a friend's haven and totals. |
| Rooms | Up to 8 people. Start together on the server's clock. "Ends for everyone" or "only they lose theirs". |
| Board | You and your friends for today, week, month and all time. |
| Activity | What you and your friends grew in the last 14 days. |
| Other devices | A one-time code signs in a second device and brings the haven with it. |
| Backup | To the server when signed in, or as a file. |

### How Forest's paid features map

| Forest | Haven |
| --- | --- |
| Plant together | Rooms, with both rules. |
| Friends and rankings | Friends, live presence, board, activity. |
| More species, seasonal trees | 54 species, four of them seasonal, all free. |
| Triple coins | Haven pays 2 coins a minute for everyone, with bonuses. |
| Detailed statistics, insights | Journal: periods, chart, by tag, best hour, finished rate, streaks. |
| Personalised focus settings | Away allowance, deep focus on or off, pomodoro lengths, auto-start. |
| Sync across devices | Server backup and device linking. |
| No ads | There are none. |
| Custom app allow list | **Not built.** See below. Haven has a time-away allowance instead. |
| Planting real trees | **Not built.** That is Forest's own partnership. |

## Not built

- **Per-app allow list.** Letting chosen apps through needs Apple's Family Controls entitlement on iOS and usage-access permission with a background service on Android. Haven forgives a set time away instead.
- **Planting real trees.**
- **Widgets, watch apps, and scheduled blocking.**
- **Push notifications from the server.** A cheer reaches a closed app only when it is next opened. Session-end and reminder notifications are scheduled on the phone and do work while the app is closed, in the iOS and Android apps.
- **Sounds while the phone is locked.**
- **App Store and Play Store listings.** The apps are installed from the release page.
- **Languages other than English.**

## Limits to know

- The friends server is one Durable Object. It suits a circle of friends up to a few thousand people. See ARCHITECTURE.md.
- Coins and the haven live on your device. The server checks session times for the board, not coins.
- A profile can only be reached from a device that is signed in. If every signed-in device is lost, so is access to the profile.
