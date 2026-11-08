import config from "../../core/settings.js";
import { db } from "../../database/db.js";

export default {
  name: ["وضع-خاص"],
  description: 'يشغّل أو يطفئ وضع self للمجموعة باستخدام "on" أو "off"',
  category: "المالك",
  groupOnly: true,
  ownerOnly: true,

  async run({ from, args, react, reply }) {

    const accion = args[0]?.toLowerCase();

    if (accion === "on") {
      db.setGroup(from, { selfMode: true });
      await react("🔒");
      return await reply({
        text: ( `🔒 *تم تفعيل الوضع الخاص في هذه المجموعة.*\n\nمن الآن، سيتجاهل *${config.botName}* رسائل المستخدمين العاديين في هذه المجموعة. سيستجيب لنفسه وللمالكين فقط.`)
      });
    }

    if (accion === "off") {
      db.setGroup(from, { selfMode: false });
      await react("🔓");
      return await reply({
        text: ( `🔓 *تم إيقاف الوضع الخاص في هذه المجموعة.*\n\nعاد البوت لوضعه الطبيعي وسيستجيب للجميع.`)
      });
    }

    await react("❓");
    await reply({ text: ( `💡 *الاستخدام الصحيح للأمر:*\n• _.وضع-خاص on_ (للتشغيل)\n• _.وضع-خاص off_ (للإيقاف)`) });
  }
};