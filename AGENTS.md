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

## The dependency is NOT the published Baileys package

This is the single most important thing in this repo.

```json
"@whiskeysockets/baileys": "git+https://github.com/naut21/Baileys.git#344c1ad7..."
```

The published `^7.0.0-rc.14` **cannot pair reliably**. The fork carries fixes that land
exactly on the pairing handshake. Do not "upgrade" to the npm package.

The decisive one is in `Utils/noise-handler`:

```js
// published rc14 — two concurrent drains over the same buffer, frames arrive out of order
await processData(pendingOnFrame)
frame = await decodeBinaryNode(result)

// fork — synchronous, in-order
processData(pendingOnFrame)
frame = decodeBinaryNodeSync(result)
```

That reordering corrupts the handshake that runs *while a pairing code is being
registered* — which is why linking failed on this bot while the reference paired
first try. The fork also sets `perMessageDeflate: false`, `setNoDelay` and
`setKeepAlive` on the upgraded socket, and gives Signal reads a lock-free cache path.

The fork is a TypeScript repo with a `prepare: npm run build` script. npm builds it
on install, so a clean `npm ci` works — it just takes ~30s.

### Pairing codes

`requestPairingCode(phone, customCode?)` accepts a custom code of **exactly 8 chars**.
The fork's own fallback picks from a fixed list of five (`NAUT2100`, `DUARTEXV`, …), so
every install would show the same codes. `النظام.js` generates a fresh Crockford-base32
code per pairing instead — do not remove `generatePairingCode()`.

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
