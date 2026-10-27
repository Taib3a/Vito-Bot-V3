import { isFeatureEnabled } from "../القاعدة.js";
import { registerUser } from "../القاعدة.js";
import log from "../الكونسل.js";

export default {
  name: "welcome",

  async onGroupParticipantsUpdate({ sock, groupJid, participants, action }) {
    if (!(await isFeatureEnabled(groupJid, "welcome"))) return;

    for (const jid of participants) {
      try {
        if (action === "add") {
          await registerUser(jid);
          await sock.sendMessage(groupJid, {
            text: `👋 أهلاً وسهلاً @${jid.split("@")[0]} في المجموعة!`,
            mentions: [jid],
          });
        } else if (action === "remove") {
          await sock.sendMessage(groupJid, {
            text: `👋 وداعاً @${jid.split("@")[0]} 👋`,
            mentions: [jid],
          });
        }
      } catch (err) {
        log.error(`Welcome/goodbye error: ${err.message}`);
      }
    }
  },
};
