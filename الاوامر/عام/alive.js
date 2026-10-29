import { botName } from "../../الاضافات/الاعدادات.js";

export default {
  name: "alive",
  description: "Check bot status.",
  async execute({ sock, msg }) {
    await sock.sendMessage(msg.key.remoteJid, {
      text: `✅ ${botName} يعمل بنجاح!`,
    });
  },
};
