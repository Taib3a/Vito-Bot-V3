# AGENTS.md

Project memory for **Vito-Bot-V3** — an Arabic WhatsApp bot on Baileys (ESM, SQLite).

## Layout

```
index.js                      entry point (choose pairing code or QR)
database/db.js                node:sqlite wrapper
الاضافات/                     core modules (loader, handler, connection, console…)
  النظام.js                   WhatsApp connection + event wiring  ← connection logic lives here
  المعالج.js                  message handling / command routing
  المحمل.js                   command loader (from الاوامر/)
  محمل-المضاد.js              anti-feature loader
  معلومات-الرسالة.js          message inspection helpers
  مضاد/                       anti-features (links, welcome, group watch, anti-bot, XP)
الاوامر/                      all commands (auto-loaded); مجموعة/, تنصيب/
scripts/check.js              syntax-checks every source file (used by `npm run build`)
scripts/smoke.js              crash-safety smoke test (used by `npm test`)
```

## Commands

- `npm run build` — walks `index.js`, `الاضافات/`, `الاوامر/` and syntax-checks every `.js`
  file. New commands are covered automatically; **never** add filenames to `package.json`.
- `npm test` — crash-safety smoke test: loads commands + anti-features, round-trips the
  SQLite layer on a temp DB (`BOT_DB_PATH`), and pushes a synthetic message through the
  handler. Fails on any crash. Run both before committing.
- `npm start` — boots the bot (`index.js`).

## CI

`.github/workflows/ci.yml` runs `npm ci` → `npm run build` → `npm test` on every push
to `main` and every PR, on a **Node 22 and 24 matrix** (`engines.node` is `>=22`; keep
both green). It is a required safety net: never merge a red run. `node:sqlite` emits an
`ExperimentalWarning` on Node 22 — that is expected, not a failure.

## Hard-won knowledge: the 428 "Connection Closed" error

`428` is **misleading**. Baileys maps a generic websocket `1006` (abnormal closure)
to `DisconnectReason.connectionClosed` (428). It is almost never a real
"Precondition Required" from the server. Diagnose with the **raw** close code:

```js
sock.ws?.socket?.on("close", (code, reason) => console.log(code, reason));
```

Facts confirmed by testing (do not re-litigate these):

1. `requestPairingCode()` sends its iq node **immediately** and throws 428 if the
   socket is not open. Wait for `sock.ws.isOpen` before calling it.
2. **Do NOT add a delay before requesting the pairing code.** WhatsApp closes an
   unregistered socket a few hundred ms after the handshake, so a fixed delay
   (e.g. 3s) races that timeout and makes the 428 deterministic. Send immediately.
3. `requestPairingCode()` generates the code **locally** (`bytesToCrockford(randomBytes(5))`)
   and returns it on the line right after `sendNode`, so a returned code does not
   by itself prove the server accepted it.
4. `creds.registered` stays `false` after a pairing request — only `creds.me` is set.
   Worse, `creds.me` is set **before** `sendNode`, so a failed request still looks
   "done". Track pairing success explicitly (see `pairingRequested` in `النظام.js`)
   rather than trusting `creds.me`.
5. After a successful pairing the server closes the socket (expect a 428) and the
   client must reconnect. Always back off (~5s) before reconnecting or you get a
   tight reconnect loop.

## Pairing UX (matches the Yuta-Okkotsu reference)

`connect()` shows the code in a box (`log.pairingCode`) and starts a 75s grace
timer (`startPairingGrace`). While the timer runs, closes are logged as
`waiting for pairing` instead of a red error box, and the reconnect does not mint
a second code (`pairingRequested` guards it). If the timer fires, the code is
dropped and the next connection requests a fresh one — so a valid code is always
on screen.

A failed `requestPairingCode` is logged with `log.warn`, not `log.error`: on a
datacenter IP the first attempt usually loses the race against the 428 drop, and
the retry succeeds. Showing the user a red "ERROR DETECTED" box there is
misleading.

## Environment gotcha

WhatsApp terminates web-client sessions from **datacenter IPs** — the socket opens,
then closes ~250–600ms later with a raw `1006` the moment handshake data is sent.
In such an environment pairing succeeds only occasionally (a race), for both the
pairing and QR flows. This is **not a code bug**. Run the bot on a residential/real
host to pair; check the egress IP (`curl -s https://ipinfo.io/json`) when debugging.

## Console input (`الاضافات/الادخال.js`)

`index.js` asks two questions (method, then phone number) through
`createPrompter()`, never a raw `readline.question()`. A single shared
interface with `question()` drops or mis-attributes the second answer when
stdin delivers more than one line at once (piped input, hosting-panel
console), which made the phone prompt resolve instantly with a stale/empty
line. The prompter queues incoming lines and reuses one interface instead.

- Never add a second `readline` interface for a follow-up question; ask
  through the same prompter.
- EOF resolves a pending question with `null`; callers treat that as "no
  input" and exit instead of hanging.
- `crlfDelay` cannot fix a CR-then-LF split (common on panel consoles). The
  prompter instead validates answers and re-prompts, so a stray empty line is
  harmless.

## Hiding the `node:sqlite` ExperimentalWarning

`node:sqlite` emits an `ExperimentalWarning` on Node 22. `index.js` installs a
`process.on("warning")` filter that drops only `ExperimentalWarning` and
re-prints anything else. This only works because `index.js` reaches the
database **dynamically** (`await import("./الاضافات/النظام.js")`) after the
filter is registered. `process.removeAllListeners("warning")` is called first
so the default printer is gone, then the filter is added.

- Do NOT convert that dynamic import back to a static `import` — the static
  import would load the DB module (and print the warning) before the filter
  runs, reintroducing the message.
- `scripts/smoke.js` imports `database/db.js` statically on purpose; that is
  fine because it does not assert on warning output.

## Session storage (`الاضافات/الجلسة.js`)

Auth state uses `useSQLiteAuthState()`, not Baileys' `useMultiFileAuthState`.
Everything (creds + all keys) lives in one `auth.db` per session folder instead
of hundreds of `creds.json` / `pre-key-*.json` / `session-*.json` files.

- An existing multi-file session is imported on first run; the JSON files are
  moved to `backup-json/` (never deleted) so a pairing is not lost.
- Import is skipped once `creds` exists in the DB, so it runs exactly once.
- A corrupt `auth.db` is renamed aside (`auth.db.corrupt-<ts>`) and a fresh
  session starts, rather than bricking every boot.
- `BufferJSON.reviver` returns real `Buffer`s, so tests must compare
  `[...buf]`, not `buf.data`.

## Repo conventions

- Code comments in the source are Arabic; commit messages and `AGENTS.md` are English.
- Never commit `database/sessions-taib/`, `*.db`, `.env`, or `test-session/` (all gitignored).
- Workflow used so far: branch → PR (draft) → mark ready → squash-merge into `main`.
  `gh` CLI is not authenticated; use the REST/GraphQL API with `$GITHUB_TOKEN`.
