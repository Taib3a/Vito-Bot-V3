import { isFeatureEnabled, getSetting, setSetting } from "../القاعدة.js";
import log from "../الكونسل.js";

const LEVELS = [
  { name: "مبتدئ", min: 0, xp: 0 },
  { name: "نشيط", min: 10, xp: 100 },
  { name: "متقدم", min: 25, xp: 300 },
  { name: "محترف", min: 50, xp: 700 },
  { name: "خبير", min: 100, xp: 1500 },
  { name: "أسطورة", min: 200, xp: 3000 },
];

function levelFromXp(xp) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xp) return { ...LEVELS[i], index: i };
  }
  return { ...LEVELS[0], index: 0 };
}

function xpKey(groupJid, jid) {
  return `xp:${groupJid}:${jid}`;
}

export default {
  name: "auto_level",

  async onMessage({ sock, msg, senderJid, groupJid }) {
    if (!(await isFeatureEnabled(groupJid, "auto_level"))) return;
    if (msg.key.fromMe) return;

    try {
      const current = await getSetting(xpKey(groupJid, senderJid), "0");
      const xp = parseInt(current, 10) + 15;
      await setSetting(xpKey(groupJid, senderJid), String(xp));

      const oldLevel = levelFromXp(xp - 15);
      const newLevel = levelFromXp(xp);

      if (newLevel.index > oldLevel.index) {
        await sock.sendMessage(groupJid, {
          text: `🎉 مبروك @${senderJid.split("@")[0]}! وصلت إلى مستوى: *${newLevel.name}* (XP: ${xp})`,
          mentions: [senderJid],
        });
        log.info(`Auto-level: ${senderJid} reached ${newLevel.name} in ${groupJid}`);
      }
    } catch (err) {
      log.error(err.message, "مستوى-تلقائي.js", err.stack);
    }
  },
};
