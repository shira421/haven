# Haven: how it is built

## The parts

```
        ┌────────────────────────── one web app (src/ → dist/) ──────────────────────────┐
        │  core.js   rules: time, coins, levels, streaks, goals, summaries (no DOM)      │
        │  store.js  everything kept on the device, and every change to it               │
        │  timer.js  runs a session: clock, leaving and returning, breaks, campfires        │
        │  world.js  the animals' lives: moving, visiting, greeting, sleeping            │
        │  creatures.js  each animal drawn in parts that move    shapes.js  SVG helpers  │
        │  social.js account, calls to the server, the live connection                   │
        │  art.js    plants, animals, nature as SVG     scene.js  sky and land           │
        │  views/    one file per screen                ui.js     shared pieces          │
        │  device.js what the phone does (native bridge, or web APIs)                    │
        └──────────────┬───────────────────────┬──────────────────────┬──────────────────┘
                       │                       │                      │
              browser / installed       iOS app (ios/)        Android app (android/)
              from the browser          WKWebView             WebView
                       │                       │                      │
                       └───────── HTTPS + WebSocket ──────────────────┘
                                           │
                           friends server (worker/): a Cloudflare Worker
                           and one Durable Object with SQLite inside
```

The same `dist/` folder is served by GitHub Pages and packed into both phone apps, so a fix lands everywhere at once.

## On the device

- **State** is one JSON document in `localStorage` (`haven-state`). `store.js` validates it on load (`migrate`), so damaged or old data falls back to safe values instead of breaking the app. The account's token is kept under a separate key and is never part of a backup.
- **Time** is never counted by ticking. A session stores when it started; what is left is worked out from the clock each time. Reloading, a paused web view, or a phone that slept all give the right answer.
- **Leaving.** When the page is hidden the moment is stored. Android's web view is never told the app left the screen, so both apps also tell the page themselves (`__havenLifecycle`, with the time it happened; a late report is ignored). In a phone's browser, which cannot tell a locked screen from another app, `leave.js` notes how the page was left (a cancelled touch or a finger still down means a swipe out; nothing means the power button) and on return compares the wall clock with `performance.now()`, which stops while the phone sleeps. Only time awake and away after a swipe counts, or awake time well beyond what a locked phone uses; Idle Detection, where allowed, overrides both; doubt is a lock (`Timer.lockFree`, `leave.judge`). Such a session is not finished or failed until it is back in front. A browser keeps running in the background, so `timer.js` fails the session as soon as the allowance runs out. The apps are paused in the background, so they are judged on return, and the native side says whether the phone was only locked (`device.lastAway`). If Haven is closed without warning, a heartbeat saved every 10 s stands in for the moment it left.
- **The land.** Everything standing in the haven has a point `(u, v)`, each from 0 to the land's side, not a tile. `scene.js` projects points to the picture and back (`project`, `unproject`), which is what makes dragging and free roaming possible. Havens saved as tiles by version 1.0 are converted on load.
- **The animals.** `world.js` is a small simulation with no DOM. Each animal is in one state (idle, walk, enjoy, greet, chase, sleep) and, when it has nothing to do, picks what to do next from its traits: how it moves, how fast, what it likes, whether it swims, perches, grazes or is awake at night. Movement has weight: walkers have a velocity that eases toward where they are going and is pushed aside by solid things and water; hoppers move in arcs with a rest between; birds choose between walking and flying by distance. Each step it reports what the picture needs: an action (`act`: walk, run, hop, fly, swim, eat, drink, sit, hide, perch, sleep), a height (`lift`), a tip (`tilt`), and one-off events (splash, land, leaves, rustle). It takes its random numbers from outside and is advanced by `step(dt)`, so tests run minutes of haven life in milliseconds with a fixed seed.
- **Drawing the animals.** `creatures.js` draws each animal from the side as a shadow plus a rig of named parts (legs, head, ears, eyes, tail, wings), each carrying its own pivot. `views/haven.js` steps the simulation once a frame and writes only a position, `data-act`, `--lift` and `--tilt` to each animal's element. The stylesheet does the rest: gaits, wing beats, poses, sinking into water, and the shadow shrinking as the animal rises. Nothing is redrawn, and it all stops when the screen is hidden or reduced motion is on.
- **Care** is plain data on each animal (`fed`, `pet`, `bond`, `name`) with the rules in `core.js` (`hungerOf`, `bondLevel`, `moodOf`). Hunger is worked out from the clock, like sessions, so nothing needs to run while the app is closed.
- **Drawing.** `art.js` returns SVG text for each species, built from a small set of shape helpers, so there are no image files. `scene.js` lays sprites on the land, back to front. Screens are template strings set as `innerHTML`, with every value escaped through `e()`. Clicks are routed by `data-action`.
- **Offline.** `public/sw.js` keeps the app's own files. Sessions finished offline are sent to the server later.
- **One haven on several devices.** `sync.js` keeps every device of a profile in step. The server holds one copy of the haven with a revision number. Each device remembers the last copy it agreed on (the base, under `haven-sync`). On opening, on coming back to the front, a few seconds after any change, and whenever the server says another device saved, the device fetches the server's copy and, if it is newer, joins it with its own in a three-way merge against the base: whatever either side changed since the base wins, so a move, a release, a purchase or a deleted session on one device is not undone by the other. Counters (coins, treats, feeds) add both sides' changes; an achievement, a level or a bond level reached on both is paid once. The device then saves the result with the revision it was based on; if another device saved first, the server refuses (409) and the device joins again. A running session stays with the device it runs on.
- **Which versions may save.** `PUT /api/state` carries the app's version (`app`) and refuses versions before 1.5.1 (`SAVES_FROM`) with 426: before then, a new device signing in could save its empty coin count over the account's, and every other device took it as a change. Older versions can still read the haven. Joining two copies of the same haven with no shared base keeps the higher coins and treats, since the newer copy may only be an old phone opened today.
- **Notifications.** `notices.js` schedules the streak and hunger reminders from the state each time it changes, and tells the phone which server to check for news. `timer.js` schedules the come-back notification when Haven goes to the background during a session, and a `lost` notification for the moment the allowance runs out; the native side withdraws both if the phone locked. A finished session (`session`, `break`) and a lost one (`lost`, `lost-*`) have their own sounds: `chime.wav` and `wilt.wav`, made by `scripts/sounds.mjs` from the notes `sound.js` plays.
- **Sanctuaries.** `scene.js` lays members' havens out as plots on a near-square grid (`sanctuaryLayout`) and draws them as one land (`sanctuaryHTML`). `world.js` takes a land made of plots: animals are kept off the outer edges only, so they walk from one plot into the next. `views/sanctuary.js` fetches, lays out and warms up the simulation behind a loading screen, then runs it with the same painter as the home screen.
- **Breeds.** What an item is drawn as is its species, or species and breed (`dog:corgi`, see `artOf`). Old ids are mapped (`RENAMED`: a `shiba` is a `dog` of the shiba breed).

## The server

`worker/hub.js` holds the rules and knows nothing about Cloudflare; `worker/worker.js` is the plumbing. All data lives in **one Durable Object** with SQLite storage, which also holds every live WebSocket (using hibernation, so idle connections cost nothing).

Why one object: every friend request, presence change and room touches several people at once. One single-threaded object with one database makes each of those a plain transaction with nothing to reconcile, and lets a change be pushed straight to the sockets of the people it affects. It needs no database to create by hand: `wrangler deploy` makes it from `wrangler.toml`.

- **Accounts.** An account is a row in `users` with a unique username. Its password is stored as `pbkdf2$100000$<salt>$<hash>` (PBKDF2-SHA-256, a 16-byte salt per password, 100,000 rounds, the most the Workers runtime allows) and compared in constant time. Hashing happens before the transaction and wrong tries are counted outside it, so a failed sign-in still counts: ten tries per account from one network address in 15 minutes, fifty from everywhere in an hour, forty per address in an hour. Registering, signing in (`POST /api/login`) and finishing a Google sign-in each return a random 48-character token for that device (at most 20 per account). The server stores only its SHA-256 hash. Changing the password deletes every other device's token. An account made before 1.4 has no password; `GET /api/me` says so (`hasPassword: false`) and the app will not go on until `POST /api/password` has set one.
- **Google.** With the secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set, `GET /auth/google/start?return=…` sends the browser to Google and `/auth/google/callback` exchanges the code with Google server-to-server, reads the person's Google id from the ID token, and redirects back with a one-time code (10 minutes) in the address: `#google=…` for a web page listed in `HAVEN_SITE`, `haven://auth?google=…` for the apps. `POST /api/google/claim` turns that code into a token, or says a username must be chosen first. Nothing else is ever returned to: the return address is checked against the list before anything is issued. The Android app opens the phone's browser and receives `haven://auth` as an intent; the iOS app uses `ASWebAuthenticationSession`. `POST /api/google/link` gives a signed-in account a one-time code to connect Google the same way.
- **Tokens.** Every call sends the token as a bearer header. There are no cookies, so any origin may call the API (`Access-Control-Allow-Origin: *`) without cross-site risk.
- **Live connection.** The app asks for a one-time ticket (30 s) over HTTPS, then opens `wss://…/api/live?ticket=…`. The long-lived token never appears in a URL. The server pushes small messages (`presence`, `request`, `accepted`, `inbox`, `room`, `feed`, `friends`, `state`, `sanctuary`, `haven`); everything the app sends goes over HTTPS. If the socket drops, the app reconnects with backoff and refetches.
- **Sessions.** The server stamps the start with its own clock and only accepts "finished" once the planned time has passed (30 s tolerance). Sessions done offline can be added for 7 days if they do not overlap others. This keeps the board honest among friends; it is not anti-cheat for strangers.
- **Campfires** (the `rooms` table). The host's start sets one start time 5 s ahead on the server's clock. Each app shifts it by its measured clock offset, so everyone counts down together. At a "together" campfire, one person leaving marks every session in it failed, pushes that to the others and leaves each a `fire-out` inbox item, so a phone with Haven closed hears it through its background check; `POST /api/session/end` says `strict: true` for a finished one, which pays 1.2× coins (`STRICT_RATE`). A campfire that is over stays each member's (`currentRoom` returns `done` and `failed` rooms too) until they leave it, which sets `members.gone`; lighting or joining another does the same.
- **Limits.** Each sensitive route is rate-limited per person or per network address (five new accounts an hour per address, one cheer a minute per friend, and so on). Inputs are validated and sized. Old rows are cleaned hourly.
- **Sanctuaries.** Two tables, `sanctuaries` and `keepers`. Only members can read a sanctuary, and reading it returns each member's public card (the same layout friends see on a visit). Joining is by code or by accepting an invitation from a friend. A change to a member's card is pushed to everyone who shares a sanctuary with them.
- **The great tree, care and pals.** The tree is the sanctuary's focused minutes since Monday 00:00 UTC (`weekStart`), against 120 min per haven (at least 240); the first time it blooms in a week is kept in `blooms` and everyone is told. `POST /api/sanctuaries/care` sends a treat or pat note to an animal's owner (pats at most one per 30 min per pair), and `POST /api/sanctuaries/pal` records two animals from different havens that met (`pals`, keyed `owner:item:species`). A campfire lit for a sanctuary carries its id (`rooms.sid`) and shows on the sanctuary for every member to join. Inbox items reach every device of a person, so each effect is safe to apply twice: a friend's treat only sets when the animal last ate.
- **Reports.** `POST /api/report` keeps who reported whom, why and where, for whoever runs the server; kept a year.
- **Shared haven.** `PUT /api/state` takes the revision the device last saw (`base`) and refuses an older one with 409; each save is pushed to the person's other open devices as `state`. A save without `base` (an older app) is accepted.
- **News.** `GET /api/news?since=` returns friend requests and inbox items since a time, small enough for a phone to check in the background.
- **Test clock.** When the `TEST_CLOCK` binding is set (only by the test harness), requests may carry a time. `wrangler.toml` never sets it, and a test checks a server without it ignores the header.

### Routes

`POST /api/register`, `POST /api/login`, `POST /api/google/claim`, `GET /auth/google/{start,callback}` (no token). With a token: `GET /api/me`, `POST /api/profile`, `GET /api/find`, `POST /api/friends/{request,respond,cancel,remove,block,unblock}`, `GET /api/blocks`, `GET /api/friends/:id`, `GET /api/board`, `GET /api/feed`, `POST /api/session/{start,end,log}`, `POST /api/cheer`, `POST /api/gift`, `POST /api/inbox/ack`, `POST /api/rooms`, `POST /api/rooms/{join,leave,invite,start,species}`, `GET /api/rooms/:code`, `POST /api/password`, `POST /api/google/{link,unlink}`, `PUT|GET /api/state`, `GET /api/news`, `GET /api/sanctuaries`, `GET /api/sanctuaries/:id`, `POST /api/sanctuaries`, `POST /api/sanctuaries/{join,invite,leave,edit}`, `POST /api/logout`, `POST /api/account/delete`, `POST /api/live/ticket`, `GET /api/live` (WebSocket), `GET /health`.

### Known limits

- One object handles requests one at a time and has a storage cap (see Cloudflare's current limits for the free plan). That is comfortable for thousands of people, not for millions. The step after that is one object per person plus one per room; `hub.js` keeps storage behind a single `sql` function to make that move possible.
- The object lives in one region (hinted to Asia-Pacific on first use). People far away see more delay.
- There is no server push to a closed app. The apps check `GET /api/news` in the background instead.
- Columns added after the first release are added on start (`ADDED_COLUMNS`); adding one twice fails harmlessly.

## The phone apps

Both show the bundled `dist/` from a private origin (`haven://app/` on iOS, `https://appassets.androidplatform.net/assets/` on Android) and expose one bridge (`havenDevice` / `HavenNative`) with these actions: `notifyPermission`, `schedule`, `notify`, `cancel`, `reminder`, `keepAwake`, `haptic`, `share`, `away`, `account`, `openSettings`, `lastCrash`.

- **iOS** (`ios/`, generated by XcodeGen): `AwayTracker` notes each move to the background and whether a screen-lock notification arrived with it, and withdraws a pending come-back notification when the phone locks. Notifications use `UNUserNotificationCenter`. `NewsChecker` registers a background refresh task (`com.shira421.haven.news`) that checks `GET /api/news`; the sign-in token for it is kept in the Keychain.
- **Android** (`android/`): `onStop` records whether the screen was off or the keyguard up, and cancels the come-back notification if so. `Notifier` posts alarms as notifications and restores the daily reminder after a restart. It has three channels: reminders and friends (default sound), session finished (`chime`) and session lost (`wilt`). When a `lost` alarm fires for a session the server knows, it posts `POST /api/session/end` as failed at once, so a strict campfire goes out for the others then rather than when Haven is opened again. Alarms are exact (`USE_EXACT_ALARM`), so a come-back warning 10 s away is not held back by Android. If the page's process is stopped, `onRenderProcessGone` reloads it rather than letting the app close, and an uncaught exception is kept to report on the next start. `Inbox` is a `JobService` run about every 15 minutes with a connection, which checks `GET /api/news` while Haven is not on screen.

## Finding the server

`HAVEN_API_URL` is built into the app when known. If it is not, the app asks `https://shira421.github.io/haven/config.json`, which the Pages build writes. So a phone app built before the server existed starts using it without a new build. Settings has a field to point at another server.

## Build and release

| Workflow | When | What |
| --- | --- | --- |
| `ci.yml` | pull requests | tests, browser test, Android build |
| `pages.yml` | push to `main` | server tests, deploy the Worker (if secrets), build, deploy Pages |
| `release.yml` | push to `main` | tests, browser test, Android APK, iOS IPA and simulator smoke test, publish `latest-build` and `v<version>` |
