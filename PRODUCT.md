# Haven: what is built

This file says what Haven does today and what it does not, so nothing is taken for built that is not.

## Who it is for

People who study or work in focused blocks and want a reason to stay off their phone, alone or with friends, and who would rather look after something alive than tick off a timer.

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

### The living haven

| Feature | Notes |
| --- | --- |
| Free roaming | Animals walk, hop, crawl or fly anywhere on the land. Nothing is tied to a tile. |
| Drawn to move | Every animal is drawn from the side with its own legs, head, ears, tail and wings. Legs stride in pairs, wings flap, tails wag, eyes blink, chests breathe. |
| Weight | Walkers gather speed and slow to a stop, and go round rocks, trees and water. Hops rise and fall with the body tipping through them. Birds walk short distances and fly long ones. The shadow stays on the ground. |
| Doing things | Swimming (sunk to the belly, with ripples), drinking at the bank, grazing, resting by the fire, hiding in the burrow, perching, landing on flowers, running when called or chased. |
| Effects | A splash on entering water, dust when a big hop lands, leaves when something lands in a tree, plants rustling when brushed past. |
| Calling | Tap the ground and up to three animals nearby come over. Fed animals stop to eat; petted ones jump. |
| Likes | Each animal visits the plants and nature it likes: 27 sets of likes across flowers, trees, cover, water and built things. |
| Into and onto things | Swimmers go into the pond. Perchers sit up in trees and on the bird house. Fliers hover over flowers. What is visited rustles. |
| Each other | Animals walk up to greet each other and play chase. |
| Day and night | After 6:30 pm day animals sleep where they are. Owls, foxes, raccoons, hedgehogs and fennecs stay up. The campfire and the lantern glow. |
| Treats | Every finished session earns one, and one more per 15 min. You start with three. |
| Feeding | An animal is full for 6 hours after eating, then peckish, and hungry after 20. Feed one, or everyone who will eat. |
| Petting | Any time. It counts toward the bond once an hour. |
| Bond | Five levels. Each new level pays coins. Feeding a hungry animal bonds a little more. |
| Names | Any animal can be named. |
| No punishment | A hungry animal is slow, stays close and asks for food. It never leaves, sickens or dies. |
| Arranging | Drag anything to any point on the land, put it in storage, or let it go. |

### Growing

| Feature | Notes |
| --- | --- |
| 27 plants and 27 animals | Original drawings. Four growth stages during a session. Three sizes by session length. |
| 10 nature items | Tall grass, tree stump, boulder, mossy log, burrow, bird house, beehive, stone lantern, campfire, pond. Each needs a session of 10 to 60 min or more. |
| Coins | 2 a minute, more for longer sessions, streaks and friends. |
| Unlocks | Coins, goals (for example a 120 min session for the bonsai) or free in season. Nothing costs money. |
| Levels and land | Level from total focused time. The land grows from room for 25 things to room for 100. |
| Grows where planted | What a session makes appears at its spot from the first minute and stays there. |
| 29 achievements | Each pays coins. |

### Friends

| Feature | Notes |
| --- | --- |
| Profile | Name and username. No email or password. |
| Adding friends | By friend code, exact username or invite link. Requests, accept, decline, cancel, remove, block. |
| Live presence | Online, focusing and time left, today's minutes. Arrives over a live connection. |
| Cheer and nudge | Delivered at once, or when the friend is next online. |
| Gifts | Send a plant, animal or nature item you have unlocked. It arrives in their haven. |
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
| More species, seasonal trees | 64 things to grow and build, four of them seasonal, all free. |
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
- **Animals in a friend's haven do not walk about.** A visit shows where things stand; they breathe and blink there, nothing more.
- **Animals do not interact with the session being grown**, and they do not breed, age or have different foods. There is one kind of treat.
- **With reduced motion switched on in the phone's settings, animals stay still.** Care still works.
- **Widgets, watch apps, and scheduled blocking.**
- **Push notifications from the server.** A cheer reaches a closed app only when it is next opened. Session-end and reminder notifications are scheduled on the phone and do work while the app is closed, in the iOS and Android apps.
- **Sounds while the phone is locked.**
- **App Store and Play Store listings.** The apps are installed from the release page.
- **Languages other than English.**

## Limits to know

- The friends server is one Durable Object. It suits a circle of friends up to a few thousand people. See ARCHITECTURE.md.
- Coins, treats, bonds and the haven live on your device. The server checks session times for the board, not coins.
- Where an animal is wandering is not saved. On opening the app each starts from where it was last put down.
- A profile can only be reached from a device that is signed in. If every signed-in device is lost, so is access to the profile.
