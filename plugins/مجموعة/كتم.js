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
  name: "كتم",
  description: "كتم عضو في المجموعة (منع إرسال الرسائل)",
  async execute({ sock, msg, args, senderJid, isGroup }) {
    if (!isGroup) {
      await sock.sendMessage(msg.key.remoteJid, { text: "❌ هذا الأمر يعمل في المجموعات فقط." });
      return;
    }
    const groupJid = msg.key.remoteJid;

    const target = await getTargetJid(sock, msg, args);
    if (!target) {
      await sock.sendMessage(groupJid, {
        text: "❌ استخدم: *.كتم @الشخص* أو رد على رسالة الشخص، أو *.كتم [رقم]*",
      });
      return;
    }

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
      await sock.groupSettingUpdate(groupJid, "announcement");
      await sock.sendMessage(groupJid, {
        text: `🔇 تم كتم المجموعة — الآن المشرفون فقط يمكنهم الإرسال.\nالعضو المكتوم: @${target.split("@")[0]}\nلإلغاء الكتم: *.فك-كتم*`,
        mentions: [target],
      });
      log.info(`كتم: ${target} muted in ${groupJid} by ${senderJid}`);
    } catch (err) {
      log.error(err.message, "كتم.js", err.stack);
      await sock.sendMessage(groupJid, { text: `❌ تعذّر الكتم: ${err.message}` });
    }
  },
};
