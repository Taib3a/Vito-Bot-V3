import { botName } from "../../الاضافات/الاعدادات.js";

export default {
  name: "ping",
  description: "Check if the bot is alive.",
  async execute({ sock, msg }) {
    const start = Date.now();
    await sock.sendPresenceUpdate("composing", msg.key.remoteJid);
    const latency = Date.now() - start;
    await sock.sendMessage(msg.key.remoteJid, {
      text: `🏓 *${botName}*\nSpeed: ${latency}ms`,
    });
  },
};
