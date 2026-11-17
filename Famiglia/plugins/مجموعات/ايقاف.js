import { db } from "../../database/db.js";

// أمر عادي لرقم البوت وحده: يوقف البوت في هذه المجموعة أو يعيد تشغيله.
// الإعداد لكل (رقم + مجموعة)، فرقم واحد قد يتوقف في مجموعة ويبقى يعمل في غيرها.
export default {
  name: ["ايقاف", "إيقاف", "تشغيل"],
  description: "يوقف البوت في هذه المجموعة أو يشغّله (لرقم البوت وحده)",
  category: "المجموعات",
  groupOnly: true,

  async run({ from, cmdName, botJid, fromMe, reply, react }) {
    // رقم البوت وحده: عضو عادي لا يملك إسكات البوت.
    if (!fromMe) return await reply({ text: "❌ هذا الأمر لرقم البوت وحده." });

    const botNum = String(botJid).split("@")[0].split(":")[0];
    const on = cmdName === "تشغيل";
    const cur = !!db.getBotGroup(botNum, from).botOn;

    if (on === cur) {
      return await reply({
        text: on ? "🟢 البوت يعمل بالفعل في هذه المجموعة." : "🔴 البوت متوقف بالفعل في هذه المجموعة.",
      });
    }

    db.setBotGroup(botNum, from, { botOn: on });
    await react(on ? "🟢" : "🔴");
    return await reply({
      text: on
        ? "🟢 *تم تشغيل البوت في هذه المجموعة.*\n> عاد يستجيب للأوامر والرسائل."
        : "🔴 *تم إيقاف البوت في هذه المجموعة.*\n> لن يستجيب لأي أمر حتى تشغّله مجدداً.",
    });
  },
};
