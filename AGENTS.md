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
test-connection.js            standalone connection / pairing test
```

## Commands

- `npm run build` — syntax-checks every source file (including `test-connection.js`). Run this before committing.
- `npm start` — boots the bot (`index.js`).
- `node test-connection.js <phone>` — standalone connection test in an isolated `test-session/`.

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

## Environment gotcha

WhatsApp terminates web-client sessions from **datacenter IPs** — the socket opens,
then closes ~250–600ms later with a raw `1006` the moment handshake data is sent.
In such an environment pairing succeeds only occasionally (a race), for both the
pairing and QR flows. This is **not a code bug**. `test-connection.js` prints the
egress IP so this is obvious; run the bot on a residential/real host to pair.

## Repo conventions

- Code comments in the source are Arabic; commit messages and `AGENTS.md` are English.
- Never commit `database/sessions-taib/`, `*.db`, `.env`, or `test-session/` (all gitignored).
- Workflow used so far: branch → PR (draft) → mark ready → squash-merge into `main`.
  `gh` CLI is not authenticated; use the REST/GraphQL API with `$GITHUB_TOKEN`.
