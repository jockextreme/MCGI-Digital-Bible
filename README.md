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

Then open **http://localhost:3000** in a browser.

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
│   ├── index.js              Express app entrypoint
│   ├── db.js                 SQLite connection + schema
│   ├── routes/
│   │   ├── books.js          GET /api/books
│   │   ├── versions.js       GET /api/versions
│   │   ├── verses.js         GET /api/verses, /api/verses/chapter-meta
│   │   ├── search.js         GET /api/search   (FTS5)
│   │   └── settings.js       GET/PUT /api/font-settings
│   └── seed/
│       ├── seed.js           populates the database
│       ├── adb.json          Ang Dating Biblia full text (public domain)
│       └── kjv.json          King James Version full text (public domain)
├── public/                   the frontend (served statically by Express)
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
└── data/
    └── bible.db              created by `npm run seed` (gitignored)
```

## Presenter/Audience split view

The control page (`/`) is what the operator uses — full toolbar, search,
font settings, etc. The **presenter view** (`/present`) is a clean, no-
controls display meant for the projector/TV, kept in sync in real time over
WebSocket: whenever the operator navigates to a new verse, every open
presenter window updates instantly.

Works for both setups:
- **One laptop, extended display** — click "Open Presenter Display" on the
  control page, drag that new window to the projector/second monitor, make
  it fullscreen (the **TOP** button toggles fullscreen).
- **Two different devices, same WiFi** — the control page shows a LAN URL
  (e.g. `http://192.168.1.23:3000/present`) under the toolbar. Open that on
  the second device's browser.

Under the hood: the server keeps one shared "current reference" in memory
(`server/liveState.js`). The control page POSTs to `/api/live-state`
whenever it navigates; the server resolves the verse text and broadcasts it
to every connected WebSocket client (`/ws`). The presenter page only
listens — it never has its own controls.

## Church logo/branding

A placeholder circular badge ("MCGI") sits in the top-right corner of the
card, on both the control and presenter views (`.logo-badge` in
`public/css/style.css`, one `<div class="logo-badge">` per HTML page). To
swap in a real logo:

1. Put your logo file at `public/img/logo.png` (transparent background works best).
2. Replace `<div class="logo-badge" aria-hidden="true">MCGI</div>` in both
   `public/index.html` and `public/present.html` with:
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

The card currently uses a **CSS-only placeholder background** (a dark
gradient) — deliberately, since the original app's bundled background image
had unclear rights for public redistribution. To use your own photo:

1. Put it at `public/img/background.jpg`.
2. In `public/css/style.css`, find the `.card` rule's `background-image`
   and change it to:
   ```css
   background-image:
     linear-gradient(155deg, rgba(6,14,42,0.85) 0%, rgba(10,22,60,0.72) 45%, rgba(6,14,42,0.88) 100%),
     url('/img/background.jpg');
   ```

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
won't lose anything, since the Bible text itself never changes — but
**Font Setting edits (the S dialog) will reset to defaults on every
restart**, since those live in the same database. If that becomes annoying:
- Upgrade to a Render plan with a **persistent disk**, mount it at the
  `data/` folder, and change the start command back to just `npm start`
  (seed once manually via the Render shell instead).
- Or store font settings somewhere that survives restarts instead (a
  separate small config file committed to the repo, or an external DB).

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

