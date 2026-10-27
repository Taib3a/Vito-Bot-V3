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
    metadata,
  };
}

export default {
  name: "طرد",
  description: "طرد عضو من المجموعة (mention أو رد)",
  async execute({ sock, msg, args, senderJid, isGroup }) {
    if (!isGroup) {
      await sock.sendMessage(msg.key.remoteJid, { text: "❌ هذا الأمر يعمل في المجموعات فقط." });
      return;
    }
    const groupJid = msg.key.remoteJid;

    const target = await getTargetJid(sock, msg, args);
    if (!target) {
      await sock.sendMessage(groupJid, {
        text: "❌ استخدم: *.طرد @الشخص* أو رد على رسالة الشخص، أو *.طرد [رقم]*",
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
