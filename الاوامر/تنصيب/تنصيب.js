import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { botName } from "../../الاضافات/الاعدادات.js";
import log from "../../الاضافات/الكونسل.js";
import { registerSubBot, getSubBot, listSubBots } from "../../database/db.js";
import { connect } from "../../الاضافات/النظام.js";
import { normalizePhoneNumber } from "../../الاضافات/الادخال.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUB_SESSION_BASE = join(__dirname, "..", "..", "sessions", "subbots");

export default {
  name: "تنصيب",
  description: "تنصيب بوت فرعي جديد برمز الاقتران",
  async execute({ sock, msg, args, senderJid, isGroup }) {
    const phone = args[0]?.trim();

    if (!phone) {
      await sock.sendMessage(msg.key.remoteJid, {
        text: `❌ استخدم: *.تنصيب [رقم الهاتف]*\nمثال: *.تنصيب 967777123456*\n\nاستخدم *.تنصيب قائمة* لعرض البوتات الفرعية المثبتة.`,
      });
      return;
    }

    if (phone === "قائمة") {
      try {
        const bots = await listSubBots();
        if (bots.length === 0) {
          await sock.sendMessage(msg.key.remoteJid, { text: "📋 لا توجد بوتات فرعية مثبتة." });
          return;
        }
        const lines = bots.map(
          (b, i) =>
            `${i + 1}. 📱 ${b.phone}\n   الحالة: ${b.status} | المسار: ${b.session_path}`
        );
        await sock.sendMessage(msg.key.remoteJid, {
          text: `📋 *البوتات الفرعية المثبتة:*\n\n${lines.join("\n\n")}`,
        });
      } catch (err) {
        log.error(err.message, "تنصيب.js", err.stack);
        await sock.sendMessage(msg.key.remoteJid, { text: "❌ حدث خطأ أثناء جلب القائمة." });
      }
      return;
    }

    const cleanPhone = normalizePhoneNumber(phone);
    if (!cleanPhone) {
      await sock.sendMessage(msg.key.remoteJid, {
        text: "❌ رقم الهاتف غير صحيح. أدخل الرقم مع رمز الدولة (مثال: 967735541558).",
      });
      return;
    }

    const sessionPath = join(SUB_SESSION_BASE, cleanPhone);

    try {
      await sock.sendPresenceUpdate("composing", msg.key.remoteJid);
      const { pairingCode } = await connect({
        method: "pairing",
        phoneNumber: cleanPhone,
        isSubBot: true,
        subBotPhone: cleanPhone,
      });

      if (!pairingCode) {
        await sock.sendMessage(msg.key.remoteJid, {
          text: "❌ تعذّر توليد رمز الاقتران. تأكد من صحة الرقم وحاول مرة أخرى.",
        });
        return;
      }

      await registerSubBot(cleanPhone, sessionPath, pairingCode);

      await sock.sendMessage(msg.key.remoteJid, {
        text: `✅ *تم بدء تنصيب بوت فرعي جديد!*\n\n📱 الرقم: ${cleanPhone}\n🔑 رمز الاقتران: *${pairingCode}*\n\nأدخل الرمز في هاتف WhatsApp الجديد لإكمال التنصيب.\nالمسار: ${sessionPath}`,
      });

      log.success(`Sub-bot installed for ${cleanPhone}, pairing code: ${pairingCode}`);
    } catch (err) {
      log.error(err.message, "تنصيب.js", err.stack);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `❌ حدث خطأ أثناء التنصيب: ${err.message}`,
      });
    }
  },
};
