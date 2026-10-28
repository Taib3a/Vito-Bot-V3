import log from "../../الاضافات/الكونسل.js";
import { checkAdmins } from "../../الاضافات/ادوات-المجموعة.js";

export default {
  name: "كتم",
  description: "كتم المجموعة (المشرفون فقط يمكنهم الإرسال)",
  async execute({ sock, msg, senderJid, isGroup }) {
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
      await sock.groupSettingUpdate(groupJid, "announcement");
      await sock.sendMessage(groupJid, {
        text: `🔇 تم كتم المجموعة — الآن المشرفون فقط يمكنهم الإرسال.\nلإلغاء الكتم: *.فك-كتم*`,
      });
      log.info(`كتم: group muted ${groupJid} by ${senderJid}`);
    } catch (err) {
      log.error(err.message, "كتم.js", err.stack);
      await sock.sendMessage(groupJid, { text: `❌ تعذّر الكتم: ${err.message}` });
    }
  },
};
