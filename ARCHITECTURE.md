# Haven: how it is built

## The parts

```
        ┌────────────────────────── one web app (src/ → dist/) ──────────────────────────┐
        │  core.js   rules: time, coins, levels, streaks, goals, summaries (no DOM)      │
        │  store.js  everything kept on the device, and every change to it               │
        │  timer.js  runs a session: clock, leaving and returning, breaks, rooms         │
        │  world.js  the animals' lives: wandering, visiting, greeting, sleeping         │
        │  social.js profile, calls to the friends server, the live connection           │
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

- **State** is one JSON document in `localStorage` (`haven-state`). `store.js` validates it on load (`migrate`), so damaged or old data falls back to safe values instead of breaking the app. The profile token is kept under a separate key and is never part of a backup.
- **Time** is never counted by ticking. A session stores when it started; what is left is worked out from the clock each time. Reloading, a paused web view, or a phone that slept all give the right answer.
- **Leaving.** When the page is hidden the moment is stored. A browser keeps running in the background, so `timer.js` fails the session as soon as the allowance runs out. The apps are paused in the background, so they are judged on return, and the native side says whether the phone was only locked (`device.lastAway`). If Haven is closed without warning, a heartbeat saved every 10 s stands in for the moment it left.
- **The land.** Everything standing in the haven has a point `(u, v)`, each from 0 to the land's side, not a tile. `scene.js` projects points to the picture and back (`project`, `unproject`), which is what makes dragging and free roaming possible. Havens saved as tiles by version 1.0 are converted on load.
- **The animals.** `world.js` is a small simulation with no DOM. Each animal is in one state (idle, walk, enjoy, greet, chase, sleep) and, when it has nothing to do, picks what to do next from its traits: how it moves, how fast, what it likes, whether it swims, perches or is awake at night. It takes its random numbers from outside and is advanced by `step(dt)`, so tests run minutes of haven life in milliseconds with a fixed seed. `views/haven.js` steps it once a frame and moves the elements; nothing is redrawn. It stops when the screen is hidden or reduced motion is on.
- **Care** is plain data on each animal (`fed`, `pet`, `bond`, `name`) with the rules in `core.js` (`hungerOf`, `bondLevel`, `moodOf`). Hunger is worked out from the clock, like sessions, so nothing needs to run while the app is closed.
- **Drawing.** `art.js` returns SVG text for each species, built from a small set of shape helpers, so there are no image files. `scene.js` lays sprites on the land, back to front. Screens are template strings set as `innerHTML`, with every value escaped through `e()`. Clicks are routed by `data-action`.
- **Offline.** `public/sw.js` keeps the app's own files. Sessions finished offline are sent to the server later.

## The friends server

`worker/hub.js` holds the rules and knows nothing about Cloudflare; `worker/worker.js` is the plumbing. All data lives in **one Durable Object** with SQLite storage, which also holds every live WebSocket (using hibernation, so idle connections cost nothing).

Why one object: every friend request, presence change and room touches several people at once. One single-threaded object with one database makes each of those a plain transaction with nothing to reconcile, and lets a change be pushed straight to the sockets of the people it affects. It needs no database to create by hand: `wrangler deploy` makes it from `wrangler.toml`.

- **Identity.** Registering returns a random 48-character token. The server stores only its SHA-256 hash. Every call sends the token as a bearer header. There are no cookies, so any origin may call the API (`Access-Control-Allow-Origin: *`) without cross-site risk.
- **Live connection.** The app asks for a one-time ticket (30 s) over HTTPS, then opens `wss://…/api/live?ticket=…`. The long-lived token never appears in a URL. The server pushes small messages (`presence`, `request`, `accepted`, `inbox`, `room`, `feed`, `friends`); everything the app sends goes over HTTPS. If the socket drops, the app reconnects with backoff and refetches.
- **Sessions.** The server stamps the start with its own clock and only accepts "finished" once the planned time has passed (30 s tolerance). Sessions done offline can be added for 7 days if they do not overlap others. This keeps the board honest among friends; it is not anti-cheat for strangers.
- **Rooms.** The host's start sets one start time 5 s ahead on the server's clock. Each app shifts it by its measured clock offset, so everyone counts down together. In a "together" room, one person leaving marks every session in it failed and pushes that to the others.
- **Limits.** Each sensitive route is rate-limited per person or per network address (five new profiles an hour per address, one cheer a minute per friend, and so on). Inputs are validated and sized. Old rows are cleaned hourly.
- **Test clock.** When the `TEST_CLOCK` binding is set (only by the test harness), requests may carry a time. `wrangler.toml` never sets it, and a test checks a server without it ignores the header.

### Routes

`POST /api/register`, `POST /api/link/claim` (no token). With a token: `GET /api/me`, `POST /api/profile`, `GET /api/find`, `POST /api/friends/{request,respond,cancel,remove,block,unblock}`, `GET /api/blocks`, `GET /api/friends/:id`, `GET /api/board`, `GET /api/feed`, `POST /api/session/{start,end,log}`, `POST /api/cheer`, `POST /api/gift`, `POST /api/inbox/ack`, `POST /api/rooms`, `POST /api/rooms/{join,leave,invite,start,species}`, `GET /api/rooms/:code`, `POST /api/link`, `PUT|GET /api/state`, `POST /api/logout`, `POST /api/account/delete`, `POST /api/live/ticket`, `GET /api/live` (WebSocket), `GET /health`.

### Known limits

- One object handles requests one at a time and has a storage cap (see Cloudflare's current limits for the free plan). That is comfortable for thousands of people, not for millions. The step after that is one object per person plus one per room; `hub.js` keeps storage behind a single `sql` function to make that move possible.
- The object lives in one region (hinted to Asia-Pacific on first use). People far away see more delay.
- There is no server push to a closed app.

## The phone apps

Both show the bundled `dist/` from a private origin (`haven://app/` on iOS, `https://appassets.androidplatform.net/assets/` on Android) and expose one bridge (`havenDevice` / `HavenNative`) with these actions: `notifyPermission`, `schedule`, `notify`, `cancel`, `reminder`, `keepAwake`, `haptic`, `share`, `away`.

- **iOS** (`ios/`, generated by XcodeGen): `AwayTracker` notes each move to the background and whether a screen-lock notification arrived with it. Notifications use `UNUserNotificationCenter`.
- **Android** (`android/`): `onStop` records whether the screen was off or the keyguard up. `Notifier` posts alarms as notifications and restores the daily reminder after a restart.

## Finding the server

`HAVEN_API_URL` is built into the app when known. If it is not, the app asks `https://shira421.github.io/haven/config.json`, which the Pages build writes. So a phone app built before the server existed starts using it without a new build. Settings has a field to point at another server.

## Build and release

| Workflow | When | What |
| --- | --- | --- |
| `ci.yml` | pull requests | tests, browser test, Android build |
| `pages.yml` | push to `main` | server tests, deploy the Worker (if secrets), build, deploy Pages |
| `release.yml` | push to `main` | tests, browser test, Android APK, iOS IPA and simulator smoke test, publish `latest-build` and `v<version>` |
