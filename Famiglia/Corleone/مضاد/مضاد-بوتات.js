import { log } from "../logger.js";

// Baileys يمرّر المشاركين كائنات { id, ... } لا نصوصاً.
function jidOf(p) {
  if (!p) return "";
  if (typeof p === "string") return p;
  return p.id || p.jid || p.participant || p.participantAlt || "";
}

/** رقم يبدو حساباً آلياً: قصير جداً أو فيه تكرار غير طبيعي. */
function looksLikeBot(jid = "") {
  const num = jid.split("@")[0].split(":")[0];
  if (!/^\d+$/.test(num)) return false;
  if (num.length < 8) return true;
  if (/^(\d)\1{5,}$/.test(num)) return true;
  return false;
}

export default {
  name: "مضاد-بوتات",
  flag: "antibot",

  async onJoin({ sock, groupJid, participants, isBotAdmin, botLabel }) {
    if (!isBotAdmin) return;

    for (const p of participants) {
      const jid = jidOf(p);
      if (!jid || !looksLikeBot(jid)) continue;

      try {
        await sock.groupParticipantsUpdate(groupJid, [jid], "remove");
        await sock.sendMessage(groupJid, {
          text: `🤖 *مضاد البوتات*\n> طُرد حساب مشبوه: @${jid.split("@")[0]}`,
          mentions: [jid],
        });
        log.info(`[${botLabel}] مضاد البوتات: طُرد ${jid} من ${groupJid}`);
      } catch (e) {
        log.error(`مضاد البوتات: ${e.message}`);
      }
    }
  },
};
