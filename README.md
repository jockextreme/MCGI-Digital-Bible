# MCGI Digital Bible — Full-Stack Presentation App

A verse-presentation web app for worship services, rebuilt as a real
full-stack application: **Express + SQLite backend, vanilla JS frontend**.
This replaces the earlier single-file HTML version with a proper
client/server architecture — a real database, a real API, and a frontend
that talks to it over HTTP.

This is a genuine local web server, not a file you double-click. You'll
need [Node.js](https://nodejs.org) 18 or newer installed, and you'll run it
from a terminal.

## What changed from the single-file version

| | Old (single HTML file) | This version |
|---|---|---|
| Bible text | Embedded inline as JS (~9.5MB file) | Stored in a real SQLite database |
| Search | Manual JS loop over every verse | SQLite FTS5 full-text index (fast, ranked) |
| Font Setting edits | Lost on page reload | Persisted to the database via API |
| Structure | Everything in one file | Proper client/server separation |
| Running it | Double-click the HTML file | `npm install && npm run seed && npm start` |

All the same features are here: Tagalog book naming with Roman numerals,
the app's exact content-length → font-size auto-resize table, the editable
Font Setting dialog, real keyword search, Previous/Next with chapter
rollover, and the jump box.

## Setup

```bash
npm install       # installs Express + better-sqlite3
npm run seed       # builds data/bible.db from the two Bible datasets
npm start          # starts the server
```

Then open **http://localhost:3000** for the public homepage (who's live
right now), or **http://localhost:3000/console** to sign in/register and run
a service yourself.

`npm run seed` is safe to re-run any time — it rebuilds the relevant tables
from scratch (useful if you add more translations later).

For development with auto-restart on file changes:
```bash
npm run dev
```

## Project structure

```
mcgi-digital-bible/
├── package.json
├── server/
│   ├── index.js              Express app entrypoint + WebSocket routing
│   ├── db.js                 SQLite connection + schema
│   ├── auth.js                password hashing (Node's built-in crypto.scrypt)
│   ├── cleanup.js              inactivity auto-deletion job (90-day default)
│   ├── liveState.js           per-operator "room" state + WebSocket broadcast
│   ├── wsTokens.js            short-lived tokens for authenticating operator WS connections
│   ├── verseLookup.js         shared verse-fetching logic
│   ├── routes/
│   │   ├── books.js          GET /api/books
│   │   ├── versions.js       GET /api/versions
│   │   ├── verses.js         GET /api/verses, /api/verses/chapter-meta
│   │   ├── search.js         GET /api/search   (FTS5)
│   │   ├── settings.js       GET/PUT /api/font-settings
│   │   ├── auth.js            register/login/logout/me/ws-token
│   │   ├── liveState.js       GET/POST /api/live-state (per-operator)
│   │   ├── operators.js       GET /api/operators/online
│   │   └── networkInfo.js     GET /api/network-info
│   └── seed/
│       ├── seed.js           populates the database
│       ├── adb.json          Ang Dating Biblia full text (public domain)
│       └── kjv.json          King James Version full text (public domain)
├── public/                   the frontend (served statically by Express)
│   ├── index.html                      Homepage — public directory + live previews
│   ├── console.html / js/app.js        Operator console (login-gated, at /console)
│   ├── present.html / js/present.js    Audience/viewer display (at /present)
│   ├── js/themes.js                    Background themes + Safe Margin (shared by both)
│   ├── css/style.css
│   └── img/                            drop logo.png / background.jpg here
└── data/
    └── bible.db              created by `npm run seed` (gitignored)
```

## Homepage, operator accounts & multiple simultaneous operators

**The homepage (`/`) is now a public directory**, styled like a video
platform's homepage: every **public** operator who's currently broadcasting
shows up as a card with a live preview (current reference, version, and a
snippet of the verse text), refreshing automatically. Anyone can browse it
without logging in — click a card to open that operator's presenter view.

**The operator console moved to `/console`.** That's where you register/log
in and actually run a service. Open signup, no admin approval, no email
verification — meant for your own team/congregations, not gated.

Instead of a generic username, operators register with a **locale** — a
place name like "Ugong" or "San Juan" — since that's what actually
identifies a congregation/service in this context. At registration you also
choose:
- **Public** — shown on the homepage directory for anyone to find.
- **Private** — not listed anywhere; only reachable if someone has your
  direct `/present?operator=<locale>` link. Toggle this anytime from the
  console (top bar, next to your account badge).

What accounts buy you:
- **Each operator has their own independent "room."** Two people can run
  two completely separate services at the same time (e.g. a Tagalog service
  and an English service) without interfering with each other.
- **Resume where you left off.** Your last book/chapter/verse/version is
  saved automatically every time you navigate, and restored the next time
  you log in.
- **Viewers pick which operator to follow** from the homepage, or go
  straight to `/present?operator=<locale>` if they already know it.

Passwords are hashed with Node's built-in `crypto.scrypt` (no extra
dependency). Sessions use `express-session` with its default in-memory
store — fine for a small team on one server process, but sessions won't
survive a server restart, and it isn't meant for large-scale public
deployments. If this ever needs to scale beyond a handful of operators or
run across multiple server instances, swap in a real session store (e.g.
`connect-sqlite3` or Redis).

### Inactivity cleanup

Operator accounts that haven't been active (logged in, or posted a
live-state update) in **90 days** are automatically deleted — a cleanup job
runs once on server boot and then once every 24 hours
(`server/cleanup.js`). This keeps stale/abandoned locale names from
squatting on the directory forever. Adjust the threshold with the
`INACTIVITY_DELETE_DAYS` environment variable.

## Presenter/Audience split view

The **presenter view** (`/present?operator=<locale>`) is a clean, no-
controls display meant for the projector/TV, kept in sync in real time over
WebSocket: whenever that operator navigates to a new verse, every viewer
watching them updates instantly.

Works for both setups:
- **One laptop, extended display** — click "Open Presenter Display" on the
  console page (this automatically includes your own locale in the
  link), drag that new window to the projector/second monitor, make it
  fullscreen (the **TOP** button toggles fullscreen).
- **Two different devices, same WiFi** — the console page shows a LAN URL
  under the toolbar, already including your operator locale.

### Auto vs Manual Version Mode (viewer-side)

Every presenter/viewer page has a small, unobtrusive version picker in the
bottom-left corner:
- **Auto (default)** — mirrors whatever version the operator is currently
  showing.
- **Manual** — pick any version with real text loaded (currently Ang Dating
  Biblia or KJV). The viewer keeps following the *same verse reference* the
  operator navigates to, but always displayed in their own chosen version —
  independent of what the operator picks. This means one operator can drive
  a Tagalog room and an English-reading viewer in the same room sees the
  same verses in English, automatically, with no extra work from the
  operator. This choice is remembered per-operator in the viewer's own
  browser (`localStorage`), not on the server.

Under the hood: the server keeps one "room" per operator locale in memory
(`server/liveState.js`), each with its own current reference and its own set
of connected viewer sockets. The operator's console POSTs to
`/api/live-state` whenever it navigates; the server resolves the verse text
for the *operator's* version and broadcasts the reference + operator's text
to that room. Viewers in Auto mode just display what they're sent; viewers
in Manual mode take just the book/chapter/verse from that broadcast and
independently call `GET /api/verses` themselves with their own chosen
version.

## Background themes, Safe Margin & History

Three features borrowed directly from how the official MCGI web app
(`bible.mcgi.app`) works, found by researching its actual operator/viewer
pages:

### Background themes (BG dropdown)

A shared registry (`public/js/themes.js`) used by both the operator console
and the viewer page:
- **Default** — your own photo at `/img/background.jpg`
- **Black** — solid black, useful as a plain lower-third-style background
- **Chroma** — solid green-screen green (`#00b140`), for compositing this
  card into a live production (OBS, vMix, etc.) with the background keyed
  out entirely

To add more (e.g. a themed background for a special event, matching the
official app's per-event themes like their "Youth 2024" or "Wedding 2024"),
add an entry to the `BACKGROUND_THEMES` array in `themes.js` pointing at an
image you've placed under `/img/backgrounds/` — it shows up in the operator
dropdown and on viewer screens automatically, nothing else to wire up.

The chosen theme is part of the live broadcast (so viewers always see
whatever background the operator picked) and is saved as that operator's
resume point, same as their last book/chapter/verse.

### Safe Margin

A broadcast-production feature: when this display gets captured by a
camera or composited into a TV/livestream output, text sitting right at
the edge of the frame can get clipped. Safe Margin adds extra padding
inside the card — **None / 300 / 400 / 500** (matching the official app's
own options) — scaled proportionally to the actual screen size using the
same technique as the auto-resize font sizing. Also broadcasts live and
persists as the operator's resume point.

### History (the "H" button)

Tracks recently-shown references for the current console session (not
persisted to the database — it resets if you reload the console). Click
**H** to see a list of what's been shown, most recent first, and click any
entry to jump back to it. Wired into every navigation path: Previous/Next,
the jump box, and clicking a search result.

## Church logo/branding

A placeholder circular badge ("MCGI") sits in the top-right corner of the
card, on both the control and presenter views (`.logo-badge` in
`public/css/style.css`, one `<div class="logo-badge">` per HTML page). To
swap in a real logo:

1. Put your logo file at `public/img/logo.png` (transparent background works best).
2. Replace `<div class="logo-badge" aria-hidden="true">MCGI</div>` in both
   `public/console.html` and `public/present.html` with:
   ```html
   <img class="logo-badge" src="/img/logo.png" alt="MCGI logo" />
   ```
3. In `style.css`, you may want to change `.logo-badge`'s `background` to
   `background:none;` and add `object-fit:contain;` so your image shows
   cleanly instead of the placeholder circle.

## API reference

- `GET /api/books` — all 66 books, canonical order, with Tagalog names and chapter counts.
- `GET /api/versions` — all versions, each flagged `hasData: true/false`.
- `GET /api/verses?version=ADB&book=Genesis&chapter=1&verse=1` — one verse, plus chapter/book bounds and cross-references.
- `GET /api/verses/chapter-meta?version=ADB&book=Genesis&chapter=1` — just the verse count for a chapter (used for Previous/Next rollover).
- `GET /api/search?version=ADB&q=pag-ibig` — full-text search, ranked, capped at 60 results.
- `GET /api/font-settings` — the 14-row content-length → font-size table.
- `PUT /api/font-settings` — body `[{ rangeIndex, fontSize }, ...]`, persists edits.
- `POST /api/auth/register` — body `{ locale, password, isPublic }`, logs you in immediately.
- `POST /api/auth/login` — body `{ locale, password }` (locale match is case-insensitive).
- `POST /api/auth/logout`
- `GET /api/auth/me` — current session's operator, or `null`.
- `PUT /api/auth/visibility` — body `{ isPublic }`, toggle public/private anytime.
- `GET /api/auth/ws-token` — one-time token for the operator's authenticated WebSocket connection.
- `GET /api/operators/online` — **public** operators currently broadcasting, each with a live preview (reference, version, text snippet). Powers the homepage.
- `GET /api/live-state?operator=<locale>` — an operator's current reference.
- `POST /api/live-state` — (requires login) body `{ version, book, chapter, verse, background, safeMargin }`; updates and broadcasts the logged-in operator's own room, and saves it as their resume point.

## Bible text data

Two complete, **public-domain** translations are seeded from
`server/seed/adb.json` and `server/seed/kjv.json`:

- **Ang Dating Biblia** (Tagalog, 1905) — 31,102 verses
- **King James Version** (English) — 31,102 verses

Both were sourced from the public-domain `seven1m/open-bibles` OSIS text
corpus — **not** from the original "Digital Bible" desktop app's own
`.db3` files, which are encrypted/obfuscated and were deliberately left
alone rather than reverse-engineered.

Four other versions appear in the dropdown (Ang Biblia 1905, Ang Biblia
1982, Ang Bagong Ang Biblia, AKJV) but have **no text loaded** — `hasData`
is `false` for them in the API and the UI shows "no text loaded." To add
one, find a public-domain source, shape it into the same
`{ "BookName": [ [verse1, verse2, ...chapter1], [...chapter2], ... ] }`
format as the existing JSON files, drop it in `server/seed/`, add an entry
to the `VERSIONS` array in `server/seed/seed.js`, and re-run `npm run seed`.

## Background image

The card is wired directly to `public/img/background.jpg` — no gradient
overlay, no shadow layered on top of it. Just drop your photo in at that
exact path and filename and it shows up as-is:

```
public/img/background.jpg
```

Until that file exists, the card falls back to a plain solid dark color
(`#081226`) instead of looking broken.

If your photo makes the verse text harder to read once it's in, the text
elements (`.ref`, `.version-label`, `.verse-body p`) each already carry
their own subtle drop-shadow for contrast — if that's still not enough,
adding a semi-transparent dark layer back into `.card`'s `background-image`
is the fix (ask and it can be added back in).

## Notes on the original desktop app

This project recreates the look and behavior of a Windows app called
"Digital Bible" (`Bible_Digital.exe`), based entirely on screenshots and
descriptions provided during development — **the app's compiled code was
never decompiled or reverse-engineered**, and its encrypted verse-text
database files were correctly left uncracked. If you want more of the
original app's features replicated (several toolbar buttons — D, BV, V, H,
C, BF, BI — are still placeholders because their function isn't known),
provide a screenshot or description of what they do and they can be wired
up the same way everything else here was.

## Deploying to Render

A `render.yaml` blueprint is included, so the easiest path is:

1. Push this project to a GitHub repo (or connect Render directly to it).
2. In the Render dashboard: **New → Blueprint**, point it at the repo — it
   reads `render.yaml` automatically and sets everything up.
3. Wait for the first deploy to finish, then open the URL Render gives you.
   That's your **operator console**. The **audience/presenter view** is the
   same URL with `/present` on the end.

### Important: the database resets on every deploy/restart (free plan)

Render's free (and standard, non-disk) plans use an **ephemeral
filesystem** — anything written to disk, including `data/bible.db`,
disappears when the service restarts or redeploys. To handle this,
`render.yaml`'s start command is:

```
npm run seed && npm start
```

Re-seeding takes a couple of seconds and is idempotent, so this just means
the database silently rebuilds itself every time the service boots. You
won't lose the Bible text, since that never changes — but **everything else
in the database resets on every restart too**: Font Setting edits, and
**all registered operator accounts**. Anyone who registered will need to
register again after a restart. If that becomes annoying:
- Upgrade to a Render plan with a **persistent disk**, mount it at the
  `data/` folder, and change the start command back to just `npm start`
  (seed once manually via the Render shell instead).
- Or move accounts/settings to a database that lives outside this
  ephemeral disk (a managed Postgres add-on, for example).

Also set a **`SESSION_SECRET`** environment variable in the Render
dashboard (any long random string) — without it, a new random secret is
generated every time the service boots, which logs every operator out on
every restart even beyond the account-wipe issue above. (If you deployed
via the `render.yaml` Blueprint, this is already handled — it auto-generates
one for you. This only matters if you set the service up manually.)

### Other things that differ from local/LAN use

- The operator page's "open this on another device" hint uses
  `/api/network-info`, which reports **local network IPs** — meaningless
  once deployed publicly. When deployed, just share the real
  `https://your-app.onrender.com/present` URL directly instead of relying
  on that hint.
- WebSockets (`/ws`) work fine on Render's web services (this is not a
  serverless/functions deployment, so long-lived connections are fine).
- If you add authentication later, remember `PUT /api/font-settings` is
  currently open to anyone who can reach the deployed URL — fine for
  internal/church use, but worth locking down before wider public exposure.

## Deploying elsewhere (VPS, Railway, Fly.io, etc.)

Same idea applies anywhere: it's a plain Express + WebSocket app.
- Set the `PORT` environment variable if your host requires a specific one (it already reads `process.env.PORT`).
- Make sure `data/bible.db` persists across restarts, or re-run `npm run seed` on boot like the Render setup does.
- Consider adding basic auth or an admin-only guard around `PUT /api/font-settings` for any public deployment.

