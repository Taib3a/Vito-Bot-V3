import log from "../../الاضافات/الكونسل.js";
import { getTargetJid, checkAdmins } from "../../الاضافات/ادوات-المجموعة.js";

export default {
  name: "طرد",
  description: "طرد عضو من المجموعة (mention أو رد)",
  async execute({ sock, msg, args, senderJid, isGroup }) {
    if (!isGroup) {
      await sock.sendMessage(msg.key.remoteJid, { text: "❌ هذا الأمر يعمل في المجموعات فقط." });
      return;
    }
    const groupJid = msg.key.remoteJid;

    const target = await getTargetJid(msg, args);
    if (!target) {
      await sock.sendMessage(groupJid, {
        text: "❌ استخدم: *.طرد @الشخص* أو رد على رسالة الشخص، أو *.طرد [رقم]*",
      });
      return;
    }
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
      await sock.groupParticipantsUpdate(groupJid, [target], "remove");
      await sock.sendMessage(groupJid, {
        text: `✅ تم طرد @${target.split("@")[0]} من المجموعة.`,
        mentions: [target],
      });
      log.info(`طرد: ${target} removed from ${groupJid} by ${senderJid}`);
    } catch (err) {
      log.error(err.message, "طرد.js", err.stack);
      await sock.sendMessage(groupJid, { text: `❌ تعذّر الطرد: ${err.message}` });
    }
  },
};
