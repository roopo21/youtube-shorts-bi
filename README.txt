SHORTLIST — LOCAL PROJECT

CURRENT ARCHITECTURE: see ARCHITECTURE.txt. The hosted viewer feed and tracking run in Supabase ytshorts-feed; Netlify hosts the protected curator and the same-origin feed proxy.

NETLIFY HOSTING: see NETLIFY-SETUP.txt and netlify.toml. The viewer and API can both run on Netlify, with Supabase storage. The viewer uses React with Vite.

START HERE (Node 22.13+; Node 24+ recommended)
  npm ci
  npm test
  npm run build

READY-TO-HOST VIEWER
  build/index.html
  build/assets/
  build/config.js
Upload the complete build folder to an HTTPS static host. This is the web build for Android WebView, not an APK. The viewer uses React with Vite. Source is in src/; npm run build generates build/index.html, build/assets/ and build/config.js.

For a working local demo with the bundled public catalogue:
  npm run seed:fixture
  LOCAL_ADMIN=1 npm run dev:fixture
Open http://localhost:4174. This uses a local SQLite development fixture, not production Supabase. Its seeded experimental entertainment metadata is not individually playback verified. Delete .sites-runtime/ to reset this fixture. LOCAL_ADMIN is loopback-only simulation.

RUN AGAINST YOUR EXISTING SUPABASE DATA
  cp .env.example .env
Fill the server-only bridge token and SETTINGS_ENCRYPTION_KEY, then:
  npm start
Opens API + viewer at http://localhost:4174. Configure ADMIN_USER and a strong ADMIN_PASSWORD for /admin. This self-hosted Node adapter strips client identity headers and authenticates the curator using HTTP Basic. Use HTTPS in production. Shareable ZIPs intentionally omit secrets. If a private .env is already present in this local folder, it is configured for your current database; keep it private and out of Git. The local curator username is curator and its generated password is in .env. The scoped bridge token and original encryption key must be transferred from the current server's secret configuration; do not replace them with browser-visible credentials. The existing encrypted YouTube key requires the original encryption key, or reconnect YouTube using a new encryption key.

SEPARATE VIEWER / BACKEND HOSTING
The backend can run on a separate server. Recommended: serve build at your frontend domain and reverse-proxy /api/* to the backend. deploy/nginx.conf.example shows this arrangement. Set PUBLIC_ORIGIN to the externally visible HTTPS frontend origin. This preserves HttpOnly session cookies without third-party cookie issues or a CORS dependency. Host the curator endpoint on a separately secured backend domain or proxy its protected routes too.

public/config.js accepts apiBase for custom deployments, but direct cross-origin use requires explicitly configured credentialed CORS and cookie policy. This package intentionally uses the same-origin reverse-proxy arrangement. The existing ChatGPT-private Site requires owner sign-in and is not a public API for your app. Run your own backend for rollout.

dist/server/index.js is also a compiled Cloudflare Worker for the existing Sites runtime. It uses verified Sites identity headers for owner authorization. Do not deploy that Worker to an arbitrary public host without replacing that admin authentication. Use npm start for the self-hosted Node adapter supplied here.

FEED EXPERIMENT
- No language chooser. Hindi and Marathi mix by default; each record retains its actual language label.
- Every complete group is entertainment, entertainment, information. A 15-item batch has 10 entertainment and 5 informational impressions.
- Informational reels MAY REPEAT, including multiple times in a batch. Unseen information is prioritized before reusing previously issued/viewed information. Every occurrence gets its own impression ID and watch measurements.
- Entertainment shuffles on every feed request. Viewed entertainment is excluded for 24 hours within the anonymous session; queued entertainment is excluded by the viewer while scrolling. This is not an account-wide watch history.
- A channel contributes at most two entertainment videos per batch. Adjacent channels differ where alternatives exist. Information repeats are exempt from the entertainment channel cap.
- With no eligible information, the feed pauses rather than breaking the ratio. With insufficient unseen entertainment, it returns the last complete triple. Repeated information continues as long as entertainment remains available.
- Each reload generates a shuffled feed. The native app can call window.shortlistShuffle(); no extra viewer button/header is added.
- A single YouTube iframe is mounted at a time. Autoplay starts muted. YouTube branding remains subject to YouTube's player behavior.

TRACKING
/api/events persists issued impression IDs, real playback seconds and 90% completion in ytshorts_impressions. Each repeated information occurrence is tracked independently. Topic and language support comparisons in the curator metrics. Playback/background/buffering checks are enforced in the viewer and durations are bounded server-side. Unknown video duration does not count as completion. This is MVP engagement tracking, not a fraud-resistant analytics system; it does not yet persist an explicit scroll-away or next-video conversion event.

INDEPENDENT CURATION / CONTENT GENERATION
Feed requests only read the catalogue; they do not launch discovery. Run this independently, e.g. using a server cron job every six hours:
  npm run curate
It refreshes Hindi and Marathi through YouTube Data API v3, respecting backend locks/throttles. It can use YOUTUBE_API_KEY or decrypt the existing encrypted key. It requires the same server environment as npm start. The admin also supports manual source management, discovery and candidate review. Changes to approved/experimental catalogue rows appear on the next feed request without rebuilding the viewer.

Searches produce candidates, not proof that a person watches them. API audio tags may be missing. Unknown-source candidates require review; approved-source matches can auto-approve after metadata checks. Information about wages, vacancies, schemes, rates and accommodation still needs currentness/claims verification. No transcript processing is required. YouTube owns video hosting; the local package contains IDs/metadata, not downloaded videos.

DATABASE / MIGRATIONS
Existing project: sarvam_call_test, ref hqgkdfaxexdodiozgxoe. All new feed tables start ytshorts_. Calling data is unrelated and untouched. Supabase remains a hosted database; this package does not pretend to contain a local production database or private user data.

On the existing project, migrations through mixed-sessions.sql are already applied. DO NOT rerun the initial CREATE TABLE scripts against it.
For a NEW empty Supabase project, apply SQL in this order:
  schema.sql
  content-categories.sql
  scale-library-tables.sql
  scale-library-rpc.sql
  channel-diversity.sql
  discovery-reserve.sql
  mixed-sessions.sql
Then deploy supabase/functions/ytshorts-data with the supplied config.toml. Generate a fresh 64-character hex bridge token and store its SHA-256 hash in ytshorts_settings.backend_token_sha256; only the backend gets the raw token. Do not expose service_role or the bridge token to browsers. All tables have RLS and no browser grants; the bridge authenticates a scoped server token and calls named operations. Existing encrypted credentials cannot be moved without the matching encryption key.

PUBLIC DATA INCLUDED
- starter-catalogue.json: 21 original sourced records (19 approved, two held for review).
- entertainment-selection.json: 1,000 selected entertainment metadata records across 15 creators.
- information-candidates.json: 210 discovery candidates; these are not automatically approved.
- coverage-checklist.json: 25 coverage rows, including the original feature list and exclusions.
These contain curator-assigned language/source labels where API language metadata was unavailable. Metadata sourcing does not certify every video is currently available or correctly classified.

FILES
public/ viewer and owner curator frontend
worker/ API, YouTube discovery, category/shuffle policy and data adapter
scripts/ builds, local/server launchers, fixture seed, discovery/import utilities
tests/ regression tests, including mixed-language feed, exact thirds and repeated information
supabase/ schema history and Edge Function source
android/ integration example for your existing Android app
archive/d1/ legacy schema used by SQLite tests, not current production storage

ANDROID
Load the HTTPS viewer URL in your existing app; see android/MainActivity.kt.example. JavaScript, DOM storage, INTERNET permission and autoplay settings are required. The build output is build/, not a single executable file. The backend stays server-side. Physical Android playback, gestures and audio need a device test before release.

REACT DEVELOPMENT
Run npm start for the Supabase-backed API at port 4175. In a second terminal run npm run dev for Vite at http://localhost:5173; /api proxies to the local backend. Production output is build/.
