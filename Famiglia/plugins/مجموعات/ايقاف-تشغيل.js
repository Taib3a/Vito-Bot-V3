import { db } from "../../database/db.js";

const OFF_NAMES = new Set(["ايقاف", "إيقاف"]);

export default {
  name: ["ايقاف", "إيقاف", "تشغيل"],
  description: "إيقاف أو تشغيل البوت في هذه المجموعة",
  category: "المجموعات",
  groupOnly: true,
  adminOnly: true,
  // «تشغيل» يجب أن يعمل والبوت متوقف، وإلا تعذّرت إعادته.
  worksWhenOff: true,

  async run({ from, cmdName, reply, react }) {
    const off = OFF_NAMES.has(String(cmdName || "").toLowerCase());
    const group = db.getGroup(from);

    if (off) {
      if (group.botOff) return await reply({ text: "🔴 البوت متوقف بالفعل في هذه المجموعة." });
      db.setGroup(from, { botOff: true });
      await react("🔴");
      return await reply({
        text: "🔴 *تم إيقاف البوت في هذه المجموعة.*\n> لن يستجيب لأي أمر أو رسالة حتى تكتب *تشغيل*.",
      });
    }

    if (!group.botOff) return await reply({ text: "🟢 البوت يعمل بالفعل في هذه المجموعة." });
    db.setGroup(from, { botOff: false });
    await react("🟢");
    return await reply({
      text: "🟢 *تم تشغيل البوت في هذه المجموعة.*\n> عاد يستجيب للأوامر والرسائل.",
    });
  },
};
