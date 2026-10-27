import log from "../../الاضافات/الكونسل.js";

async function getTargetJid(sock, msg, args) {
  if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
    return msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
  }
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
  if (quoted) return quoted;
  const num = args[0]?.replace(/\D/g, "");
  if (num && num.length >= 8) return `${num}@s.whatsapp.net`;
  return null;
}

async function checkAdmins(sock, groupJid, senderJid, botJid) {
  const metadata = await sock.groupMetadata(groupJid);
  const sender = metadata.participants.find((p) => p.id === senderJid);
  const bot = metadata.participants.find((p) => p.id === botJid);
  return {
    senderIsAdmin: sender?.admin === "admin" || sender?.admin === "superadmin",
    botIsAdmin: bot?.admin === "admin" || bot?.admin === "superadmin",
  };
}

export default {
  name: "فك-كتم",
  description: "إلغاء كتم المجموعة (السماح للجميع بالإرسال)",
  async execute({ sock, msg, args, senderJid, isGroup }) {
    if (!isGroup) {
      await sock.sendMessage(msg.key.remoteJid, { text: "❌ هذا الأمر يعمل في المجموعات فقط." });
      return;
    }
    const groupJid = msg.key.remoteJid;

    const botJid = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";
    const { senderIsAdmin, botIsAdmin } = await checkAdmins(sock, groupJid, senderJid, botJid);

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
