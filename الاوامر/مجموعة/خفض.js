import log from "../../الاضافات/الكونسل.js";
import { getTargetJid, checkAdmins } from "../../الاضافات/ادوات-المجموعة.js";

export default {
  name: "خفض",
  description: "خفض مشرف إلى عضو عادي (mention أو رد)",
  async execute({ sock, msg, args, senderJid, isGroup }) {
    if (!isGroup) {
      await sock.sendMessage(msg.key.remoteJid, { text: "❌ هذا الأمر يعمل في المجموعات فقط." });
      return;
    }
    const groupJid = msg.key.remoteJid;

    const target = await getTargetJid(msg, args);
    if (!target) {
      await sock.sendMessage(groupJid, {
        text: "❌ استخدم: *.خفض @الشخص* أو رد على رسالة الشخص، أو *.خفض [رقم]*",
      });
      return;
    }
    const { senderIsAdmin, botIsAdmin, metadata } = await checkAdmins(sock, groupJid, senderJid);

    if (!senderIsAdmin) {
      await sock.sendMessage(groupJid, { text: "❌ هذا الأمر للمشرفين فقط." });
      return;
    }
    if (!botIsAdmin) {
      await sock.sendMessage(groupJid, { text: "❌ البوت ليس مشرفاً في هذه المجموعة. ارفعه أولاً." });
      return;
    }

    const targetInfo = metadata.participants.find((p) => p.id === target);
    if (!targetInfo?.admin) {
      await sock.sendMessage(groupJid, { text: "❌ هذا الشخص ليس مشرفاً." });
      return;
    }

    try {
      await sock.groupParticipantsUpdate(groupJid, [target], "demote");
      await sock.sendMessage(groupJid, {
        text: `✅ تم خفض @${target.split("@")[0]} إلى عضو عادي.`,
        mentions: [target],
      });
      log.info(`خفض: ${target} demoted in ${groupJid} by ${senderJid}`);
    } catch (err) {
      log.error(err.message, "خفض.js", err.stack);
      await sock.sendMessage(groupJid, { text: `❌ تعذّر الخفض: ${err.message}` });
    }
  },
};
