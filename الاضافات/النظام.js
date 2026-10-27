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
import { botName } from "./الاعدادات.js";
import log from "./الكونسل.js";
import { handleMessage, runAntiFeaturesOnEvent } from "./المعالج.js";
import { isGroupActive, registerGroup } from "./القاعدة.js";
import { updateSubBotStatus } from "../database/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_FOLDER = join(__dirname, "..", "database", "sessions-taib", "رئيسي");

function getGroupName(msg) {
  if (!msg?.key?.remoteJid?.endsWith("@g.us")) return "Private";
  return msg.key.remoteJid.split("@")[0];
}

function getUserName(msg) {
  return msg?.pushName || msg?.key?.participant?.split("@")[0] || "Unknown";
}

function getMessageType(msg) {
  if (!msg?.message) return "unknown";
  const types = Object.keys(msg.message);
  if (types.includes("conversation")) return "text";
  if (types.includes("extendedTextMessage")) return "text";
  if (types.includes("imageMessage")) return "image";
  if (types.includes("videoMessage")) return "video";
  if (types.includes("audioMessage")) return "audio";
  if (types.includes("stickerMessage")) return "sticker";
  if (types.includes("documentMessage")) return "document";
  if (types.includes("contactMessage")) return "contact";
  return types[0] || "unknown";
}

function getMessageContent(msg) {
  return (
    msg?.message?.conversation ||
    msg?.message?.extendedTextMessage?.text ||
    msg?.message?.imageMessage?.caption ||
    msg?.message?.videoMessage?.caption ||
    ""
  );
}

export async function connect({ method, phoneNumber, isSubBot = false, subBotPhone = null }) {
  const { version, isLatest } = await fetchLatestBaileysVersion();
  log.info(`Baileys v${version} (${isLatest ? "latest" : "current"})`);

  let authFolder = AUTH_FOLDER;
  if (isSubBot && subBotPhone) {
    authFolder = join(__dirname, "..", "database", "sessions-taib", "فرعي", subBotPhone);
  }

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

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

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

      await handleMessage(sock, msg);
    }
  });

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

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr && method === "qr") {
      log.connection("qr");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "connecting") {
      log.connection("connecting");
    }

    if (connection === "open") {
      log.connection("open", `𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹 is ready!`);
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
