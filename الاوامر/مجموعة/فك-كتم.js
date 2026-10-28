import log from "../../الاضافات/الكونسل.js";
import { checkAdmins } from "../../الاضافات/ادوات-المجموعة.js";

export default {
  name: "فك-كتم",
  description: "إلغاء كتم المجموعة (السماح للجميع بالإرسال)",
  async execute({ sock, msg, args, senderJid, isGroup }) {
    if (!isGroup) {
      await sock.sendMessage(msg.key.remoteJid, { text: "❌ هذا الأمر يعمل في المجموعات فقط." });
      return;
    }
    const groupJid = msg.key.remoteJid;
    const { senderIsAdmin, botIsAdmin } = await checkAdmins(sock, groupJid, senderJid);

    if (!senderIsAdmin) {
      await sock.sendMessage(groupJid, { text: "❌ هذا الأمر للمشرفين فقط." });
      return;
    }
    if (!botIsAdmin) {
      await sock.sendMessage(groupJid, { text: "❌ البوت ليس مشرفاً في هذه المجموعة. ارفعه أولاً." });
      return;
    }

    try {
      await sock.groupSettingUpdate(groupJid, "not_announcement");
      await sock.sendMessage(groupJid, {
        text: "🔊 تم إلغاء كتم المجموعة — الجميع يمكنه الإرسال الآن.",
      });
      log.info(`فك-كتم: group unmuted ${groupJid} by ${senderJid}`);
    } catch (err) {
      log.error(err.message, "فك-كتم.js", err.stack);
      await sock.sendMessage(groupJid, { text: `❌ تعذّر إلغاء الكتم: ${err.message}` });
    }
  },
};
