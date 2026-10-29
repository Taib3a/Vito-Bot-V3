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
- CI (`.github/workflows/ci.yml`) runs the syntax check and the loader check on Node 22
  and 24. There is no `npm run build` or `npm test` script.

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

## Post-pairing sync: the 515 trap

Right after a successful link, WhatsApp closes the socket with **515
(`restartRequired`)** and expects an immediate reconnect. Two bugs here caused the
"linked but does not read, re-reads the session forever" symptom:

1. **Wiping keys on every retry.** `connect()` called `clearSocketKeys()` whenever
   `attempt > 0`. `clearSocketKeys` deletes every `auth` row *except* `creds`, so
   `creds.registered` stayed `true` while all Signal keys were gone. The socket then
   connected fine but could not decrypt anything. Key wiping now happens only when
   the caller explicitly asks (`wipeKeys: true`), which is the `badSession` path.
2. **Reconnecting with `attempt: 0`.** The 515 path reset the counter, so the backoff
   was `5000 * 0 = 0ms` — an instant loop. The delay now has a floor of
   `RECONNECT_DELAY_MS`.

`reconnect()` is the single re-entry point and is guarded by a module-level
`reconnectLocks` set keyed by auth folder: Baileys can emit more than one close for a
single failure, and two concurrent `connect()` calls both re-read the auth db.

## Reconnect rules

- `restartRequired` (515) → reconnect with the saved session, reset the attempt
  counter, keep the keys. This is the normal post-link path.
- `badSession` (500) → wipe keys, then reconnect.
- `loggedOut` (401) / `connectionReplaced` (440) → stop; do not loop.
- Everything else → backoff `RECONNECT_DELAY_MS * attempt`, capped at 30s, up to
  `MAX_RECONNECT_ATTEMPTS`.
- **Never** wipe keys on a plain retry.

## Repo conventions

- Source comments are Arabic; commit messages and this file are English.
- Never commit `sessions/`, `database/sessions-taib/`, `*.db`, `.env`, or `test-session/`.
- Workflow: branch → PR → CI green → squash-merge into `main`. `gh` is not
  authenticated; use the REST API with `$GITHUB_TOKEN` (merge via
  `PUT /pulls/:n/merge-async`, then poll `/pulls/:n/merge-async/:uuid`).
