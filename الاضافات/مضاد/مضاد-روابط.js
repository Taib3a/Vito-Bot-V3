import { isFeatureEnabled } from "../القاعدة.js";
import log from "../الكونسل.js";

const LINK_REGEX = /(https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me\/)/i;

export default {
  name: "anti_links",
  async onMessage({ sock, msg, senderJid, groupJid }) {
    if (!(await isFeatureEnabled(groupJid, "anti_links"))) return;
    if (msg.key.fromMe) return;

    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      "";

    if (!LINK_REGEX.test(text)) return;

    try {
      await sock.sendMessage(groupJid, {
        delete: { remoteJid: groupJid, fromMe: false, id: msg.key.id, participant: senderJid },
      });
      await sock.groupParticipantsUpdate(groupJid, [senderJid], "remove");
      await sock.sendMessage(groupJid, {
        text: "🚫 تم حذف الرابط وطرد مرسله — مضاد الروابط مفعّل.",
      });
      log.info(`Anti-links: removed ${senderJid} from ${groupJid}`);
    } catch (err) {
      log.error(`Anti-links error: ${err.message}`);
    }
  },
};
