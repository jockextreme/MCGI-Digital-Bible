# MCGI Digital Bible — Full-Stack Presentation App

A verse-presentation web app for worship services, rebuilt as a real
full-stack application: **Express + SQLite backend, vanilla JS frontend**.
This replaces the earlier single-file HTML version with a proper
client/server architecture — a real database, a real API, and a frontend
that talks to it over HTTP.

This is a genuine local web server, not a file you double-click. You'll
need [Node.js](https://nodejs.org) 18 or newer installed, and you'll run it
from a terminal.

## Design system

Every interactive control (buttons, inputs, dropdowns) has a **44×44px
minimum touch target**, following Apple's Human Interface Guidelines —
this applies on desktop too, not just mobile, since it makes everything
easier to click accurately regardless of device. Spacing between control
panel sections and inside dialogs is intentionally generous rather than
cramped. The accent color (gold) is used sparingly — for the one primary
action per screen, not decoratively.

**Bug fixed during this pass:** the top bar's buttons (Make Private, Open
Presenter Display, Copy Presenter Link, Log out) were referencing a
`.navbtn` style that only actually applied inside `.toolbar` containers —
since the top bar isn't a `.toolbar`, those buttons had been rendering
completely unstyled (default browser button appearance) since the layout
was restructured. Fixed by making `.navbtn` apply universally.

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

Then open **http://localhost:3000** for the landing page (choose Operator or
Viewer), or go straight to **http://localhost:3000/control** to sign
in/register and run a service yourself.

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
│   │   ├── liveState.js       GET/POST /api/live-state (per-locale)
│   │   └── operators.js       GET /api/operators/online
│   └── seed/
│       ├── seed.js           populates the database
│       ├── adb.json          Ang Dating Biblia full text (public domain)
│       └── kjv.json          King James Version full text (public domain)
├── public/                   the frontend (served statically by Express)
│   ├── index.html                      Landing page — choose Operator or Viewer
│   ├── console.html / js/app.js        Control Panel (login-gated, at /control)
│   ├── present.html / js/present.js    Presenter/viewer display (at /present), borderless
│   ├── js/themes.js                    Background themes + Safe Margin (shared by both)
│   ├── css/style.css
│   └── img/                            drop logo.png / background.jpg here
└── data/
    └── bible.db              created by `npm run seed` (gitignored)
```

## Landing page, operator accounts & multiple simultaneous operators

**The homepage (`/`) is a full landing page** — hero, "What this is," "Why
it was made," "Who it is for," "About the original," "How to use," and two
entry points: "I Am an Operator" (→ `/control`) and "I Am a Viewer" (→
`/present`). Viewers either use a direct link an operator shares
(`/present?locale=<locale>`), or open `/present` with no link at all and
pick from a searchable list of whoever's currently online.

**The control panel lives at `/control`** (the old `/console` URL still
works — it just redirects there). That's where you register/log in and
actually run a service. Open signup, no admin approval, no email
verification — meant for your own team/congregations, not gated.

### Locale + Operator identity

Accounts have **two separate fields**, not one:
- **Locale** — a place name like "Ugong" or "San Juan," identifying the
  congregation/service.
- **Operator name** — the person running it, like "Bro. Juan."

**Multiple operators can share one locale** (operator name only needs to
be unique *within* that locale, not globally — "Ugong · Bro. Juan" and
"San Juan · Bro. Juan" can coexist just fine). Everywhere in the UI, both
are shown together: `Ugong · Bro. Juan`.

Viewers follow by **locale**, not by individual operator
(`/present?locale=Ugong`) — the room is shared. If two operators are
signed in under the same locale, whichever one connects most recently
becomes the active broadcaster (their socket takes over; the previous one
is closed). This matches "prefer one active broadcaster per locale" — the
UI doesn't prevent multiple people signing in under one locale, but only
one can actually be driving the display at a time.

At registration you also choose:
- **Public** — shown in the picker on `/present` (only while that specific
  operator account is the one actively connected for their locale).
- **Private** — not listed anywhere; only reachable if someone has your
  direct `/present?locale=<locale>` link. Toggle this anytime from the
  control panel (top bar, next to your account badge).

What accounts buy you:
- **Each locale has its own independent broadcast room.** Two locales can
  run two completely separate services at the same time without
  interfering with each other.
- **Resume where you left off.** Your last book/chapter/verse/version is
  saved automatically every time you navigate, and restored the next time
  *that specific operator account* logs in (resume points are per-account,
  even though the room itself is shared per-locale).
- **Copy Presenter Link** — a button next to "Open Presenter Display"
  copies the shareable `/present?locale=<locale>` URL straight to the
  clipboard.

Passwords are hashed with Node's built-in `crypto.scrypt` (no extra
dependency). Sessions use `express-session` with its default in-memory
store — fine for a small team on one server process, but sessions won't
survive a server restart, and it isn't meant for large-scale public
deployments. If this ever needs to scale beyond a handful of operators or
run across multiple server instances, swap in a real session store (e.g.
`connect-sqlite3` or Redis).

### Temporary accounts — 1 hour

Operator accounts are **intentionally temporary**, not permanent logins.
An account is deleted after **60 minutes of inactivity** — a cleanup job
runs once on server boot and then every 5 minutes (`server/cleanup.js`).
"Inactivity" means no login, no live-state update, and no heartbeat.

The control panel sends a lightweight heartbeat
(`POST /api/auth/heartbeat`) every 2 minutes while it's open, specifically
so an operator who's just sitting on the page mid-service — not actively
clicking Next/Prev the whole time — doesn't get swept mid-broadcast.
Adjust the threshold with the `INACTIVITY_DELETE_MINUTES` environment
variable.

**Breaking change note:** this replaced an earlier single-field "locale =
account identity" model. If you're upgrading an existing deployment, the
old `operators` table is dropped and recreated on first boot — any
existing accounts are wiped. Given the 1-hour temporary nature of these
accounts, that's an acceptable one-time reset, not data loss of anything
meant to persist.

## Presenter/Audience split view

The **presenter view** (`/present?locale=<locale>`) is a clean,
**strictly borderless** display meant for the projector/TV/livestream feed
— background and text only, no card frame, no outline, by design (this is
a hard rule, not a style choice: nothing should be added back that puts a
border/frame around the presenter card). It's kept in sync in real time
over WebSocket: whenever that operator navigates to a new verse, every
viewer watching them updates instantly, with a smooth cross-fade instead of
a hard cut.

The presenter shows **only** reference, version name, and verse text — no
cross-reference footer. (Cross-references still show in the control
panel's own "Now Showing" preview, since that's useful for the operator to
see while running a service — it's just not part of what the audience
sees.)

**The viewer's background is independent of the operator's choice.**
An operator might use Chroma or Black on their own end for a stream
composite, but a plain viewer opening the link on their phone always gets
the Default theme regardless — only Default is viewer-selectable for now.
This is stored via `localStorage` (`mcgi-viewer-bg`) so more viewer-facing
theme options can be added later without restructuring anything.

A late-joining viewer gets the current verse **immediately** on connect —
no waiting for the operator's next navigation. If a viewer's connection
drops (phone locks, WiFi blip), it automatically reconnects every 2
seconds and re-syncs to whatever's currently showing, with a clear
**Connecting… / Live / Disconnected — retrying…** status badge throughout.

Opening `/present` with **no operator specified** shows a plain, searchable
list of whoever's currently public and online (with a live viewer count
next to each), instead of redirecting away — the search box only appears
once there are more than 5 operators online, to stay out of the way for
small setups. Pick one and it takes you straight to their feed. The page
title also updates dynamically to show the current reference and operator
(useful when the presenter tab is one of many open browser tabs), and a
small "Following: [locale] · [operator]" badge sits in the top-left corner
once connected.

Press **F** anywhere on the presenter page to toggle fullscreen (no visible
button — keeping the borderless page free of UI chrome — but the shortcut
works the moment the page has focus). The control panel has the same F
shortcut, alongside the existing arrow-key/`/`/Esc shortcuts.

To get the presenter open on a second screen, click **"Open Presenter
Display"** (opens it directly, pre-filled with your locale) or **"Copy
Presenter Link"** (copies the public URL to paste anywhere — a text to a
helper, a second device, OBS/vMix as a browser source, etc.). There's no
LAN/local-network address shown anymore — just the one public link that
works the same everywhere the server is reachable.

### Copy Verse

The control panel's Tools section has a **Copy Verse** button — copies the
currently-shown reference, version, and text to the clipboard as plain
text (e.g. for pasting into an announcement or chat). Falls back to a
manual-selection method on browsers/contexts where the Clipboard API isn't
available (like non-HTTPS local testing).

### Emergency Blank Screen

The control panel's **Blank Screen** button (or **B** key) instantly forces
the presenter to plain black — overriding whatever theme is active —
without touching the current verse reference. Un-blanking restores exactly
what was showing before. This is a live-only toggle, deliberately not
saved to the database as a resume point (you wouldn't want a service to
silently restart blank because it was blanked at the end of the last one).

### Freeze / Pause Follow (viewer-side)

Press **P** on the presenter/viewer page to pause following the operator —
useful if a viewer wants to keep reading a verse at their own pace while
the operator moves ahead. A "Paused — press P to resume" badge appears
while frozen. Unfreezing immediately catches up to whatever the operator
is showing now (it doesn't play back everything that was missed).

### Background Themes

Five themes now: Default (your photo), Black, Chroma (green-screen),
Navy, and Classic Bible (a dark leather/gold gradient). All are kept dark
on purpose — the verse text color is hardcoded white/yellow for
readability against dark backgrounds, so a light theme would need a
text-color override to stay legible (not implemented yet).

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

The control panel also has its own **Local Preview** mode (Auto/Manual) in
its own section — this only changes what the *operator* sees in their own
"Now Showing" preview, as a way to check how a Manual-mode viewer would see
it. It never affects the actual broadcast.

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

There's currently no logo shown anywhere — the placeholder badge was
removed. The `.logo-badge` CSS rule is still in `public/css/style.css` if
you want to bring a logo back later:

1. Put your logo file at `public/img/logo.png` (transparent background works best).
2. Add `<img class="logo-badge" src="/img/logo.png" alt="MCGI logo" />`
   inside `.card` in `public/console.html` and/or `public/present.html`
   (right after the opening `<div class="card" id="card">` line).
3. In `style.css`, you may want to change `.logo-badge`'s `background` to
   `background:none;` and add `object-fit:contain;` so your image shows
   cleanly instead of the placeholder circle.

Note: the Presenter (`/present`) is strictly borderless by design — a small
corner logo image doesn't violate that rule (it's not a frame/outline
around the card), but keep it subtle if you add one there, so it doesn't
start feeling like a border again.

## API reference

- `GET /api/books` — all 66 books, canonical order, with Tagalog names and chapter counts.
- `GET /api/versions` — all versions, each flagged `hasData: true/false`.
- `GET /api/verses?version=ADB&book=Genesis&chapter=1&verse=1` — one verse, plus chapter/book bounds and cross-references.
- `GET /api/verses/chapter-meta?version=ADB&book=Genesis&chapter=1` — just the verse count for a chapter (used for Previous/Next rollover).
- `GET /api/search?version=ADB&q=pag-ibig` — full-text search, ranked, capped at 60 results.
- `GET /api/font-settings` — the 14-row content-length → font-size table.
- `PUT /api/font-settings` — body `[{ rangeIndex, fontSize }, ...]`, persists edits.
- `POST /api/auth/register` — body `{ locale, operatorName, password, isPublic }`, logs you in immediately.
- `POST /api/auth/login` — body `{ locale, operatorName, password }` (both fields matched case-insensitively).
- `POST /api/auth/logout`
- `GET /api/auth/me` — current session's operator, or `null`.
- `POST /api/auth/heartbeat` — (requires login) refreshes `last_active_at` so the 1-hour inactivity cleanup doesn't sweep an open-but-idle session.
- `GET /api/auth/check-operator?locale=Ugong&operatorName=Bro.%20Juan` — real-time availability check for a locale+operator-name pair.
- `PUT /api/auth/visibility` — body `{ isPublic }`, toggle public/private anytime.
- `GET /api/auth/ws-token` — one-time token for the operator's authenticated WebSocket connection.
- `GET /api/operators/online` — locales with an active, **public** operator connected, each with a live preview (reference, version, text snippet) and the connected operator's name. Powers the `/present` picker.
- `GET /api/live-state?locale=<locale>` — that locale's current reference.
- `POST /api/live-state` — (requires login) body `{ version, book, chapter, verse, background, safeMargin }`; updates and broadcasts the logged-in operator's locale room, and saves the resume point to their own account.
- `POST /api/live-state/blank` — (requires login) body `{ blank: true|false }`; emergency blank screen for the operator's locale room.

## Bible text data

Three complete, **public-domain** translations are seeded from
`server/seed/*.json`:

- **Ang Dating Biblia** (Tagalog, 1905) — 31,102 verses
- **King James Version** (English) — 31,102 verses
- **Reina-Valera 1909** (Spanish) — 31,084 verses

All three were sourced from the public-domain `seven1m/open-bibles` text
corpus (ADB/KJV from OSIS format, Reina-Valera from USFX format — see
`server/seed/seed.js`'s comments for the parser differences) — **not** from
the original "Digital Bible" desktop app's own `.db3` files, which are
encrypted/obfuscated and were deliberately left alone rather than
reverse-engineered.

Several other versions appear in the dropdown but have **no text loaded**
(`hasData: false` in the API, "no text loaded" in the UI): Ang Biblia 1905,
Ang Biblia 1982, Ang Bagong Ang Biblia, AKJV, KJV 1611, New King James
Version, NIV, ESV, and "KJV (MCGI Modified)". These are listed because
they were explicitly requested, but each has a real obstacle:

- **NIV, ESV, NKJV** are actively copyrighted (Biblica, Crossway, and
  Thomas Nelson respectively) — embedding full text without a license
  would be copyright infringement, not just a to-do item.
- **KJV 1611** (the true original 1611 spelling/typesetting, not the 1769
  Oxford revision everyone actually calls "the KJV" — including the KJV
  already in this project) exists on Wikisource, but only as scanned
  page images / wiki markup, not clean structured verse-by-verse data. It
  would need real parsing work against a messier source, not just a
  straight text pull like the other three.
- **KJV (MCGI Modified)** is presumably an internal MCGI edit and isn't
  publicly available anywhere to source from.

To add a version with real text, find a public-domain (or properly
licensed) source, shape it into the same
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

