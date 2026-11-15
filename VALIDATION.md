# Haven: what has been checked

Last updated 15 November 2026, version 1.3.0.

## Checked by tests that run on every push

| Area | How | Count |
| --- | --- | --- |
| Rules: coins, treats, sizes, levels, land, local days, streaks, progress, leaving, periods, summaries, goals, achievements, hunger, mood, bond, when to send the streak and hunger reminders | `tests/core.test.mjs` | 15 |
| Storage: sessions, unlocking, placing anywhere, growing where planted, a full land, nature's minimum length, feeding, petting, naming, gifts, tags, settings limits, damaged data, havens saved as tiles, failed saves, merging two devices, the public card, shibas becoming dogs, new settings limits | `tests/store.test.mjs` | 24 |
| Keeping devices in step: a three-way merge keeps moves, releases, purchases and new sessions from either side and pays a shared achievement once; two devices against a stand-in server converge, including after changes made at the same time | `tests/sync.test.mjs` | 3 |
| Catalogue: unique ids and names, prices, seasons, every species and every dog breed has art, old ids still work | `tests/catalog.test.mjs` | 5 |
| The animal simulation, with a fixed seed: every animal has traits, roaming the whole land without leaving it, greeting, visiting what they like (swimming in the pond, down the burrow), flying, walking short trips and perching, sleeping at night while night animals carry on, hungry animals being slow, following the haven as it changes, a crowd of all 27, hops that rise, tip and land, walkers easing in and out and going round a boulder and the pond, the right action in the right place (swim, drink, graze, sit, perch), coming when called, eating when fed and jumping when petted, and in a sanctuary of three plots, crossing between havens without stepping off the land | `tests/world.test.mjs` | 13 |
| Session controller: finishing, cancelling, leaving in a browser and in the apps, restart, pomodoro, rooms | `tests/timer.test.mjs` | 10 |
| Friends server, on the real Workers runtime (workerd, through Miniflare) with real WebSockets: every route, live pushes, limits, rooms under both rules, linking, backup, deletion, CORS, the test clock being off when deployed, saves refused when based on an old copy, news for a closed app, sanctuaries and their limits | `tests/hub.test.mjs` | 24 |
| The app in headless Chrome at phone size, two people against the local friends server: a full session growing where it was planted, dragging it across the land, an animal moving in and roaming, feeding, petting and naming it, unlocking plants and nature, deep focus, profiles, a live friend request, live presence and a cheer, a room started together, the board and feed, visiting and a gift, a failed "together" room, the journal, settings, a second device, reload, 360 px and 1280 px widths, no console errors, the tab bar evenly divided, chart bars standing on their line, two devices staying in step live, and a sanctuary: making it, the loading screen, inviting a friend who joins, one land of two havens with animals moving, every Friends section at 320 px | `tests/browser.mjs` | 22 |
| The animals' moving parts, measured on screen in Chrome and in WebKit: standing in one piece, the head dipping about its pivot, lying down with eyes shut, rising off the ground while the shadow stays, legs swinging from the hip, wings spreading and beating, legs striding, sitting low in water | `tests/rig.mjs` | 7 each |

The Worker also passes `wrangler deploy --dry-run` (config accepted, bundle 55 KiB).

## Checked by the first build of 1.0.0 on GitHub (14 November 2026, commit fe31a96)

- All tests above pass on GitHub's runners.
- The Android APK compiles (`gradle :app:assembleDebug`).
- The iOS app compiles for iPhone and for the simulator. In the simulator it starts, loads the bundled web app from `haven://app/`, the device bridge is present, and no script error is logged.
- The downloads were published to the `latest-build` and `v1.0.0` releases.
- After the Cloudflare secrets were added, the friends server was deployed and answered at its `workers.dev` address, and the website was deployed to GitHub Pages.

## Checked by eye

For 1.2.0: all 27 animals standing, and each in its poses (walk, run, eat, rest, sleep, swim, fly, mid-hop) on sheets drawn with the app's stylesheet; havens by day and night with a pond, burrow, oak, flowers and fire in desktop Chrome.

Every plant, animal and nature item at full size and through its growth stages. A haven of 22 things over several seconds by day and at night, the care screens and arranging. Each screen in light and dark at 390 by 844, the Focus screen through a session from sunrise to sunset and at night, a full haven, and the wide layout. Screenshots in `docs/media` come from the browser test.

For 1.3.0, a sweep of every screen and dialog at 320, 390, 768 and 1280 px in light and dark, with long names, a full sanctuary of nine havens, a new person with nothing grown, the phone apps' settings, and a sanctuary that loads slowly or fails, checked by eye and for anything running off the screen. Also the new animals (giraffe, elephant), the seven dog breeds and the two new plants on a sheet; a haven holding all of them, including a shiba saved by 1.2; the breed picker; the notification settings; the sanctuary list, its loading screen and a sanctuary of two havens in light and dark.

## The phone apps

1.1.0 and 1.2.0 changed only the web app inside the apps. 1.3.0 changes native code: the come-back notification is withdrawn when the phone locks, and both apps check for friends' news in the background (Android `Inbox`, iOS `NewsChecker` with a background refresh task). Each pull request builds the Android APK and builds and starts the iOS app in a simulator; the result is on the pull request's checks.

## Not yet verified

These were written with care but have not been run where they will live. Treat them as unproven until someone has tried them on a phone.

- **Native behaviour on real phones:** notifications at the end of a session, the daily reminder, keeping the screen on, haptics, the share sheet, and above all telling a locked phone from a switched app. iOS lock detection relies on a system notification that is not a documented API; if it does not arrive, locking the phone will count as leaving in deep focus. Test this first on an iPhone.
- **The Android app has not been started**, on a phone or an emulator. It compiles; nothing more is known.
- **Friends on the deployed server.** The deploy check confirms the server answers and asks for sign-in. Nobody has yet made two profiles on the live server and added each other; the same flow passes against the same code locally.
- **Safari.** The browser test uses Chrome. Safari on iPhone has not been tried, including Add to Home Screen and sound.
- **The moving parts on a real iPhone.** The poses rely on CSS transforms of SVG parts. `tests/rig.mjs` measures them in Chrome and, on GitHub, in WebKit on Linux, which is the same engine as the iOS app but not the same build.
- **How the living haven runs on a real phone.** Frame rate with a full land of 100 things, battery use with the app left open, and dragging with a finger have only been tried in desktop Chrome with touch emulation.
- **Background news checks.** Android's job and iOS's background refresh compile, but neither has run on a phone. iOS decides when a refresh runs, and may run it rarely or not at all for an app that is seldom opened.
- **The come-back notification on a real phone**, and in particular that it is not sent when the phone only locked.
- **A large sanctuary on a phone.** Nine havens of 100 things each have not been tried; frame rate is unknown.
- **The new server tables on the deployed server.** They are created on its first start after the deploy, as they are in the tests.
- **Load.** Nothing has been measured beyond a handful of connections.
- **Accessibility against a standard.** Controls are real buttons with labels, focus is visible, state is said in words, and reduced motion is respected, but no audit has been run.
