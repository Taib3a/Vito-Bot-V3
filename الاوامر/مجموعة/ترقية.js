import log from "../../الاضافات/الكونسل.js";
import { getTargetJid, checkAdmins } from "../../الاضافات/ادوات-المجموعة.js";

export default {
  name: "ترقية",
  description: "ترقية عضو إلى مشرف (mention أو رد)",
  async execute({ sock, msg, args, senderJid, isGroup }) {
    if (!isGroup) {
      await sock.sendMessage(msg.key.remoteJid, { text: "❌ هذا الأمر يعمل في المجموعات فقط." });
      return;
    }
    const groupJid = msg.key.remoteJid;

    const target = await getTargetJid(msg, args);
    if (!target) {
      await sock.sendMessage(groupJid, {
        text: "❌ استخدم: *.ترقية @الشخص* أو رد على رسالة الشخص، أو *.ترقية [رقم]*",
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
      await sock.groupParticipantsUpdate(groupJid, [target], "promote");
      await sock.sendMessage(groupJid, {
        text: `✅ تم ترقية @${target.split("@")[0]} إلى مشرف.`,
        mentions: [target],
      });
      log.info(`ترقية: ${target} promoted in ${groupJid} by ${senderJid}`);
    } catch (err) {
      log.error(err.message, "ترقية.js", err.stack);
      await sock.sendMessage(groupJid, { text: `❌ تعذّر الترقية: ${err.message}` });
    }
  },
};
