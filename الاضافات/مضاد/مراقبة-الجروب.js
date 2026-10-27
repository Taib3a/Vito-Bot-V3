import { isFeatureEnabled } from "../القاعدة.js";
import log from "../الكونسل.js";

export default {
  name: "group_monitor",

  async onGroupUpdate({ sock, update }) {
    const groupJid = update.id;
    if (!groupJid?.endsWith("@g.us")) return;
    if (!(await isFeatureEnabled(groupJid, "group_monitor"))) return;

    try {
      if (update.announce !== undefined) {
        const state = update.announce ? "مقفولة" : "مفتوحة";
        await sock.sendMessage(groupJid, {
          text: `📢 إعدادات المجموعة تم تغييرها — الرسائل الآن: ${state}`,
        });
      }

      if (update.restrict !== undefined) {
        const state = update.restrict ? "للمشرفين فقط" : "للجميع";
        await sock.sendMessage(groupJid, {
          text: `📢 إعدادات المجموعة تم تغييرها — تعديل البيانات: ${state}`,
        });
      }

      if (update.subject !== undefined) {
        await sock.sendMessage(groupJid, {
          text: `📢 اسم المجموعة تغير إلى: ${update.subject}`,
        });
      }

      if (update.desc !== undefined) {
        await sock.sendMessage(groupJid, {
          text: `📢 وصف المجموعة تم تحديثه.`,
        });
      }
    } catch (err) {
      log.error(`Group monitor error: ${err.message}`);
    }
  },

  async onGroupParticipantsUpdate({ sock, groupJid, participants, action }) {
    if (!(await isFeatureEnabled(groupJid, "group_monitor"))) return;

    try {
      for (const jid of participants) {
        if (action === "promote") {
          await sock.sendMessage(groupJid, {
            text: `📢 @${jid.split("@")[0]} أصبح مشرفاً.`,
            mentions: [jid],
          });
        } else if (action === "demote") {
          await sock.sendMessage(groupJid, {
            text: `📢 @${jid.split("@")[0]} تم إزالته من المشرفين.`,
            mentions: [jid],
          });
        }
      }
    } catch (err) {
      log.error(`Group monitor participants error: ${err.message}`);
    }
  },
};
