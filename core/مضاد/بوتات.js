import { log } from "../logger.js";

/** رقم يبدو حساباً آلياً: قصير جداً أو فيه تكرار غير طبيعي. */
function looksLikeBot(jid = "") {
  const num = jid.split("@")[0].split(":")[0];
  if (!/^\d+$/.test(num)) return false;
  if (num.length < 8) return true;
  if (/^(\d)\1{5,}$/.test(num)) return true;
  return false;
}

export async function checkAntibot({ sock, groupJid, participants, isBotAdmin, botLabel }) {
  if (!isBotAdmin) return;

  for (const jid of participants) {
    if (!looksLikeBot(jid)) continue;

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
}
