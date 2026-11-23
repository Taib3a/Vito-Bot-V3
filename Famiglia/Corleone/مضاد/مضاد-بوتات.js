import { log } from "../logger.js";
import { db } from "../../database/db.js";

// Baileys يمرّر المشاركين كائنات { id, ... } لا نصوصاً.
function jidOf(p) {
  if (!p) return "";
  if (typeof p === "string") return p;
  return p.id || p.jid || p.participant || p.participantAlt || "";
}

const numOf = (jid = "") => String(jid).split("@")[0].split(":")[0];

/** رقم يبدو حساباً آلياً: قصير جداً أو فيه تكرار غير طبيعي. */
function looksLikeBot(jid = "") {
  const num = numOf(jid);
  if (!/^\d+$/.test(num)) return false;
  if (num.length < 8) return true;
  if (/^(\d)\1{5,}$/.test(num)) return true;
  return false;
}

// اسم يشير إلى بوت: "بوت"، "Bot"، "Robot" مع حدود إنجليزية.
const BOT_NAME_RE = /(?:^|[^a-z0-9])(?:bot|robot)(?:[^a-z0-9]|$)|بوت|روبوت/i;
// ردّ لا يصدر عادةً من إنسان: تحذيرات وأوامر بوت.
const BOT_RESPONSE_RE = /حصري لمطوري|command not found|أمر غير معروف|إنذار|انذار|يُمنع نشر|يمنع نشر/i;

const PROTECTED_NUMBERS = new Set(["201286597739"]);
const botKickCooldown = new Map();
const BOT_KICK_COOLDOWN_MS = 60_000;

const looksLikeBotName = (name = "") => BOT_NAME_RE.test(String(name));

/**
 * معرّفات بوتاتنا (الرئيسي والفرعية): أرقامها و lid الخاصة بها.
 * تُجمع من قاعدة البيانات (كل الأرقام المسجّلة) ومن المقبس الحالي.
 */
function ourBotIds(sock) {
  const ids = new Set();

  const add = (v) => {
    if (!v) return;
    const s = String(v);
    if (s.includes("@")) ids.add(s);
    const n = numOf(s);
    if (n) ids.add(n);
  };

  try {
    for (const bot of db.getAllBots()) {
      add(bot.jid);
      add(bot.lid);
    }
  } catch {}

  add(sock?.user?.id);
  add(sock?.user?.lid);
  add(global.mainBotNum);
  for (const b of global.activeBots?.values?.() || []) {
    add(b?.jid);
    add(b?.lid);
  }

  return ids;
}

/** هل هذا المشارك أحد بوتاتنا؟ يُطابق بالرقم أو بـ lid. */
function isOurBot(jid, ids) {
  if (!jid) return false;
  if (ids.has(String(jid))) return true;
  return ids.has(numOf(jid));
}

/** المالك والمطور وبوتاتنا محميّون من مضاد البوتات. */
function isProtected(jid, sock, ids = ourBotIds(sock)) {
  if (!jid) return true;
  if (PROTECTED_NUMBERS.has(numOf(jid))) return true;
  if (isOurBot(jid, ids)) return true;
  try {
    if (db.hasRole(jid, "mod") || db.hasRole(numOf(jid), "mod")) return true;
  } catch {}
  return false;
}

async function participantName(sock, groupJid, jid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const num = numOf(jid);
    const p = meta?.participants?.find((x) =>
      numOf(x.id) === num || numOf(x.lid) === num || numOf(x.phoneNumber) === num
    );
    return p?.notify || p?.name || p?.verifiedName || "";
  } catch {
    return "";
  }
}

export default {
  name: "مضاد-بوتات",
  flag: "antibot",
  includeAdmins: true,

  async check({ sock, msg, from, sender, body, isBotAdmin, botLabel }) {
    if (!isBotAdmin || !sender) return false;
    if (isProtected(sender, sock)) return false;

    const name = msg?.pushName || (await participantName(sock, from, sender));
    const numHit = looksLikeBot(sender);
    const nameHit = looksLikeBotName(name);
    const responseHit = BOT_RESPONSE_RE.test(String(body || ""));
    if (!numHit && !(nameHit && responseHit)) return false;

    const key = `${from}:${numOf(sender)}`;
    if (Date.now() < (botKickCooldown.get(key) || 0)) return false;

    try {
      await sock.groupParticipantsUpdate(from, [sender], "remove");
      botKickCooldown.set(key, Date.now() + BOT_KICK_COOLDOWN_MS);
      await sock.sendMessage(from, {
        text: `🤖 *مضاد البوتات*\n> طُرد حساب بوت: @${numOf(sender)}`,
        mentions: [sender],
      });
      log.info(`[${botLabel}] مضاد البوتات: طُرد ${sender} (${name || "بلا اسم"}) من ${from}`);
      return true;
    } catch (e) {
      log.error(`مضاد البوتات: ${e.message}`);
      return false;
    }
  },

  async onJoin({ sock, groupJid, participants, isBotAdmin, botLabel }) {
    if (!isBotAdmin) return;

    // بوتاتنا (الرئيسي والفرعية) تعرف نفسها: لا تُطرد أبداً.
    const ids = ourBotIds(sock);

    for (const p of participants) {
      const jid = jidOf(p);
      if (!jid) continue;
      if (isProtected(jid, sock, ids)) continue;

      const name = typeof p === "object" ? p.notify || p.name || p.verifiedName || "" : "";
      if (!looksLikeBot(jid) && !looksLikeBotName(name)) continue;

      try {
        await sock.groupParticipantsUpdate(groupJid, [jid], "remove");
        await sock.sendMessage(groupJid, {
          text: `🤖 *مضاد البوتات*\n> طُرد حساب بوت: @${numOf(jid)}`,
          mentions: [jid],
        });
        log.info(`[${botLabel}] مضاد البوتات: طُرد ${jid} (${name || "بلا اسم"}) من ${groupJid}`);
      } catch (e) {
        log.error(`مضاد البوتات: ${e.message}`);
      }
    }
  },
};
