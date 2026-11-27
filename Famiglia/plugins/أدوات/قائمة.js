// لوحة تنقّل بقائمة منسدلة (صفوف بسهم) + صفحة معلومات الجلسة.
import { log } from "../../Corleone/logger.js";

const uptime = () => {
  const s = Math.floor(process.uptime());
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}س ${m}د` : `${m}د`;
};

function sessionInfo(sock) {
  const creds = sock.authState?.creds || {};
  const me = creds.me || sock.user || {};
  const [num, device] = String(me.id || "").split("@")[0].split(":");
  return [
    "📱 *الأجهزة المرتبطة*",
    `◦ الرقم: ${num || "غير معروف"}`,
    `◦ الاسم: ${me.name || creds.name || "—"}`,
    `◦ الجهاز: ${device || "—"}`,
    `◦ المنصة: ${creds.platform || "—"}`,
    `◦ مسجّل: ${creds.registered ? "نعم" : "لا"}`,
    `◦ مدة التشغيل: ${uptime()}`,
  ].join("\n");
}

export default {
  name: ["قائمة", "جلسة"],
  description: "قائمة تنقّل منسدلة ومعلومات الجلسة",
  category: "أدوات",
  groupOnly: true,

  async run({ sock, from, msg, sender, reply, cmdName, usedPrefix }) {
    if (cmdName === "جلسة") return reply({ text: sessionInfo(sock) });

    if (typeof sock.sendButtonMessage !== "function") {
      return reply({ text: "🚩 لا يوجد sendButtonMessage." });
    }

    const p = usedPrefix || ".";

    // wa.me/settings يفتح إعدادات واتساب داخل التطبيق (ومنها الأجهزة المرتبطة).
    const buttons = [{ text: "📱 الأجهزة المرتبطة", url: "https://wa.me/settings" }];

    try {
      await sock.sendButtonMessage(from, "📋 *لوحة التنقّل*\nاختر ما تريد من القائمة:", buttons, {
        title: "بوت فيتو",
        footer: "كل صف يفتح قسماً",
        quoted: msg,
        mentions: [sender],
        selectLabel: "افتح القائمة",
        sections: [
          {
            title: "🖥️ البوت",
            rows: [
              { title: "📱 الأجهزة المرتبطة", description: "بيانات الجلسة الحالية", id: `${p}جلسة` },
              { title: "🔎 فحص الثيم", description: "دعم المحرك", id: `${p}ثيم check` },
            ],
          },
          {
            title: "👥 المجموعة",
            rows: [
              { title: "🎨 ثيم المجموعة", description: "ألوان أو خلفية", id: `${p}ثيم` },
              { title: "🃏 منشن البطاقات", description: "3 بطاقات بالأسماء والصور", id: `${p}منشن-بطاقات 3` },
              { title: "🕌 مواقيت الصلاة", description: "مواقيت اليوم", id: `${p}مواقيت` },
            ],
          },
        ],
      });
    } catch (e) {
      log.error(`لوحة التنقّل: ${e.message}`);
      await reply({ text: `🚩 فشل: ${e.message}` });
    }
  },
};
