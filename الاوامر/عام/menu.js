import { botName, prefix } from "../../الاضافات/الاعدادات.js";

export default {
  name: "menu",
  description: "Show the command list.",
  async execute({ sock, msg, commands }) {
    const lines = Object.values(commands).map(
      (c) => `  ${prefix}${c.name} — ${c.description}`
    );
    const text = `*${botName}*\n\nالأوامر المتاحة:\n${lines.join("\n")}`;
    await sock.sendMessage(msg.key.remoteJid, { text });
  },
};
