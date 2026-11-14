# Haven: what has been checked

Last updated 14 November 2026, version 1.0.0.

## Checked by tests that run on every push

| Area | How | Count |
| --- | --- | --- |
| Rules: coins, sizes, levels, land, local days, streaks, progress, leaving, periods, summaries, goals, achievements | `tests/core.test.mjs` | 13 |
| Storage: sessions, unlocking, placing, gifts, tags, settings limits, damaged data, failed saves, merging two devices, the public card | `tests/store.test.mjs` | 18 |
| Catalogue: unique ids and names, prices, seasons, every species has art | `tests/catalog.test.mjs` | 4 |
| Session controller: finishing, cancelling, leaving in a browser and in the apps, restart, pomodoro, rooms | `tests/timer.test.mjs` | 10 |
| Friends server, on the real Workers runtime (workerd, through Miniflare) with real WebSockets: every route, live pushes, limits, rooms under both rules, linking, backup, deletion, CORS, the test clock being off when deployed | `tests/hub.test.mjs` | 22 |
| The app in headless Chrome at phone size, two people against the local friends server: a full session, arranging, unlocking, deep focus, profiles, a live friend request, live presence and a cheer, a room started together, the board and feed, visiting and a gift, a failed "together" room, the journal, settings, a second device, reload, 360 px and 1280 px widths, no console errors | `tests/browser.mjs` | 18 |

The Worker also passes `wrangler deploy --dry-run` (config accepted, bundle 55 KiB).

## Checked by the first build on GitHub (14 November 2026, commit fe31a96)

- All tests above pass on GitHub's runners.
- The Android APK compiles (`gradle :app:assembleDebug`).
- The iOS app compiles for iPhone and for the simulator. In the simulator it starts, loads the bundled web app from `haven://app/`, the device bridge is present, and no script error is logged.
- The downloads were published to the `latest-build` and `v1.0.0` releases.

## Checked by eye

Every plant and animal at full size and through its growth stages. Each screen in light and dark at 390 by 844, the Focus screen through a session from sunrise to sunset and at night, a full haven, and the wide layout. Screenshots in `docs/media` come from the browser test.

## Not yet verified

These were written with care but have not been run where they will live. Treat them as unproven until someone has tried them on a phone.

- **Native behaviour on real phones:** notifications at the end of a session, the daily reminder, keeping the screen on, haptics, the share sheet, and above all telling a locked phone from a switched app. iOS lock detection relies on a system notification that is not a documented API; if it does not arrive, locking the phone will count as leaving in deep focus. Test this first on an iPhone.
- **The Android app has not been started**, on a phone or an emulator. It compiles; nothing more is known.
- **The deployed server and the website.** The server is tested on Cloudflare's own runtime locally, not on Cloudflare's network. The first `pages.yml` run failed at the Pages step because Pages was not yet switched on, and skipped the server because the Cloudflare secrets were not set. Both are one-time settings (see README).
- **Safari.** The browser test uses Chrome. Safari on iPhone has not been tried, including Add to Home Screen and sound.
- **Load.** Nothing has been measured beyond a handful of connections.
- **Accessibility against a standard.** Controls are real buttons with labels, focus is visible, state is said in words, and reduced motion is respected, but no audit has been run.
