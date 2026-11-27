// يعرض كل أنواع أزرار native_flow المتاحة في المحرك، ليرى المستخدم شكل كل نوع.
import { log } from "../../Corleone/logger.js";

export default {
  name: ["انواع-الازرار", "أنواع-الأزرار"],
  description: "يعرض كل أنواع الأزرار",
  category: "أدوات",
  groupOnly: true,
  adminOnly: true,

  async run({ sock, from, msg, sender, reply, usedPrefix }) {
    if (typeof sock.sendButtonMessage !== "function") {
      return reply({ text: "🚩 لا يوجد sendButtonMessage." });
    }

    const p = usedPrefix || ".";
    const base = { title: "أنواع الأزرار", quoted: msg, mentions: [sender] };

    const messages = [
      {
        label: "1) أساسية",
        text: "1️⃣ *quick_reply + cta_url + cta_copy + cta_call*",
        buttons: [
          { text: "🔘 رد سريع", id: `${p}جلسة` },
          { text: "🌐 رابط", url: "https://www.whatsapp.com" },
          { text: "📋 نسخ", copy: "VITO" },
          { text: "📞 اتصال", phoneNumber: "+967776704822" },
        ],
      },
      {
        label: "2) موقع + إذن اتصال",
        text: "2️⃣ *send_location + call_permission_request*",
        buttons: [
          { text: "📍 أرسل موقعي", location: true },
          { text: "📞 اسمح بالاتصال", callPermission: true },
        ],
      },
      {
        label: "4) روابط تفتح داخل واتساب",
        text: "4️⃣ *cta_url بروابط واتساب* — اضغط كل زر وأخبرني أيّها فتح داخل التطبيق",
        buttons: [
          { text: "📢 قناة (مرجع)", url: "https://whatsapp.com/channel/0029Vb8hDbBDuMRXBFk3u02L" },
          { text: "⚙️ wa.me/settings", url: "https://wa.me/settings" },
          { text: "⚙️ whatsapp.com/settings", url: "https://whatsapp.com/settings" },
        ],
      },
    ];

    for (const m of messages) {
      try {
        await sock.sendButtonMessage(from, m.text, m.buttons, { ...base, footer: m.label });
      } catch (e) {
        log.error(`أنواع الأزرار (${m.label}): ${e.message}`);
        await reply({ text: `🚩 فشل ${m.label}: ${e.message}` });
      }
    }

    try {
      await sock.sendButtonMessage(from, "3️⃣ *single_select* — صفوف بسهم ›", [], {
        ...base,
        footer: "قائمة منسدلة",
        selectLabel: "افتح القائمة",
        sections: [
          {
            title: "أقسام",
            rows: [
              { title: "📱 الأجهزة المرتبطة", description: "بيانات الجلسة", id: `${p}جلسة` },
              { title: "🎨 ثيم المجموعة", description: "ألوان أو خلفية", id: `${p}ثيم` },
            ],
          },
        ],
      });
    } catch (e) {
      log.error(`أنواع الأزرار (قائمة): ${e.message}`);
    }
  },
};
