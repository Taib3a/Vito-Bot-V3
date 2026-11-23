import { getAllSockets, activeBots } from "../../Corleone/subbotManager.js";

const numOf = (jid = "") => String(jid).split("@")[0].split(":")[0];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  name: ["فحص-البوتات", "فحص-الكل"],
  description: "يجعل كل بوت متصل يرسل ردًا للتأكد من أنه يعمل",
  category: "المالك",
  ownerOnly: true,

  async run({ sock, from, reply, react }) {
    await react("🔍");

    const sockets = getAllSockets().filter((s) => s?.user?.id);
    if (!sockets.length) {
      return await reply({ text: "❌ لا توجد بوتات متصلة الآن." });
    }

    const bots = [...activeBots.values()];
    const botFor = (socket) => {
      const num = numOf(socket.user?.id);
      return bots.find((b) => numOf(b.jid) === num || numOf(b.lid) === num);
    };

    const ok = [];
    const failed = [];

    for (const socket of sockets) {
      const bot = botFor(socket);
      const num = numOf(socket.user?.id);
      const label = bot?.label || `بوت ${num}`;

      try {
        await socket.sendMessage(from, {
          text: `✅ *فحص البوتات*\n> ${label}\n> +${num}\n> الحالة: متصل ويعمل`,
        });
        ok.push({ label, num });
      } catch (e) {
        failed.push({ label, num, error: e.message });
      }

      await wait(300);
    }

    let text = `🔍 *نتيجة فحص البوتات*\n\n`;
    text += `✅ استجاب: *${ok.length}* من *${sockets.length}*\n`;

    if (ok.length) {
      text += ok.map((b) => `  ✅ ${b.label} — +${b.num}`).join("\n") + "\n";
    }

    if (failed.length) {
      text += `\n❌ تعذّر الرد: *${failed.length}*\n`;
      text += failed
        .map((b) => `  ❌ ${b.label} — +${b.num}\n     ${b.error.slice(0, 80)}`)
        .join("\n");
    }

    return await sock.sendMessage(from, { text });
  },
};
