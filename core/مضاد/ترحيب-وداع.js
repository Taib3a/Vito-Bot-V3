import { log } from "../logger.js";
import { db } from "../../database/db.js";

export default {
  name: "ترحيب-وداع",
  flag: "welcome",

  async onJoin({ sock, groupJid, participants, botLabel }) {
    for (const jid of participants) {
      try {
        db.getUser(jid);
        await sock.sendMessage(groupJid, {
          text: `👋 أهلاً وسهلاً @${jid.split("@")[0]} في المجموعة!`,
          mentions: [jid],
        });
      } catch (e) {
        log.error(`[${botLabel}] الترحيب: ${e.message}`);
      }
    }
  },

  async onLeave({ sock, groupJid, participants, botLabel }) {
    for (const jid of participants) {
      try {
        await sock.sendMessage(groupJid, {
          text: `👋 وداعاً @${jid.split("@")[0]} 👋`,
          mentions: [jid],
        });
      } catch (e) {
        log.error(`[${botLabel}] الوداع: ${e.message}`);
      }
    }
  },
};
