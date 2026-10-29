import { log } from "../logger.js";

const linkRegex = /(?:^|[\s/])(?:chat\.whatsapp\.com\/[0-9A-Za-z]{20,24}|(?:www\.|web\.)?whatsapp\.com\/channel\/[0-9A-Za-z]{10,30})(?:[\s?]|$)/i;

export function hasWhatsappLink(text = "") {
  return linkRegex.test(text);
}

export default {
  name: "مضاد-روابط",
  flag: "antilink",

  async check({ sock, msg, from, sender, body, isBotAdmin, botLabel }) {
    if (!hasWhatsappLink(body)) return false;
    if (!isBotAdmin) return false;

    try {
      await sock.sendMessage(from, {
        delete: { remoteJid: from, id: msg.key.id, participant: sender, fromMe: false },
      });

      await sock.groupParticipantsUpdate(from, [sender], "remove");

      await sock.sendMessage(from, {
        text: `🚫 تم حذف رابط دعوة وطرد @${sender.split("@")[0]}`,
        mentions: [sender],
      });

      log.cmdExec({ cmdName: "antilink", sender: sender.split("@")[0], success: true, ms: 0, botLabel });
    } catch (e) {
      log.error(`مضاد الروابط: ${e.message}`);
    }

    return true;
  },
};
