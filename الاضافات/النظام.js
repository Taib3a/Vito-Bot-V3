import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { randomBytes } from "crypto";
import { mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import qrcode from "qrcode-terminal";
import log from "./الكونسل.js";
import { readMessages } from "./الاعدادات.js";
import { useSQLiteAuthState, clearSocketKeys } from "./الجلسة.js";
import { createPrompter, promptConnectionMethod, promptPhoneNumber } from "./الادخال.js";
import { handleMessage, runAntiFeaturesOnEvent } from "./المعالج.js";
import { isGroupActive, registerGroup } from "./القاعدة.js";
import { updateSubBotStatus } from "../database/db.js";
import { getGroupName, getUserName, getMessageType, getMessageContent } from "./معلومات-الرسالة.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Sessions live in a plain `sessions/` folder at the project root, mirroring the
// reference, so `sessions/main/auth.db` is easy to find and inspect.
const SESSIONS_BASE = join(__dirname, "..", "sessions");
export const MAIN_AUTH_FOLDER = join(SESSIONS_BASE, "main");
const SUB_AUTH_FOLDER = join(SESSIONS_BASE, "subbots");

// WhatsApp needs a moment after the handshake before it accepts the pairing iq
// node. The reference waits 3000ms here and pairs reliably.
const PAIRING_DELAY_MS = 3000;
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;
// Drop a socket that never reaches "open" and let the close handler retry.
const CONNECTION_TIMEOUT_MS = 75000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One reconnect at a time per session folder. Baileys can emit several closes
// (e.g. 428 followed by 515) for a single failure; without this, two connect()
// calls race and both re-read the auth db.
const reconnectLocks = new Set();

/** Bare digits only — requestPairingCode expects the number without separators. */
const cleanPhoneNumber = (value) => String(value ?? "").replace(/\D/g, "");

/**
 * Build an 8-character pairing code.
 *
 * The reference library ships a fixed list of codes and picks one at random,
 * which means every install shows the same handful of codes. It accepts a custom
 * code of exactly 8 chars, so generate a fresh one per pairing instead. Crockford
 * base32 (no I, L, O, U) keeps the code unambiguous to read aloud.
 */
const PAIRING_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTVWXYZ";

function generatePairingCode() {
  const bytes = randomBytes(8);
  let code = "";
  for (const byte of bytes) code += PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length];
  return code;
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

/**
 * Connect one WhatsApp socket, mirroring the reference's createConnection:
 *
 * - the 1/2 prompt is asked here, only for the main bot, only on the first
 *   attempt, and only when the session is not registered yet;
 * - a reconnect keeps the cached socket keys, except on a bad-session close
 *   (`wipeKeys`), where a stale key store is what breaks the handshake;
 * - there is no timer that wipes the session while a code is on screen.
 */
export async function connect({
  method = null,
  phoneNumber = null,
  isSubBot = false,
  subBotPhone = null,
  attempt = 0,
  wipeKeys = false,
} = {}) {
  const authFolder = resolveAuthFolder(isSubBot, subBotPhone);
  const label = isSubBot && subBotPhone ? subBotPhone : "MAIN";

  // Only wipe cached keys when the previous attempt actually failed the
  // handshake. Wiping on every retry is what broke post-pairing sync: right
  // after linking, WhatsApp closes with 515 (restartRequired) and we must
  // reconnect *with the keys we just wrote*, not without them.
  if (attempt > 0 && wipeKeys) {
    log.warn(`[${label}] تنظيف مفاتيح الجلسة قبل إعادة الاتصال...`);
    clearSocketKeys(authFolder);
  }
  if (attempt > 0) {
    // Always back off, even when the counter was reset: reconnecting instantly
    // after 515 is what produced the tight "re-reading the session" loop.
    const delay = Math.min(RECONNECT_DELAY_MS * Math.max(attempt, 1), MAX_RECONNECT_DELAY_MS);
    log.info(`[${label}] إعادة الاتصال بعد ${delay / 1000}s...`);
    await sleep(delay);
  }

  await mkdir(authFolder, { recursive: true });
  const { state: authState, saveCreds } = await useSQLiteAuthState(authFolder);
  const { version } = await fetchLatestBaileysVersion();

  // Ask only when the main session is not linked yet and no method was passed.
  if (!isSubBot && !authState.creds.registered && attempt === 0 && !method) {
    const prompter = createPrompter();
    const chosen = await promptConnectionMethod(prompter);
    if (chosen === null) {
      prompter.close();
      log.error("No input received. Run the bot from an interactive terminal.", "النظام.js");
      process.exit(1);
    }
    if (chosen === "pairing") {
      const phone = await promptPhoneNumber(prompter);
      if (phone === null) {
        prompter.close();
        log.error("Phone number is required for pairing code.", "النظام.js");
        process.exit(1);
      }
      method = "pairing";
      phoneNumber = phone;
    } else {
      method = "qr";
    }
    prompter.close();
  }

  const useCode = method === "pairing" && !!phoneNumber && !authState.creds.registered;

  let connected = false;
  const pendingMessages = [];
  const msgStore = new Map();
  const MAX_STORE_SIZE = 500;
  let connectionTimeout = null;
  let pairingCode = null;
  let sock;

  const cacheMessage = (msg) => {
    if (!msg?.key?.id) return;
    msgStore.set(`${msg.key.remoteJid}:${msg.key.id}`, msg);
    if (msgStore.size > MAX_STORE_SIZE) msgStore.delete(msgStore.keys().next().value);
  };

  const clearConnTimeout = () => {
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }
  };

  const flushPending = () => {
    const queue = pendingMessages.splice(0);
    for (const msg of queue) {
      handleMessage(sock, msg).catch((e) => log.error(`Queued message error: ${e.message}`, "النظام.js"));
    }
  };

  // One place that re-enters connect(), so every close reason uses the same
  // guard. resetAttempt is for 515: the link succeeded, so the retry budget
  // must start over rather than counting that close against the limit.
  const reconnect = ({ wipeKeys = false, resetAttempt = false } = {}) => {
    if (reconnectLocks.has(authFolder)) return;
    reconnectLocks.add(authFolder);
    connect({
      method,
      phoneNumber,
      isSubBot,
      subBotPhone,
      attempt: resetAttempt ? 0 : attempt + 1,
      wipeKeys,
    })
      .catch((e) => log.error(`[${label}] فشل إعادة الاتصال: ${e.message}`, "النظام.js"))
      .finally(() => reconnectLocks.delete(authFolder));
  };

  try {
    sock = makeWASocket({
      version,
      auth: {
        creds: authState.creds,
        keys: makeCacheableSignalKeyStore(authState.keys, pino({ level: "silent" })),
      },
      printQRInTerminal: !useCode,
      logger: pino({ level: "silent" }),
      // The reference pairs as Ubuntu/Chrome and reconnects as a desktop app.
      browser: useCode ? ["Ubuntu", "Chrome", "20.0.04"] : ["VitoBot", "Chrome", "3.0.0"],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: true,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      retryRequestDelayMs: 3000,
      defaultQueryTimeoutMs: 60000,
      // A retried message must be re-decryptable, so keep the last messages.
      getMessage: async (key) => msgStore.get(`${key.remoteJid}:${key.id}`)?.message,
    });
  } catch (err) {
    log.error(`[${label}] فشل إنشاء الاتصال: ${err.message}`, "النظام.js");
    if (attempt < MAX_RECONNECT_ATTEMPTS) {
      return reconnect({});
    }
    return { sock: null, pairingCode: null };
  }

  if (useCode) {
    // Send the pairing iq only after the handshake settles.
    await sleep(PAIRING_DELAY_MS);
    try {
      pairingCode = await sock.requestPairingCode(cleanPhoneNumber(phoneNumber), generatePairingCode());
      log.pairingCode(pairingCode);
    } catch (err) {
      log.error(`[${label}] تعذّر طلب رمز الاقتران: ${err.message}`, "النظام.js");
    }
  }

  connectionTimeout = setTimeout(() => {
    if (!connected) {
      log.warn(`[${label}] انتهت مهلة الاتصال — إعادة المحاولة...`);
      try {
        sock.end(new Error("timeout"));
      } catch {
        // socket already gone
      }
    }
  }, CONNECTION_TIMEOUT_MS);
  connectionTimeout.unref?.();

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      log.connection("qr");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "connecting") {
      log.connection("connecting");
    }

    if (connection === "open") {
      clearConnTimeout();
      connected = true;
      log.connection("open", "𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹 is ready!");
      flushPending();
      if (isSubBot && subBotPhone) {
        try {
          await updateSubBotStatus(subBotPhone, "connected");
        } catch {
          // status update is best-effort
        }
      }
    }

    if (connection === "close") {
      clearConnTimeout();
      connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || "unknown";
      log.connection("close", `code ${code} — ${reason}`);

      if (code === DisconnectReason.loggedOut) {
        log.error(`تم تسجيل الخروج. احذف مجلد الجلسة ثم أعد التشغيل.`, "النظام.js");
        if (isSubBot && subBotPhone) {
          try {
            await updateSubBotStatus(subBotPhone, "disconnected");
          } catch {
            // best-effort
          }
        }
        return;
      }

      if (code === DisconnectReason.connectionReplaced) {
        log.error(`تم استبدال الجلسة بأخرى. الإيقاف.`, "النظام.js");
        return;
      }

      if (code === DisconnectReason.badSession) {
        log.error(`جلسة تالفة — تنظيف وإعادة الاتصال...`, "النظام.js");
        return reconnect({ wipeKeys: true });
      }

      // 515 arrives right after a successful link: WhatsApp wants a fresh
      // socket, and the credentials written during pairing must be kept.
      if (code === DisconnectReason.restartRequired) {
        log.info(`[${label}] إعادة تشغيل مطلوبة — إعادة الاتصال بالجلسة المحفوظة...`);
        return reconnect({ resetAttempt: true });
      }

      if (attempt < MAX_RECONNECT_ATTEMPTS) {
        log.info(`[${label}] إعادة الاتصال (${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
        reconnect({});
      } else {
        log.error(`[${label}] استُنفدت محاولات إعادة الاتصال.`, "النظام.js");
      }
    }
  });

  sock.ev.on("CB:stream:error", (err) => {
    log.error(`[${label}] خطأ في التدفق: ${err?.message || err}`, "النظام.js");
  });

  sock.ws?.on?.("error", (err) => {
    log.error(`[${label}] خطأ في WebSocket: ${err?.message || err}`, "النظام.js");
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key?.remoteJid === "status@broadcast") continue;

      cacheMessage(msg);

      if (!msg.key.fromMe) {
        logIncomingMessage(msg);
        if (readMessages) sock.readMessages([msg.key]).catch(() => {});
      }

      // Hold messages that arrive before "open", then replay them.
      if (!connected) {
        pendingMessages.push(msg);
        continue;
      }

      handleMessage(sock, msg).catch((e) => log.error(`Message error: ${e.message}`, "النظام.js"));
    }
  });

  wireGroupEvents(sock);

  return { sock, pairingCode };
}
