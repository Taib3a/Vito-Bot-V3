# AGENTS.md

Project memory for **Vito-Bot-V3** — an Arabic WhatsApp bot on Baileys (ESM, SQLite).

The structure mirrors `DuarteXV/Yuta-Okkotsu-Bot-MD`, but the code, messages and
command names are Arabic and the library is the maintained `baileys-nextgen`.

## Layout

```
index.js                      entry point — warning filter, crash net, boot
config.js                     bot name, prefix, owner numbers
core/
  connection.js               pairing + connection + reconnect  ← the tricky part
  prompt.js                   buffered stdin prompts (method + phone)
  messageHandler.js           permission model + command routing
  pluginLoader.js             loads plugins/, registers Arabic aliases
  aliases.js                  Arabic name → canonical plugin name
  buttons.js                  interactive buttons / lists (native flow)
  subbotManager.js            subbots (extra paired numbers)
  logger.js                   console output
  economy.js xp.js gamedata.js
  sqlite.js                   node:sqlite wrapper
  مضاد/                       anti-features — one flat file per anti-feature
    index.js                  loader + runAntifeatures + registerAntifeatures
    مضاد-روابط.js             anti-link       (flag: antilink)
    مضاد-سبام.js              anti-spam       (flag: antispam)
    مضاد-بوتات.js             anti-bots       (flag: antibot)
    ترحيب-وداع.js             welcome/goodbye (flag: welcome)
database/db.js                users / groups / bots store (node:sqlite)
plugins/<category>/*.js       all commands, auto-loaded (105 files)
sessions/main/auth.db         the live session (gitignored)
```

## Commands

- `npm start` — boots the bot.
- `npm run check` — syntax-checks every source file.
- CI (`.github/workflows/ci.yml`) runs the syntax check and a plugin-load +
  database round-trip on Node 22 and 24. There is no `npm test` script.

## Plugin contract

Every file under `plugins/` default-exports:

```js
export default {
  name: ["cmd", "alias"],   // first name is canonical
  category: "info",         // decides the menu section
  ownerOnly / adminOnly / botAdmin / modOnly / premiumOnly /
  groupOnly / privateOnly,  // any of these gate the command
  async run(ctx) { ... }
};
```

`ctx` gives `sock, msg, from, sender, senderNum, botJid, botLabel, isGroup,
groupName, groupMeta, body, args, text, usedPrefix, isOwner, isCoOwner, isMod,
isPremium, isAdmin, isBotAdmin, reply(), react(), resolveLid()`. Use `reply()`
rather than raw `sock.sendMessage` — it retries without `quoted` when a quote
fails, and it always mentions the sender.

### Arabic command names

Plugins keep their original names so upstream fixes stay applicable. Arabic
names live in `core/aliases.js` and are registered by `pluginLoader.js` after
loading. Add an entry there instead of editing a plugin's `name` field.

### Dynamic button ids

A plugin may declare `dynamicPrefixes: ["say_"]` to own a whole id namespace.
A click sends back e.g. `say_woody`, which is not a declared name; `findPlugin()`
matches it by prefix (longest wins) and routes it to the plugin. The plugin then
decides what the suffix means.

## Interactive buttons and lists

`core/buttons.js` sends reply buttons, url/copy/call buttons and dropdowns.

```js
import { sendButtons, sendList } from "../../core/buttons.js";

await sendButtons(sock, from, msg, {
  text: "choose", title: "Title", footer: "footer",
  image: "https://…",                       // optional header image
  buttons: [{ text: "Hi", id: ".hi" }],     // kind: reply|url|copy|call
});

await sendList(sock, from, msg, {
  text: "pick one", buttonText: "القائمة",
  sections: [{ title: "A", rows: [{ title: "x", description: "y", id: ".say_x" }] }],
});
```

**This build has no `sendButtonMessage`.** Buttons only render when the payload
is a `viewOnceMessage` wrapping an `interactiveMessage` with a
`nativeFlowMessage`, sent through `relayMessage` — which is exactly what this
module does. Do not look for the helper in Baileys; it is not there.

A click arrives as `interactiveResponseMessage.nativeFlowResponseMessage
.paramsJson` (`{"id":"…"}`), not as text. `messageHandler` runs it through
`extractButtonId()` and treats the id as the typed command, so `.say_woody` in a
button id behaves like the user typed it.

## Text-to-speech (`plugins/ia/انطق.js`)

`.انطق <نص>` (alias `say`) shows a menu of 42 cartoon voices, as pressable
buttons or a dropdown. Providers are tried in order — Fish Audio, then FakeYou,
then Uberduck — and the first that returns audio wins.

- API keys come from the environment (`FISH_API_KEY`, `FAYEYOU_COOKIE`,
  `UBERDUCK_API_KEY`) via `config.tts`. **Never hardcode a key in the repo.**
- Voice notes need opus, which needs the `ffmpeg` binary. When it is missing the
  audio is still sent, as mp3. `config.tts.ffmpegPath = false` disables the
  conversion outright.
- The text is stored per chat+sender for 30 minutes so the voice buttons still
  know what to say after the menu has scrolled away.

## The pairing flow

1. `askPairingDetails()` in `core/prompt.js` asks `1`/`2`, then the phone
   number, **on one prompter**. Two separate prompters lose the number: if the
   choice and the number arrive together (pasted, or a panel that delivers both
   lines at once), the first readline interface buffers the second line and
   drops it on close, so the phone question resolves empty.
2. The number is normalised to digits only, so `+967 738 512 629`,
   `967738512629` and `(967) 738-512-629` are all accepted (8–15 digits).
3. Wait `PAIRING_DELAY_MS` (3000ms), request the code, print **only** the code,
   then hold the socket for `PAIRING_GRACE_MS` (120s) so the user can link.
4. Never add a timer that wipes the session while a code is on screen.

## The anti-features section (`core/مضاد/`)

Group protections, one **flat `.js` file per anti-feature** inside
`core/مضاد/`. The loader discovers the files automatically — adding a
protection means dropping in a file, never editing the loader.

| File | Flag | Fires on |
|---|---|---|
| `مضاد-روابط.js` | `antilink` | message |
| `مضاد-سبام.js` | `antispam` | message |
| `مضاد-بوتات.js` | `antibot` | join |
| `ترحيب-وداع.js` | `welcome` | join + leave |

### One command controls them all

`plugins/grupos/مضاد.js` is the only toggle. It imports the registry from
`core/مضاد/index.js`, so a new anti-feature shows up in the panel and can be
switched on without touching the command.

```
.مضاد                show the panel (state of every anti-feature)
.تفعيل antilink      turn one on   (also: .مضاد on antilink)
.ايقاف antilink      turn one off  (also: .مضاد off antilink)
.تفعيل all           turn them all on
.ايقاف all           turn them all off
```

Either the Arabic name or the flag works as the target. Aliases: `مضادات`,
`حماية`, `antifeatures`, `تشغيل`, `تعطيل`.

### Contract

A module is the default export of its file in `core/مضاد/` (same shape the
old `core/antilink.js` used):

```js
export default {
  name: "مضاد-روابط",        // shown in the startup log
  flag: "antilink",           // db.getGroup(group).antilink gates it
  async check({ sock, msg, from, sender, body, isBotAdmin, botLabel }) {},
  async onJoin({ sock, groupJid, participants, isBotAdmin, botLabel }) {},
  async onLeave({ sock, groupJid, participants, isBotAdmin, botLabel }) {},
};
```

Only `name` is required. A module may implement `check`, `onJoin`, `onLeave`,
or any combination. `check` returns `true` to claim the message (it is then
not treated as a command); `false`/`undefined` to pass it on.

`runAntifeatures` runs every enabled `check` in order and stops at the first
claim. `registerAntifeatures(sock, label)` wires `group-participants.update`
and is called from both `core/connection.js` and `core/subbotManager.js`, so
subbots are protected too.

### Two rules learned the hard way

1. **Every call is wrapped in try/catch, per module.** A malformed event
   (`participants: null`) or one broken protection must log and continue —
   never throw. The previous version took the whole process down this way.
2. **Kicking needs the bot to be an admin.** Each module checks `isBotAdmin`
   itself and, when it is false, still deletes/warns and says why instead of
   failing silently on a `forbidden` from `groupParticipantsUpdate`.

## Post-pairing sync: the 515 trap

Right after a successful link WhatsApp closes the socket with **515
(`restartRequired`)** and expects a reconnect. Two bugs here caused "linked but
does not read, re-reads the session forever":

1. **Wiping keys on every retry.** `clearSocketFiles` deletes every `auth` row
   *except* `creds`, so `creds.registered` stays `true` while all Signal keys
   are gone — the socket opens but can never decrypt. Wiping now happens only
   when the caller asks (`wipeKeys: true`), which is the `badSession` path.
2. **Reconnecting with `_attempt: 0`.** The 515 path resets the counter, so the
   backoff became `5000 * 0 = 0ms` — an instant loop. The delay now has a floor
   of `config.reconnectDelay`.

`reconnect()` is the single re-entry point, guarded by a module-level
`reconnectLocks` set keyed by session folder: Baileys can emit several closes
for one failure and two concurrent `createConnection` calls both re-read the db.

### Reconnect rules

- `restartRequired` (515) → reconnect with the saved session, reset the attempt
  counter, keep the keys. This is the normal post-link path.
- `badSession` (500) → wipe keys, then reconnect.
- `loggedOut` (401) / `connectionReplaced` (440) → stop; do not loop.
- Everything else → backoff `reconnectDelay * attempt`, capped at 30s, up to
  `maxReconnectAttempts`.
- **Never** wipe keys on a plain retry.

## Database

`database/db.js` uses `node:sqlite` (built into Node), not `better-sqlite3`.
There is no native build step, so install cannot fail on a prebuilt-binary
mismatch. Users are keyed by **bare number** (`normalizeJid`), so
`123@s.whatsapp.net`, `123:5@s.whatsapp.net` and `123` are one row.

## Dependencies

```json
"@whiskeysockets/baileys": "npm:@muhammadridwanf61/baileys-nextgen@latest"
```

nextgen does **not** export `Button`, `Carousel` or `AIRich`. Plugins needing an
interactive list must render text instead (see `plugins/economy/comprarpersonaje.js`).
`plugins/owner/crash.js` from the reference was **not** ported — it is a
denial-of-service tool (floods a group to freeze clients).

## Environment gotcha

WhatsApp terminates web-client sessions from **datacenter IPs** — the socket
opens, then closes ~250–600ms later with a raw `1006`. Pairing then succeeds
only occasionally, for both the pairing and QR flows. This is **not a code bug**;
run on a residential host to pair. Check the egress IP with
`curl -s https://ipinfo.io/json`.

## Repo conventions

- Source comments are Arabic; commit messages and this file are English.
- Never commit `sessions/`, `tmp/`, `database/*.sqlite*`, `*.db`, `.env`.
- Workflow: branch → PR → CI green → squash-merge into `main`. `gh` is not
  authenticated; use the REST API with `$GITHUB_TOKEN` (merge via
  `PUT /pulls/:n/merge-async`, then poll `/pulls/:n/merge-async/:uuid`).
