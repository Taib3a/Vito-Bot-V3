# AGENTS.md

Project memory for **Vito-Bot-V3** — an Arabic WhatsApp bot on Baileys (ESM, SQLite).

## Layout

```
index.js                      entry point — installs the warning filter, calls connect()
database/db.js                node:sqlite wrapper
الاضافات/                     core modules
  النظام.js                   connection + pairing  ← connection logic lives here
  المعالج.js                  message handling / command routing
  المحمل.js                   command loader (from الاوامر/)
  محمل-المضاد.js              anti-feature loader
  الادخال.js                  line-buffered prompts + phone normalisation
  الجلسة.js                   single-file SQLite auth state
  الاوامر/  تنصيب/            all commands (auto-loaded)
sessions/main/auth.db         the live session (gitignored)
```

## Commands

- `npm start` — boots the bot.
- Syntax check: `find index.js database الاضافات الاوامر -name '*.js' -print0 | xargs -0 -n1 node --check`
- Loader check: import `الاضافات/المحمل.js` and `الاضافات/محمل-المضاد.js`, assert both return something.

CI (`.github/workflows/ci.yml`) runs both on Node 22 and 24 for every push and PR to `main`.

## The dependency is the patched `baileys-nextgen` package

```json
"@whiskeysockets/baileys": "npm:@muhammadridwanf61/baileys-nextgen@latest"
```

The reference repo pins `github:naut21/Baileys`, but **that build is not usable** — it
crashes (the reference itself only links after swapping it out). Both the official
package and this npm alias work. We use the alias: it is published, needs no build
step, and carries the pairing improvements.

Do not switch this back to the `naut21` git dependency.

`baileys-nextgen` is `7.0.0-rc14` plus extra modules: `Pairing/` (companion-reg
pairing suite), `Resilience/` (prekey repair, rate-limit guard, session revival),
`HumanEngine/` (anti-ban), `Router/`, `AI/`. They are opt-in exports — importing the
package starts no timers or servers.

### Pairing codes

`requestPairingCode(phone, customCode?)` accepts a custom code of **exactly 8 chars**;
without one it generates a code itself. `النظام.js` generates a fresh Crockford-base32
code per pairing via `generatePairingCode()`.

## Crash safety

The process is long-lived, so nothing may take it down:

- `index.js` installs `uncaughtException` and `unhandledRejection` handlers that log
  and keep running, plus a `warning` filter that drops only the `node:sqlite`
  `ExperimentalWarning`.
- The whole `makeWASocket` call is inside a `try`, and the reconnect path is `.catch`ed.
- `connect()` never throws to the caller — on exhaustion it returns `{ sock: null }`.

Optional peers (`jimp`, `link-preview-js`, `audio-decode`, `sharp`) are loaded lazily
by Baileys. `generateHighQualityLinkPreview: true` needs `link-preview-js`; the import
is wrapped in try/catch upstream, but install the peer if link previews matter.

## Pairing flow (mirrors the reference)

1. `connect()` asks `1`/`2` **only** when the session is not registered, only on the
   main bot, and only on `attempt === 0`.
2. Phone input accepts any format — `+967 738 512 629`, `967-738-512-629`,
   `(967) 738 512 629`. `normalizePhoneNumber()` strips non-digits and checks E.164
   length (8–15).
3. Wait `PAIRING_DELAY_MS` (3000ms), then request the code.
4. **Never add a timer that wipes the session while a code is on screen.** An earlier
   version did exactly that — it called `resetSession()` on expiry, deleting the
   credentials mid-pairing, which surfaced as "تعذر ربط الجهاز".

Reconnect clears the cached keys (`clearSocketKeys`) and backs off
`RECONNECT_DELAY_MS * attempt`, capped at 30s.

## Repo conventions

- Source comments are Arabic; commit messages and this file are English.
- Never commit `sessions/`, `database/sessions-taib/`, `*.db`, `.env`, or `test-session/`.
- Workflow: branch → PR → CI green → squash-merge into `main`. `gh` is not
  authenticated; use the REST API with `$GITHUB_TOKEN` (merge via
  `PUT /pulls/:n/merge-async`, then poll `/pulls/:n/merge-async/:uuid`).
