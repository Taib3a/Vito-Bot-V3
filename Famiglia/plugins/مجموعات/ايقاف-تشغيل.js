import { antifeatureModules } from "../../core/مضاد/index.js";

const OFF_NAMES = new Set(["ايقاف", "إيقاف"]);

// إيقاف/تشغيل البوت في المجموعة بالكتابة، من رقم البوت نفسه.
// المنطق في وحدة «تشغيل-وايقاف» بـcore/مضاد، وهذا واجهة نصّية لها.
export default {
  name: ["ايقاف", "إيقاف", "تشغيل"],
  description: "إيقاف أو تشغيل البوت في هذه المجموعة (من رقم البوت وحده)",
  category: "المجموعات",
  groupOnly: true,

  async run({ from, botJid, cmdName, fromMe, reply, react }) {
    // الإعداد لكل (رقم + مجموعة)، ورقم البوت وحده يتحكم به: غيره يُتجاهل بصمت.
    if (!fromMe) return;

    const mod = antifeatureModules.find((m) => m.flag === "botOn");
    const botNum = String(botJid).split("@")[0].split(":")[0];
    const on = !OFF_NAMES.has(String(cmdName));

    const res = await mod.run({ from, on, botNum });
    if (res.changed) await react(on ? "🟢" : "🔴");
    return await reply({ text: res.text });
  },
};
