import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  initAuthCreds,
  BufferJSON,
  proto,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { mkdir } from "fs/promises";
import path from "path";
import fs from "fs";
import qrcode from "qrcode-terminal";
import { randomBytes } from "crypto";
import { log } from "./logger.js";
import { openDatabase } from "./sqlite.js";
import { askPairingDetails } from "./prompt.js";
import config from "./settings.js";
import { handleMessage, registerGroupCacheEvents } from "./messageHandler.js";
import { registerAntifeatures } from "./مضاد/index.js";
import { initButtons } from "./buttons.js";

// واتساب يحتاج لحظة بعد المصافحة قبل أن يقبل طلب الاقتران.
const PAIRING_DELAY_MS = 3000;
// لا تُغلق إلا مقبساً لم يُفتح قط وليس في انتظار رمز اقتران.
const CONNECTION_TIMEOUT_MS = 75_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** إعادة اتصال واحدة لكل مجلد جلسة، فلا يتسابق إغلاقان. */
const reconnectLocks = new Set();

const PAIRING_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTVWXYZ";

/** Crockford base32 (بلا I وL وO وU) — سهل القراءة صوتياً ولا يتشابه حرفاه. */
function generatePairingCode() {
  const bytes = randomBytes(8);
  let code = "";
  for (const byte of bytes) code += PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length];
  return code;
}

export async function useSQLiteAuthState(sessionDir) {
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  const authDb = openDatabase(path.join(sessionDir, "auth.db"));
  authDb.pragma("journal_mode = WAL");
  authDb.exec(`CREATE TABLE IF NOT EXISTS auth (id TEXT PRIMARY KEY, data TEXT)`);

  const readData = (id) => {
    const row = authDb.prepare("SELECT data FROM auth WHERE id = ?").get(id);
    return row ? JSON.parse(row.data, BufferJSON.reviver) : null;
  };

  const writeData = (data, id) => {
    authDb
      .prepare("INSERT OR REPLACE INTO auth (id, data) VALUES (?, ?)")
      .run(id, JSON.stringify(data, BufferJSON.replacer));
  };

  const removeData = (id) => authDb.prepare("DELETE FROM auth WHERE id = ?").run(id);

  const creds = readData("creds") || initAuthCreds();
  // الحفظ فوراً حتى يحمل ملف الجلسة بيانات الاعتماد دائماً، حتى لو لم تصل
  // المصافحة إلى حد إطلاق creds.update.
  writeData(creds, "creds");

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          ids.forEach((id) => {
            let value = readData(`${type}-${id}`);
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          });
          return data;
        },
        set: async (data) => {
          for (const cat in data) {
            for (const id in data[cat]) {
              const val = data[cat][id];
              if (val) writeData(val, `${cat}-${id}`);
              else removeData(`${cat}-${id}`);
            }
          }
        },
      },
    },
    saveCreds: () => writeData(creds, "creds"),
    closeDb: () => {
      try {
        authDb.close();
      } catch {}
    },
  };
}

export async function clearSocketFiles(sessionDir) {
  try {
    const dbPath = path.join(sessionDir, "auth.db");
    if (fs.existsSync(dbPath)) {
      const db = openDatabase(dbPath);
      const result = db.prepare("DELETE FROM auth WHERE id != 'creds'").run();
      if (result.changes > 0) {
        log.warn(`🗑️ نُظّفت ${result.changes} مفاتيح قديمة من [${path.basename(sessionDir)}]`);
      }
      db.close();
    }
  } catch (e) {
    log.error(`تعذّر تنظيف مفاتيح الجلسة: ${e.message}`);
  }
}

export async function createConnection({
  sessionDir = config.sessionDir,
  botLabel = "MAIN",
  isSubbot = false,
  phoneNumber = null,
  _attempt = 0,
  wipeKeys = false,
} = {}) {
  await mkdir(sessionDir, { recursive: true });

  // لا تمسح المفاتيح إلا بطلب صريح: بعد الربط مباشرة يُغلق واتساب برمز 515
  // وعلينا إعادة الاتصال *بالمفاتيح* المكتوبة للتو. مسحها في إعادة محاولة عادية
  // يُبقي creds.registered صحيحاً بلا مفاتيح، فيُفتح المقبس دون فك أي تشفير.
  if (_attempt > 0) {
    if (wipeKeys) {
      log.warn(`[${botLabel}] تنظيف مفاتيح الجلسة قبل إعادة الاتصال...`);
      await clearSocketFiles(sessionDir);
    }
    const delay = Math.min(config.reconnectDelay * Math.max(_attempt, 1), 30000);
    log.info(`[${botLabel}] إعادة الاتصال بعد ${delay / 1000} ث...`);
    await sleep(delay);
  }

  const { state, saveCreds, closeDb } = await useSQLiteAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  let useCode = false;
  let phone = phoneNumber;

  if (!isSubbot && !state.creds.registered && _attempt === 0 && !phoneNumber) {
    const { method, phone: chosenPhone } = await askPairingDetails();

    if (method === "1") {
      useCode = true;
      phone = chosenPhone;
      if (!phone) {
        log.error("رقم الهاتف مطلوب للاقتران.", "connection.js");
        return;
      }
    } else if (method === null) {
      log.warn("لا إدخال متاح (stdin مغلق) — استخدم رمز QR.");
    }
  }

  let sock;
  let connectionTimeout = null;
  let connected = false;
  const pendingMessages = [];

  const msgStore = new Map();
  const MAX_STORE_SIZE = 500;

  function cacheMessage(msg) {
    if (!msg?.key?.id) return;
    msgStore.set(`${msg.key.remoteJid}:${msg.key.id}`, msg);
    if (msgStore.size > MAX_STORE_SIZE) msgStore.delete(msgStore.keys().next().value);
  }

  function clearConnTimeout() {
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }
  }

  async function flushPending() {
    const queue = pendingMessages.splice(0);
    for (const { msg, label } of queue) {
      handleMessage(sock, msg, label).catch((e) =>
        log.error(`[${label}] خطأ في رسالة مؤجلة: ${e.message}`)
      );
    }
  }

  const reconnect = ({ wipe = false, resetAttempt = false } = {}) => {
    if (reconnectLocks.has(sessionDir)) return;
    reconnectLocks.add(sessionDir);
    createConnection({
      sessionDir,
      botLabel,
      isSubbot,
      phoneNumber,
      _attempt: resetAttempt ? 0 : _attempt + 1,
      wipeKeys: wipe,
    })
      .catch((e) => log.error(`[${botLabel}] فشل إعادة الاتصال: ${e.message}`))
      .finally(() => reconnectLocks.delete(sessionDir));
  };

  try {
    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      printQRInTerminal: !useCode,
      logger: pino({ level: "silent" }),
      browser: useCode ? ["Ubuntu", "Chrome", "20.0.04"] : ["VitoBot", "Chrome", "3.0.0"],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: true,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      retryRequestDelayMs: 3000,
      defaultQueryTimeoutMs: 60000,
      getMessage: async (key) => msgStore.get(`${key.remoteJid}:${key.id}`)?.message || undefined,
    });
  } catch (e) {
    try {
      closeDb();
    } catch {}
    log.error(`[${botLabel}] فشل إنشاء الاتصال: ${e.message}`);
    if (_attempt < config.maxReconnectAttempts) return reconnect({});
    return;
  }

  sock.sessionDir = sessionDir;

  const waitingForPairing = useCode && !state.creds.registered;

  if (waitingForPairing && phone) {
    await sleep(PAIRING_DELAY_MS);
    try {
      let code = await sock.requestPairingCode(phone, generatePairingCode());
      // قد تُعيد المكتبة الرمز بواصلة أصلاً؛ نزيلها أولاً حتى لا يُنتج
      // التجميع "ABCD--EFGH".
      code = String(code || "").replace(/[^0-9A-Za-z]/g, "");
      code = code.match(/.{1,4}/g)?.join("-") || code;
      log.pairingCode(code);
    } catch (e) {
      log.error(`[${botLabel}] تعذّر طلب رمز الاقتران: ${e.message}`);
    }
  }

  // لا تُفعّل مهلة الاتصال إلا عندما لا ننتظر رمز اقتران:
  // فبينما يكتب المستخدم الرمز يكون المقبس غير مفتوح بحق، و
  // killing it there is what produced a spurious "انتهت مهلة الاتصال".
  if (!waitingForPairing) {
    connectionTimeout = setTimeout(() => {
      if (!connected) {
        log.warn(`[${botLabel}] انتهت مهلة الاتصال — إعادة المحاولة...`);
        try {
          sock.end(new Error("timeout"));
        } catch {}
      }
    }, CONNECTION_TIMEOUT_MS);
    connectionTimeout.unref?.();
  }

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      log.conn(`[${botLabel}] رمز QR جاهز للمسح`);
      qrcode.generate(qr, { small: true });
    }

    if (connection === "connecting") log.conn(`[${botLabel}] جارٍ الاتصال...`);

    if (connection === "open") {
      clearConnTimeout();
      connected = true;
      log.ok(`[${botLabel}] ✅ متصل → ${sock.user?.id}`);
      await flushPending();
    }

    if (connection === "close") {
      clearConnTimeout();
      connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || "غير معروف";
      log.warn(`[${botLabel}] ❌ انقطع الاتصال → الرمز: ${code} | ${reason}`);

      if (code === DisconnectReason.loggedOut) {
        log.error(
          `[${botLabel}] تم تسجيل الخروج. احذف "auth.db" من مجلد "${path.basename(sessionDir)}" وأعد التشغيل.`
        );
        try {
          closeDb();
        } catch {}
        return;
      }

      if (code === DisconnectReason.connectionReplaced) {
        log.error(`[${botLabel}] تم استبدال الجلسة بأخرى. الإيقاف.`);
        try {
          closeDb();
        } catch {}
        return;
      }

      try {
        closeDb();
      } catch {}

      if (code === DisconnectReason.badSession) {
        log.error(`[${botLabel}] جلسة تالفة — تنظيف وإعادة الاتصال...`);
        return reconnect({ wipe: true });
      }

      // يصل 515 بعد ربط ناجح مباشرة: أعد الاتصال بالجلسة المحفوظة
      // وابدأ ميزانية المحاولات من جديد.
      if (code === DisconnectReason.restartRequired) {
        log.info(`[${botLabel}] إعادة تشغيل مطلوبة — إعادة الاتصال بالجلسة المحفوظة...`);
        return reconnect({ resetAttempt: true });
      }

      if (_attempt < config.maxReconnectAttempts) {
        log.info(`[${botLabel}] إعادة الاتصال (${_attempt + 1}/${config.maxReconnectAttempts})...`);
        reconnect({});
      } else {
        log.error(`[${botLabel}] استُنفدت محاولات إعادة الاتصال.`);
      }
    }
  });

  sock.ev.on("CB:stream:error", (err) => {
    log.error(`[${botLabel}] خطأ في التدفق: ${err?.message || err}`);
  });

  sock.ws?.on?.("error", (err) => {
    log.error(`[${botLabel}] خطأ في WebSocket: ${err?.message || err}`);
  });

  sock.ev.on("creds.update", saveCreds);

  registerGroupCacheEvents(sock);
  registerAntifeatures(sock, botLabel);
  // يضيف sock.sendButtonMessage — انظر core/buttons.js.
  initButtons(sock);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key?.remoteJid === "status@broadcast") continue;
      // مجموعات فقط: لا تُخزَّن ولا تُعالَج رسائل الخاص إطلاقاً.
      if (config.groupsOnly && !msg.key?.remoteJid?.endsWith("@g.us")) continue;

      cacheMessage(msg);

      if (!connected) {
        pendingMessages.push({ msg, label: botLabel });
        continue;
      }

      handleMessage(sock, msg, botLabel).catch((e) =>
        log.error(`[${botLabel}] خطأ في رسالة: ${e.message}`)
      );
    }
  });

  return sock;
}
