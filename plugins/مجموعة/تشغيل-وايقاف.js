import {
  isFeatureEnabled,
  setFeatureEnabled,
  registerGroup,
  isGroupActive,
} from "../../الاضافات/القاعدة.js";
import { botName } from "../../الاضافات/الاعدادات.js";

const VALID_FEATURES = {
  "مضاد-روابط": "anti_links",
  "ترحيب": "welcome",
  "مراقبة": "group_monitor",
  "مضاد-بوتات": "anti_bots",
  "مستوى": "auto_level",
};

const FEATURE_AR = {
  anti_links: "مضاد الروابط",
  welcome: "الترحيب والوداع",
  group_monitor: "مراقبة المجموعة",
  anti_bots: "مضاد البوتات",
  auto_level: "المستوى التلقائي",
};

export default {
  name: "تشغيل",
  description: "تشغيل ميزة في هذه المجموعة",
  async execute({ sock, msg, args, senderJid, isGroup }) {
    if (!isGroup) {
      await sock.sendMessage(msg.key.remoteJid, { text: "❌ هذا الأمر يعمل في المجموعات فقط." });
      return;
    }
    const groupJid = msg.key.remoteJid;
    await registerGroup(groupJid);

    if (!(await isGroupActive(groupJid))) {
      await sock.sendMessage(groupJid, { text: `❌ البوت غير مفعّل هنا. استخدم *.تفعيل* أولاً.` });
      return;
    }

    const featureName = args[0];
    if (!featureName || !VALID_FEATURES[featureName]) {
      const list = Object.keys(VALID_FEATURES).map((k) => `  • ${k}`).join("\n");
      await sock.sendMessage(groupJid, {
        text: `❌ استخدم: *.تشغيل [الميزة]*\n\nالميزات المتاحة:\n${list}`,
      });
      return;
    }

    const featureKey = VALID_FEATURES[featureName];
    await setFeatureEnabled(groupJid, featureKey, true);
    await sock.sendMessage(groupJid, {
      text: `✅ تم تشغيل ميزة *${FEATURE_AR[featureKey]}* في هذه المجموعة.`,
    });
  },
};

export const stopFeature = {
  name: "ايقاف",
  description: "إيقاف ميزة في هذه المجموعة",
  async execute({ sock, msg, args, senderJid, isGroup }) {
    if (!isGroup) {
      await sock.sendMessage(msg.key.remoteJid, { text: "❌ هذا الأمر يعمل في المجموعات فقط." });
      return;
    }
    const groupJid = msg.key.remoteJid;
    await registerGroup(groupJid);

    if (!(await isGroupActive(groupJid))) {
      await sock.sendMessage(groupJid, { text: `❌ البوت غير مفعّل هنا.` });
      return;
    }

    const featureName = args[0];
    if (!featureName || !VALID_FEATURES[featureName]) {
      const list = Object.keys(VALID_FEATURES).map((k) => `  • ${k}`).join("\n");
      await sock.sendMessage(groupJid, {
        text: `❌ استخدم: *.ايقاف [الميزة]*\n\nالميزات المتاحة:\n${list}`,
      });
      return;
    }

    const featureKey = VALID_FEATURES[featureName];
    await setFeatureEnabled(groupJid, featureKey, false);
    await sock.sendMessage(groupJid, {
      text: `⛔ تم إيقاف ميزة *${FEATURE_AR[featureKey]}* في هذه المجموعة.`,
    });
  },
};
