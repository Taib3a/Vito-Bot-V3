import { log } from "../logger.js";
import { db } from "../../database/db.js";

const numOf = (jid = "") => String(jid).split("@")[0].split(":")[0];
const cooldown = new Map();
const COOLDOWN_MS = 60_000;

function isActiveBot(sender) {
  const num = numOf(sender);
  if (!num) return false;
  if (String(global.mainBotNum || "") === num) return true;
  for (const bot of global.activeBots?.values?.() || []) {
    if (numOf(bot?.jid) === num) return true;
  }
  return false;
}

function contextInfoOf(msg) {
  const message = msg?.message || {};
  for (const type of [
    "extendedTextMessage",
    "imageMessage",
    "videoMessage",
    "documentMessage",
    "audioMessage",
    "stickerMessage",
  ]) {
    const info = message[type]?.contextInfo;
    if (info) return info;
  }
  return null;
}

export function isChannelForward(msg) {
  const info = contextInfoOf(msg);
  const from = String(msg?.key?.remoteJid || "");
  const sender = String(msg?.key?.participant || msg?.participant || "");

  if (from.includes("@newsletter") || sender.includes("@newsletter")) return true;
  if (!info) return false;

  const newsletter = info.remoteJid?.includes("@newsletter") || !!info.forwardedNewsletterMessageInfo;
  const forwarded = !!info.isForwarded || Number(info.forwardingScore || 0) > 0;
  const longStanza = String(info.stanzaId || "").length > 15;

  return newsletter || (forwarded && (!info.participant || newsletter || longStanza));
}

export default {
  name: "مضاد-قنوات",
  flag: "antichannel",

  async check({ sock, msg, from, sender, isBotAdmin, isAdmin, isOwner, isMod, botLabel }) {
    if (!from?.endsWith("@g.us")) return false;
    if (!isChannelForward(msg)) return false;

    if (isOwner || isAdmin || isMod) return false;
    if (numOf(sender) === numOf(sock.user?.id)) return false;
    if (isActiveBot(sender)) return false;
    if (db.hasRole(sender, "mod") || db.hasRole(numOf(sender), "mod")) return false;

    const key = `${from}:${numOf(sender)}`;
    if (Date.now() < (cooldown.get(key) || 0)) return false;
    cooldown.set(key, Date.now() + COOLDOWN_MS);

    const user = `@${numOf(sender)}`;

    try {
      await sock.sendMessage(from, {
        delete: { remoteJid: from, id: msg.key.id, participant: sender, fromMe: false },
      });
    } catch (e) {
      log.warn(`مضاد القنوات: تعذّر حذف الرسالة (${e.message})`);
    }

    if (!isBotAdmin) {
      await sock.sendMessage(from, {
        text: `📢 *مضاد القنوات*\n> ${user} أرسل توجيهًا من قناة، لكنني لست مشرفًا لطرده.`,
        mentions: [sender],
      });
      return true;
    }

    try {
      await sock.groupParticipantsUpdate(from, [sender], "remove");
      await sock.sendMessage(from, {
        text: `📢 *مضاد القنوات*\n> ${user} خالف القوانين بإرسال توجيه من قناة وتم طرده.`,
        mentions: [sender],
      });
      log.info(`[${botLabel}] مضاد القنوات: طُرد ${sender} من ${from}`);
    } catch (e) {
      log.error(`مضاد القنوات: تعذّر الطرد (${e.message})`);
    }

    return true;
  },
};
