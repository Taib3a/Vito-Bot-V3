import { isGroupActive, setGroupActive, registerGroup } from "../../الاضافات/القاعدة.js";
import { botName } from "../../الاضافات/الاعدادات.js";

export default {
  name: "تفعيل",
  description: "تفعيل البوت في هذه المجموعة",
  async execute({ sock, msg, senderJid, isGroup }) {
    if (!isGroup) {
      await sock.sendMessage(msg.key.remoteJid, { text: "❌ هذا الأمر يعمل في المجموعات فقط." });
      return;
    }
    const groupJid = msg.key.remoteJid;
    await registerGroup(groupJid);

    const sender = senderJid.split("@")[0];
    await setGroupActive(groupJid, true);
    await sock.sendMessage(groupJid, {
      text: `✅ تم تفعيل *${botName}* في هذه المجموعة بواسطة @${sender}.\nاستخدم *.تعطيل* لإيقافه.`,
      mentions: [senderJid],
    });
  },
};

export const deactivate = {
  name: "تعطيل",
  description: "إيقاف البوت في هذه المجموعة",
  async execute({ sock, msg, senderJid, isGroup }) {
    if (!isGroup) {
      await sock.sendMessage(msg.key.remoteJid, { text: "❌ هذا الأمر يعمل في المجموعات فقط." });
      return;
    }
    const groupJid = msg.key.remoteJid;
    await registerGroup(groupJid);

    const sender = senderJid.split("@")[0];
    await setGroupActive(groupJid, false);
    await sock.sendMessage(groupJid, {
      text: `⛔ تم إيقاف *${botName}* في هذه المجموعة بواسطة @${sender}.\nاستخدم *.تفعيل* لإعادة تشغيله.`,
      mentions: [senderJid],
    });
  },
};
