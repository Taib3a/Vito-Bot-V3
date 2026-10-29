import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import pino from "pino";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import log from "./الكونسل.js";
import { useSQLiteAuthState, clearSocketKeys, resetSession } from "./الجلسة.js";
import { handleMessage, runAntiFeaturesOnEvent } from "./المعالج.js";
import { isGroupActive, registerGroup } from "./القاعدة.js";
import { updateSubBotStatus } from "../database/db.js";
import { getGroupName, getUserName, getMessageType, getMessageContent } from "./معلومات-الرسالة.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Sessions live in a plain `sessions/` folder at the project root, mirroring the
// Yuta reference, so `sessions/main/auth.db` is easy to find and inspect.
const SESSIONS_BASE = join(__dirname, "..", "sessions");
const MAIN_AUTH_FOLDER = join(SESSIONS_BASE, "main");
const SUB_AUTH_FOLDER = join(SESSIONS_BASE, "subbots");

// WhatsApp needs a moment after the handshake before it accepts the pairing iq
// node. Requesting the code too early is what produces the flood of 428
// ("Connection Closed") closes. The Yuta-Okkotsu reference waits 3000ms here
// and pairs reliably, so match it.
const PAIRING_DELAY_MS = 3000;

// How long the user has to enter the code before it is discarded and a fresh
// one is requested. Matches the Yuta reference (60s).
const PAIRING_TIMEOUT_MS = 60000;
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Auth folders for which a pairing code was already issued successfully.
// Prevents a reconnect from minting a second code while the user is typing it.
const pairingRequested = new Set();

// Auth folders that are mid-pairing (a code was requested and the phone has not
// linked yet). Distinct from pairingRequested: the grace timer clears that one
// so a fresh code can be minted, while this stays set so a 401 is treated as a
// rejected pairing rather than a real logout.
const pairingPhase = new Set();

// Live socket per auth folder, so the grace timer can end the *current* socket
// even if a reconnect replaced the one that issued the code.
const activeSockets = new Map();

// One grace timer per auth folder: started when a code is issued and cleared
// once the socket opens. If it fires, the user did not finish linking in time,
// so we drop the socket and let the reconnect request a fresh code.
const pairingGraceTimers = new Map();

function clearPairingGrace(sessionKey) {
  const timer = pairingGraceTimers.get(sessionKey);
  if (timer) {
    clearTimeout(timer);
    pairingGraceTimers.delete(sessionKey);
  }
}

/**
 * Start (or restart) the countdown that lets the user type the code into
 * WhatsApp. On expiry the code is abandoned and a fresh one is requested on the
 * next connection, which is how the user always has a valid code on screen.
 */
function startPairingGrace(sessionKey) {
  clearPairingGrace(sessionKey);
  const timer = setTimeout(() => {
    pairingGraceTimers.delete(sessionKey);
    pairingRequested.delete(sessionKey);
    log.warn("Pairing code expired — requesting a new one...");
    // The code expired with creds.me set but the session still unregistered.
    // Wipe it so the next connection is clean and does not get a 401 for a
    // half-finished login.
    resetSession(sessionKey);
    try {
      activeSockets.get(sessionKey)?.end(new Error("pairing timeout"));
    } catch {
      // socket already gone; the close handler will reconnect
    }
  }, PAIRING_TIMEOUT_MS);
  timer.unref?.();
  pairingGraceTimers.set(sessionKey, timer);
}

function resolveAuthFolder(isSubBot, subBotPhone) {
  if (isSubBot && subBotPhone) return join(SUB_AUTH_FOLDER, subBotPhone);
  return MAIN_AUTH_FOLDER;
}

function logIncomingMessage(msg) {
  try {
    log.message({
      time: new Date().toLocaleTimeString("en-GB"),
      groupName: getGroupName(msg),
      userName: getUserName(msg),
      messageType: getMessageType(msg),
      content: getMessageContent(msg) || `[${getMessageType(msg)}]`,
    });
  } catch {
    // logging should never crash the bot
  }
}

function wireMessageEvents(sock, state) {
  // Recent messages, so a retry can re-decrypt a message WhatsApp re-delivers.
  // Baileys asks for these through getMessage below; without them a retried
  // command silently fails to decrypt.
  const msgStore = new Map();
  const MAX_STORE_SIZE = 500;
  const cacheMessage = (msg) => {
    if (!msg?.key?.id) return;
    msgStore.set(`${msg.key.remoteJid}:${msg.key.id}`, msg);
    if (msgStore.size > MAX_STORE_SIZE) msgStore.delete(msgStore.keys().next().value);
  };

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    // Only live traffic. history/sync payloads would replay old commands.
    if (type && type !== "notify") return;

    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key.remoteJid === "status@broadcast") continue;

      cacheMessage(msg);

      // Commands sent from the owner's own phone arrive as fromMe; they must
      // still run, otherwise the bot ignores its own messages.
      if (!msg.key.fromMe) logIncomingMessage(msg);

      // Hold messages that arrive before the connection is fully open, then
      // replay them, so nothing sent during the handshake is lost.
      if (!state.connected) {
        state.pending.push(msg);
        continue;
      }

      await handleMessage(sock, msg);
    }
  });

  return { getMessage: async (key) => msgStore.get(`${key.remoteJid}:${key.id}`)?.message };
}

function wireGroupEvents(sock) {
  sock.ev.on("groups.update", async (updates) => {
    for (const update of updates) {
      const groupJid = update.id;
      if (!groupJid?.endsWith("@g.us")) continue;
      await registerGroup(groupJid);
      if (!(await isGroupActive(groupJid))) continue;
      await runAntiFeaturesOnEvent("onGroupUpdate", { sock, update });
    }
  });

  sock.ev.on("group-participants.update", async ({ id, participants, action }) => {
    const groupJid = id;
    if (!groupJid?.endsWith("@g.us")) return;
    await registerGroup(groupJid);
    if (!(await isGroupActive(groupJid))) return;
    await runAntiFeaturesOnEvent("onGroupParticipantsUpdate", {
      sock,
      groupJid,
      participants,
      action,
    });
  });
}

function wireConnectionEvents(sock, { method, phoneNumber, isSubBot, subBotPhone, attempt = 0, sessionKey, authFolder, state }) {
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr && method === "qr") {
      log.connection("qr");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "connecting") {
      log.connection("connecting");
    }

    if (connection === "open") {
      clearPairingGrace(sessionKey);
      // Registration is what ends the pairing phase. Until then keep the flag
      // so a close is still reported as "waiting for pairing".
      if (sock.authState?.creds?.registered) {
        pairingRequested.delete(sessionKey);
        pairingPhase.delete(sessionKey);
      }
      state.connected = true;
      log.connection("open", "𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹 is ready!");

      // Replay anything that arrived during the handshake.
      const queued = state.pending.splice(0);
      for (const msg of queued) {
        handleMessage(sock, msg).catch((err) => log.error(`Queued message error: ${err.message}`));
      }

      if (isSubBot && subBotPhone) {
        try {
          await updateSubBotStatus(subBotPhone, "connected");
        } catch {
          // status update is best-effort
        }
      }
    }

    if (connection === "close") {
      state.connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      const pairing = method === "pairing" && pairingPhase.has(sessionKey);
      log.connection(
        "close",
        pairing
          ? `code ${code} — waiting for pairing`
          : `code ${code}${shouldReconnect ? " — reconnecting" : " — logged out"}`
      );

      if (!shouldReconnect) {
        // A 401 while a pairing code is outstanding means the server rejected
        // the half-registered session, not that the user unlinked the phone.
        // Wipe it so the next attempt can request a fresh code; a genuine
        // logout (already registered) still stops and asks for a restart.
        if (pairing) {
          resetSession(authFolder);
          pairingRequested.delete(sessionKey);
          pairingPhase.delete(sessionKey);
          log.warn("Pairing rejected — starting a fresh session and requesting a new code...");
          await sleep(RECONNECT_DELAY_MS);
          connect({ method, phoneNumber, isSubBot, subBotPhone, attempt: 0 });
          return;
        }

        log.error("Logged out. Delete the session folder and restart.", "النظام.js");
        if (isSubBot && subBotPhone) {
          try {
            await updateSubBotStatus(subBotPhone, "disconnected");
          } catch {
            // best-effort
          }
        }
        return;
      }

      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        log.error(
          `Giving up after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts (code ${code}).`,
          "النظام.js"
        );
        return;
      }

      // Only a corrupt session needs its keys dropped. Clearing them on every
      // close would discard a pairing that is still in progress.
      if (code === DisconnectReason.badSession) {
        clearSocketKeys(authFolder);
      }

      // Back off before reconnecting so we never hammer the server.
      const delay = Math.min(RECONNECT_DELAY_MS * (attempt + 1), MAX_RECONNECT_DELAY_MS);
      log.info(`Reconnecting in ${delay}ms (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
      await sleep(delay);
      connect({ method, phoneNumber, isSubBot, subBotPhone, attempt: attempt + 1 });
    }
  });
}

export async function connect({ method, phoneNumber, isSubBot = false, subBotPhone = null, attempt = 0 }) {
  const { version, isLatest } = await fetchLatestBaileysVersion();
  log.info(`Baileys v${version.join(".")} (${isLatest ? "latest" : "current"})`);

  const authFolder = resolveAuthFolder(isSubBot, subBotPhone);
  const { state: authState, saveCreds } = await useSQLiteAuthState(authFolder);

  const useCode = method === "pairing" && !!phoneNumber;
  const conn = { connected: false, pending: [] };
  const sock = makeWASocket({
    version,
    auth: {
      creds: authState.creds,
      keys: makeCacheableSignalKeyStore(authState.keys, pino({ level: "silent" })),
    },
    printQRInTerminal: !useCode,
    logger: pino({ level: "silent" }),
    // WhatsApp expects a desktop browser string while pairing; the reference
    // uses Ubuntu/Chrome and pairs reliably.
    browser: useCode ? Browsers.ubuntu("Chrome") : Browsers.macOS("Desktop"),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    retryRequestDelayMs: 3000,
    defaultQueryTimeoutMs: 60000,
    getMessage: (key) => conn.getMessage(key),
  });

  sock.ev.on("creds.update", saveCreds);
  activeSockets.set(authFolder, sock);

  Object.assign(conn, wireMessageEvents(sock, conn));
  wireGroupEvents(sock);
  wireConnectionEvents(sock, {
    method,
    phoneNumber,
    isSubBot,
    subBotPhone,
    attempt,
    sessionKey: authFolder,
    authFolder,
    state: conn,
  });

  // A pairing code has already been obtained if the session is registered OR we
  // already requested a code and the user is still typing it. Trusting our own
  // flag (not creds.me) avoids minting a second code mid-pairing while still
  // retrying after a genuine failure.
  const sessionKey = authFolder;
  const alreadyPairing = !!sock.authState?.creds?.registered || pairingRequested.has(sessionKey);

  if (useCode && !alreadyPairing) {
    try {
      // WhatsApp needs a moment after the handshake before it accepts the
      // pairing iq node. Sending too early returns a code the phone rejects and
      // drops the socket repeatedly. The reference waits 3000ms here.
      await sleep(PAIRING_DELAY_MS);
      const code = await sock.requestPairingCode(phoneNumber);
      pairingRequested.add(sessionKey);
      pairingPhase.add(sessionKey);
      log.pairingCode(code);
      startPairingGrace(sessionKey);
      return { sock, pairingCode: code };
    } catch (err) {
      log.warn(`Pairing attempt failed (${err.message}) — retrying...`);
    }
  }

  return { sock, pairingCode: null };
}
