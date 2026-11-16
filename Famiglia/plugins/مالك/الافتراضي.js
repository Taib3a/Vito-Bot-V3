import { db } from "../../database/db.js";

// عرض القيم الافتراضية كلها مصنّفة، من مصدر واحد: database/db.js.
// الأمر للاطّلاع فقط — لا يعدّل شيئاً.
const ON = "✅ مفعّل";
const OFF = "🚫 معطّل";

const state = (v) => (typeof v === "boolean" ? (v ? ON : OFF) : `\`${v === null ? "لا شيء" : JSON.stringify(v)}\``);
const line = (k, v) => `• \`${k}\` — ${state(v)}`;

export default {
  name: ["الافتراضي", "الافتراضيات", "defaults"],
  description: "يعرض القيم الافتراضية لكل الإعدادات",
  category: "المالك",
  ownerOnly: true,

  async run({ react, reply }) {
    const v = db.getDefaultsView();

    const block = (title, obj) =>
      `*${title}*\n${Object.entries(obj).map(([k, val]) => line(k, val)).join("\n")}`;

    const text = [
      "⚙️ *القيم الافتراضية*",
      "> المصدر: `Famiglia/database/db.js`",
      "",
      block("🛡️ مضادات المجموعة", v.antifeatures),
      "",
      block("👮 إعدادات المشرف", v.admin),
      "",
      block("👑 إعدادات المالك", v.owner),
      "",
      block("📱 رقم البوت", v.bot),
      "",
      block("👤 المستخدم", v.user),
      "",
      `*🎖️ الأدوار*\n${v.roles.map((r) => `• \`${r}\``).join("\n")}`,
    ].join("\n");

    await react("⚙️");
    return await reply({ text });
  },
};
