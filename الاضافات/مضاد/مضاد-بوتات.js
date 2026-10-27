import { isFeatureEnabled } from "../القاعدة.js";
import log from "../الكونسل.js";

export default {
  name: "anti_bots",

  async onGroupParticipantsUpdate({ sock, groupJid, participants, action }) {
    if (!(await isFeatureEnabled(groupJid, "anti_bots"))) return;
    if (action !== "add") return;

    for (const jid of participants) {
      try {
        const metadata = await sock.groupMetadata(groupJid);
        const participant = metadata.participants.find((p) => p.id === jid);
        if (!participant) continue;

        const num = jid.split("@")[0];
        if (num.length < 8 || /^0{5,}/.test(num)) {
          await sock.groupParticipantsUpdate(groupJid, [jid], "remove");
          await sock.sendMessage(groupJid, {
            text: `🤖 تم طرد حساب مشبوه (@${num}) — مضاد البوتات مفعّل.`,
            mentions: [jid],
          });
          log.info(`Anti-bots: removed suspicious ${jid} from ${groupJid}`);
        }
      } catch (err) {
        log.error(`Anti-bots error: ${err.message}`);
      }
    }
  },
};
