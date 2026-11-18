# Putting Haven on Google Play

A checklist, in order. Parts 1 and 2 are done once on GitHub. Parts 3 to 7 are in Play Console. Part 8 is every release after that.

What is already done in the code for 1.5.0:

- The app targets Android 16 (API 36), which Google Play requires for new apps and updates since 31 August 2026.
- Release builds are signed with your upload key and come out as an Android App Bundle (`.aab`), the format Play needs.
- The version code comes from `package.json` (1.5.0 is 10500), so it always goes up when the version does.
- The page can reach the phone only from Haven's own files. Nothing is backed up off the phone. Logs are off in release builds. The release build is checked as not debuggable in CI.
- A [privacy policy](https://shira421.github.io/haven/privacy.html) and an [account deletion page](https://shira421.github.io/haven/delete-account.html) are on the website. Settings links to the policy, and accounts can be deleted in the app.
- Store graphics and phone screenshots are in [`docs/play`](docs/play).

## 1. The upload key

Play signs the app for phones with a key Google keeps (Play App Signing). You sign each upload with your own **upload key**. If you already made `haven.keystore` for the GitHub downloads, use it as the upload key and skip to part 2.

Otherwise, make one on your computer (Java's `keytool`, which comes with Android Studio or any JDK):

```sh
keytool -genkeypair -keystore haven.keystore -alias haven -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 haven.keystore > haven.keystore.b64   # on a Mac: base64 -i haven.keystore -o haven.keystore.b64
```

Keep `haven.keystore` and its password in a password manager. Never commit it (`.gitignore` already skips `*.keystore`, `*.jks` and `*.aab`). If the upload key is lost, Google can reset it, but it takes a few days.

A phone that has the APK from GitHub has a different signature from the Play app. To move to the Play version, uninstall the GitHub one first. The haven comes back when you sign in.

## 2. GitHub settings

All under the repository's **Settings**.

**Secrets and variables, then Actions.** Repository secrets:

| Secret | What it is |
| --- | --- |
| `ANDROID_KEYSTORE_B64` | The contents of `haven.keystore.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Already set for the server |
| `PLAY_SERVICE_ACCOUNT_JSON` | Optional, for uploading from GitHub (part 8) |

Under **Variables**, add `HAVEN_API_URL` with the server's address, for example `https://haven-hub.<your subdomain>.workers.dev`. The builds find it on their own without this, but the variable makes it certain.

**Environments.** Make one named `google-play`. Tick **Required reviewers** and add yourself, and under **Deployment branches** choose **Selected branches** with `main`. The upload workflow then waits for you to approve it every time.

**Rules, then Rulesets** (or **Branches** for the older branch protection). For `main`:

- Require a pull request before merging.
- Require these status checks to pass: `test`, `android`, `ios`, `android-emulator (34)`, `android-emulator (35)`, `android-emulator (36)`.
- Block force pushes and deletions.

**Actions, then General.** Under **Workflow permissions**, choose **Read repository contents and packages permissions**. The workflows that need more ask for it themselves.

**Code security** (called Advanced Security on some accounts). Turn on Dependabot alerts, Dependabot security updates, secret scanning and push protection. `.github/dependabot.yml` already asks for monthly update pull requests for npm, GitHub Actions and Gradle.

Then merge the 1.5.0 pull request. **Build apps** runs on `main` and leaves `Haven-Android.aab` as the `android-play-bundle` artifact of that run (Actions, then the run, then Artifacts).

## 3. Play Console account

1. Sign up at [play.google.com/console](https://play.google.com/console) (a one-time US$25 fee) and verify your identity.
2. A new personal account must run a **closed test with at least 12 testers for 14 days in a row** before it can publish to everyone. Line the testers up early: friends with Android phones, each with the Gmail address they use on Play.
3. Create the app: name **Haven**, default language English (United Kingdom or United States), **App**, **Free**. Accept the declarations.

## 4. App content (Policy, then App content)

| Section | Answer |
| --- | --- |
| Privacy policy | `https://shira421.github.io/haven/privacy.html` |
| App access | **All or some functionality is restricted**. Make a test account in the app (for example `play_review` with a long password) and give its username and password here, with: "Sign in with this username and password on the first screen." |
| Ads | No ads |
| Content rating | Fill in the questionnaire. Category: everything else (not a game). Violence, fear, sex, drugs, gambling: none. Users can interact: **yes** (friends, names, sanctuaries). Shares location: no. Digital purchases: no. |
| Target audience | 13 and over (13 to 15, 16 to 17, 18 and over). Not designed for children. |
| News app | No |
| Data safety | See below |
| Government app | No |
| Financial features | None |
| Health | None of these |
| Account deletion | Yes, accounts can be created. Deletion link: `https://shira421.github.io/haven/delete-account.html` |

### Data safety answers

- Does the app collect or share user data? **Yes**, collects. **No** data is shared (Cloudflare runs the server for you, which does not count as sharing).
- Is all data encrypted in transit? **Yes**.
- Can users ask for their data to be deleted? **Yes** (in the app and on the deletion page).

Data types collected, each **required**, **not processed only on the device**, purpose **App functionality** and **Account management**:

| Category | Type | What it is in Haven |
| --- | --- | --- |
| Personal info | Name | The display name |
| Personal info | User IDs | The username, and Google's id for the account when Google is used |
| App activity | App interactions | Sessions: when, how long, what grew |
| App activity | Other user-generated content | The haven's layout, sanctuary names, reports |
| App activity | Other actions | Friends, cheers, gifts and care between people |

Not collected: location, email address, contacts, photos, audio, files, calendar, health, financial info, web history, device IDs, crash logs (the crash note never leaves the phone), diagnostics.

## 5. Permissions declaration (Policy, then App content, then Exact alarms)

Haven uses `USE_EXACT_ALARM` so "your session is done" arrives on the dot. Play allows it for apps whose core function is a timer or alarm. In the declaration, choose **Timer** and write: "Haven is a focus timer. The exact alarm tells the person the moment their timed focus session or break ends, and reminds them to come back during a session."

If Play refuses it, delete the `USE_EXACT_ALARM` line in `android/app/src/main/AndroidManifest.xml` and release again. Notifications then come through Android's normal alarms, which can be a few minutes late.

## 6. Store listing (Grow users, then Store presence, then Main store listing)

- **App name:** Haven
- **Short description** (80 characters at most): `Focus timer where plants grow and animals move in. Focus with your friends.`
- **Full description:**

```text
Set a time and stay with it. A plant grows, an animal moves in, or a pond gets dug in your haven. Leave early and it is lost.

The animals have lives of their own. They wander, visit the things they like, greet each other, sleep at night and get hungry. Put a treat down and the hungriest one comes to eat it. Tap an animal to pat it. Tap one at night and it wakes up, yawns and goes back to sleep.

Focus with friends
- See who is focusing right now, and cheer them on.
- Light a campfire and start together. Finish together for more coins.
- Join your havens into a sanctuary. A great tree in the middle grows as everyone focuses through the week. Feed and pat each other's animals.

Everything else
- Timer, stopwatch and pomodoro, from 5 minutes to 3 hours.
- 29 plants, 29 animals, and nature like ponds, campfires and beehives.
- A journal with your days, weeks and streaks.
- Calm sounds that work offline.
- Light and dark.

Everything is unlocked by focusing. There is nothing to buy and no ads.
```

- **App icon:** `docs/play/icon-512.png`
- **Feature graphic:** `docs/play/feature-graphic.png` (1024 x 500)
- **Phone screenshots:** the seven 1080 x 1920 images in `docs/play`. A good order: `session`, `care`, `sanctuary`, `room` (the campfire), `friends`, `collection`, `journal`. To make them again: `npm run play-shots`.
- **Category:** Productivity. **Tags:** focus, timer.
- **Contact details:** an email address you read. It is shown publicly, and the privacy policy and deletion page point people to it.

## 7. Testing, then production

1. **Internal testing** (Testing, then Internal testing): create a release and upload `Haven-Android.aab` from part 2. The first upload is the one that sets up Play App Signing; accept Google's key. Add yourself as a tester, install from the link, and check sign-in, a session, notifications and a sanctuary.
2. **Closed testing**: create a track, add the 12 or more testers' emails (or a Google Group), upload the same bundle, and send them the opt-in link. They must stay opted in for 14 days.
3. **Production**: after the 14 days, Play Console offers **Apply for production access**. Answer its questions about the test, then create a production release from the tested bundle. Review usually takes a few days.

## 8. Every release after that

1. Raise `version` in `package.json` (1.5.0, then 1.5.1 or 1.6.0). The app's version code follows on its own. Also raise `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in `ios/project.yml`.
2. Merge to `main`. **Build apps** makes the signed bundle.
3. Upload it by hand in Play Console, or from GitHub:
   - Once: in Google Cloud, make a service account and a JSON key for it. In Play Console, **Users and permissions**, invite the service account's email with permission to release to testing tracks (and production if you want). Put the JSON in the `PLAY_SERVICE_ACCOUNT_JSON` secret.
   - Then: Actions, **Google Play**, **Run workflow**, pick the track. After you approve it in the `google-play` environment, it builds from `main` and uploads a **draft** release, which you check and roll out in Play Console.

## 9. Making the code private

The code side is done: `LICENSE` now says all rights reserved, `package.json` is marked private, the web bundle carries a copyright line and is minified with no source maps, Settings no longer links to the source, and the privacy policy no longer calls Haven open source. Anyone can still save the JavaScript their browser runs. That is true of every website, and the server's code stays private either way.

What changes on GitHub when the repository goes private, on the free plan:

| | Public (now) | Private on GitHub Free | Private on GitHub Pro (US$4 a month) |
| --- | --- | --- | --- |
| The website on GitHub Pages (web app, privacy policy, account deletion page) | Works | **Stops** | Works, still public |
| Branch protection and rulesets on `main` | Works | **Not enforced** | Works |
| Secret scanning and push protection | Free | **Not available** | Not available |
| Actions minutes | Unlimited | 2,000 a month | 3,000 a month |
| `latest-build` downloads and the AltStore source | Anyone | Only you, signed in | Only you, signed in |

macOS jobs count 10 times. One push to a pull request here uses about 100 minutes (the iOS build is about 80 of them), and a merge to `main` about 100 more, so a month of normal work fits in Pro's 3,000 but not always in Free's 2,000. When minutes run out, workflows stop until the next month unless you set a spending limit above $0.

The privacy policy and deletion page must stay reachable, or Google Play will reject updates. So pick one before switching:

1. **Simplest: GitHub Pro.** Upgrade at github.com/settings/billing. Nothing else changes: the same addresses, the same workflows.
2. **Free: move the website.** For example to Cloudflare Pages, which you already use for the server. The address changes, so the privacy policy and deletion links in Play Console, the privacy link in Settings and `SITE` in `src/social.js` all change with it. Ask Claude to do this one.

Then switch:

1. Settings, General, Danger Zone, **Change repository visibility**, Private.
2. Check the next **Deploy web app and friends server** run still publishes the site, and open the privacy page.
3. Under Settings, Actions, consider running the iOS job only on `main` to save minutes, and look at Billing, **Spending limit**.
4. Insights, Forks: forks made while it was public stay public. Without a licence they give nobody the right to reuse the code, but they exist.
5. The `latest-build` release stops being a public download. Android people get Haven from Google Play.
