import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import pino from "pino";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import log from "./الكونسل.js";
import { handleMessage, runAntiFeaturesOnEvent } from "./المعالج.js";
import { isGroupActive, registerGroup } from "./القاعدة.js";
import { updateSubBotStatus } from "../database/db.js";
import { getGroupName, getUserName, getMessageType, getMessageContent } from "./معلومات-الرسالة.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSIONS_BASE = join(__dirname, "..", "database", "sessions-taib");
const MAIN_AUTH_FOLDER = join(SESSIONS_BASE, "رئيسي");
const SUB_AUTH_FOLDER = join(SESSIONS_BASE, "فرعي");

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

function wireConnectionEvents(sock, { method, phoneNumber, isSubBot, subBotPhone }) {
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr && method === "qr") {
      log.connection("qr");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "connecting") {
      log.connection("connecting");
    }

    if (connection === "open") {
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
      log.connection("close", `code ${code}${shouldReconnect ? " — reconnecting" : " — logged out"}`);

      if (shouldReconnect) {
        connect({ method, phoneNumber, isSubBot, subBotPhone });
      } else {
        log.error("Logged out. Delete the session folder and restart.", "النظام.js");
        if (isSubBot && subBotPhone) {
          try {
            await updateSubBotStatus(subBotPhone, "disconnected");
          } catch {
            // best-effort
          }
        }
      }
    }
  });
}

export async function connect({ method, phoneNumber, isSubBot = false, subBotPhone = null }) {
  const { version, isLatest } = await fetchLatestBaileysVersion();
  log.info(`Baileys v${version.join(".")} (${isLatest ? "latest" : "current"})`);

  const authFolder = resolveAuthFolder(isSubBot, subBotPhone);
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: Browsers.macOS("Desktop"),
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", saveCreds);

  wireMessageEvents(sock);
  wireGroupEvents(sock);
  wireConnectionEvents(sock, { method, phoneNumber, isSubBot, subBotPhone });

  if (method === "pairing" && phoneNumber) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const code = await sock.requestPairingCode(phoneNumber);
      log.success(`Pairing code: ${code}`);
      return { sock, pairingCode: code };
    } catch (err) {
      log.error(err.message, "النظام.js", err.stack);
    }
  }

  return { sock, pairingCode: null };
}
