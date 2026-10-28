import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import pino from "pino";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import log from "./الكونسل.js";
import { useSQLiteAuthState } from "./الجلسة.js";
import { handleMessage, runAntiFeaturesOnEvent } from "./المعالج.js";
import { isGroupActive, registerGroup } from "./القاعدة.js";
import { updateSubBotStatus } from "../database/db.js";
import { getGroupName, getUserName, getMessageType, getMessageContent } from "./معلومات-الرسالة.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSIONS_BASE = join(__dirname, "..", "database", "sessions-taib");
const MAIN_AUTH_FOLDER = join(SESSIONS_BASE, "رئيسي");
const SUB_AUTH_FOLDER = join(SESSIONS_BASE, "فرعي");

// WhatsApp closes an unregistered socket a few hundred ms after the handshake
// if no pairing request arrives. The pairing iq node must therefore be sent as
// soon as the socket opens — any artificial delay races that timeout and
// produces a 428 ("Connection Closed").
const PAIRING_DELAY_MS = 0;

// How long to wait for the user to type the code into WhatsApp before ending
// the socket and requesting a fresh one. WhatsApp itself expires the code.
const PAIRING_TIMEOUT_MS = 75000;
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;
const SOCKET_OPEN_TIMEOUT_MS = 15000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Auth folders for which a pairing code was already issued successfully.
// Prevents a reconnect from minting a second code while the user is typing it.
const pairingRequested = new Set();

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

/**
 * Resolve once the underlying websocket is open.
 *
 * requestPairingCode() sends an iq node immediately and throws a 428
 * ("Connection Closed") if the socket is not open yet, so we must not
 * request a code until this resolves.
 */
function waitForSocketOpen(sock, timeoutMs = SOCKET_OPEN_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (sock.ws?.isOpen) return resolve(true);

    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
      if (sock.ws?.isOpen) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error(`socket did not open within ${timeoutMs}ms`));
      }
    }, 100);
  });
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

function wireMessageEvents(sock) {
  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      logIncomingMessage(msg);
      await handleMessage(sock, msg);
    }
  });
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

function wireConnectionEvents(sock, { method, phoneNumber, isSubBot, subBotPhone, attempt = 0, sessionKey }) {
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
      if (sock.authState?.creds?.registered) pairingRequested.delete(sessionKey);
      log.connection("open", "𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹 is ready!");
      if (isSubBot && subBotPhone) {
        try {
          await updateSubBotStatus(subBotPhone, "connected");
        } catch {
          // status update is best-effort
        }
      }
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      // While a pairing code is outstanding, a close is expected: the server
      // drops the socket after the handshake and again once the phone links.
      // Report it quietly so the user sees the code, not a red error box.
      const pairing = method === "pairing" && pairingRequested.has(sessionKey);
      log.connection(
        "close",
        pairing
          ? `code ${code} — waiting for pairing`
          : `code ${code}${shouldReconnect ? " — reconnecting" : " — logged out"}`
      );

      if (!shouldReconnect) {
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

      // Back off before reconnecting. Reconnecting immediately (e.g. on a
      // 428 connectionClosed) can spin in a tight loop against the server, and
      // an unbounded loop hammers it forever when the network never recovers.
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
  const { state, saveCreds } = await useSQLiteAuthState(authFolder);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: Browsers.macOS("Desktop"),
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    retryRequestDelayMs: 3000,
    defaultQueryTimeoutMs: 60000,
  });

  sock.ev.on("creds.update", saveCreds);
  activeSockets.set(authFolder, sock);

  wireMessageEvents(sock);
  wireGroupEvents(sock);
  wireConnectionEvents(sock, { method, phoneNumber, isSubBot, subBotPhone, attempt, sessionKey: authFolder });

  // A pairing code has already been obtained if the session is registered
  // OR we have already successfully requested a code for this session.
  //
  // We track success ourselves instead of trusting creds.me: Baileys sets
  // creds.me *before* it sends the pairing iq node, so a request that fails
  // (e.g. the socket dropped first) would otherwise look "done" and block
  // every retry. Keying on the auth folder also survives reconnects.
  const sessionKey = authFolder;
  const alreadyPairing = !!sock.authState?.creds?.registered || pairingRequested.has(sessionKey);

  if (method === "pairing" && phoneNumber && !alreadyPairing) {
    try {
      // Wait for the websocket handshake, then send the pairing iq node
      // immediately — the server drops an idle unregistered socket.
      await waitForSocketOpen(sock);
      await sleep(PAIRING_DELAY_MS);
      const code = await sock.requestPairingCode(phoneNumber);
      pairingRequested.add(sessionKey);
      log.pairingCode(code);
      startPairingGrace(sessionKey);
      return { sock, pairingCode: code };
    } catch (err) {
      // Not recorded as requested, so the next reconnect retries. On flaky
      // networks the first attempt often loses the race against the drop, so
      // log it quietly and let the reconnect try again instead of showing the
      // user a red error box.
      log.warn(`Pairing attempt failed (${err.message}) — retrying...`);
    }
  }

  return { sock, pairingCode: null };
}
