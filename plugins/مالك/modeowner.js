import config from "../../config.js";
import { db } from "../../database/db.js";

export default {
  name: ["self", "وضع-خاص"],
  description: 'Prende o apaga el modo self del grupo usando "on" u "off"',
  category: "owner, المالك",
  groupOnly: true,
  ownerOnly: true,

  async run({ from, args, react, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const accion = args[0]?.toLowerCase();

    if (accion === "on") {
      db.setGroup(from, { selfMode: true });
      await react("🔒");
      return await reply({
        text: tr(`🔒 *Modo Self ACTIVADO en este grupo.*\n\nA partir de ahora, *${config.botName}* ignorará los mensajes de usuarios comunes en este grupo. Solo se atenderá a sí mismo y a los owners.`, `🔒 *تم تفعيل الوضع الخاص في هذه المجموعة.*\n\nمن الآن، سيتجاهل *${config.botName}* رسائل المستخدمين العاديين في هذه المجموعة. سيستجيب لنفسه وللمالكين فقط.`)
      });
    }

    if (accion === "off") {
      db.setGroup(from, { selfMode: false });
      await react("🔓");
      return await reply({
        text: tr(`🔓 *Modo Self DESACTIVADO en este grupo.*\n\nEl bot ha vuelto a la normalidad y responderá a todo el público.`, `🔓 *تم إيقاف الوضع الخاص في هذه المجموعة.*\n\nعاد البوت لوضعه الطبيعي وسيستجيب للجميع.`)
      });
    }

    await react("❓");
    await reply({ text: tr(`💡 *Uso correcto del comando:*\n• _.self on_ (Para encender)\n• _.self off_ (Para apagar)`, `💡 *الاستخدام الصحيح للأمر:*\n• _.self on_ (للتشغيل)\n• _.self off_ (للإيقاف)`) });
  }
};