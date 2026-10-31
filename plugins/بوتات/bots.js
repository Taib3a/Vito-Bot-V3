import config from "../../config.js";
import { activeBots } from "../../core/subbotManager.js";
import { jidNormalizedUser, isLidUser } from "@whiskeysockets/baileys";

export default {
  name: ["bots", "listbots", "البوتات"],
  description: "Muestra los bots conectados en el grupo actual",
  category: "sockets, البوتات الفرعية",
  groupOnly: true,

  async run({ sock, from, msg, react, reply, groupMeta, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);
    try {
      await react("🤖");

      const limpiarNumero = (jid = "") =>
        jid.split("@")[0].split(":")[0].replace(/\D/g, "");

      const metadata = groupMeta || (await sock.groupMetadata(from));

      const findTarget = (numero, lid) => {
        return metadata.participants.find((p) => {
          const clean = jidNormalizedUser(p.id);
          if (!isLidUser(clean)) return clean === `${numero}@s.whatsapp.net`;
          return lid && limpiarNumero(clean) === lid;
        });
      };

      const mainLive = activeBots.get("main");
      const principalLive = mainLive?.status === "online" ? mainLive : null;

      const subbotsConectados = [...activeBots.values()]
        .filter((b) => !b.isMain && b.status === "online" && b.jid);

      const subbotsEnGrupo = subbotsConectados
        .map((bot) => {
          const numero = limpiarNumero(bot.jid);
          const target = findTarget(numero, bot.lid);
          return target ? { ...bot, numero, targetJid: jidNormalizedUser(target.id) } : null;
        })
        .filter(Boolean);

      const principalTarget = principalLive
        ? findTarget(limpiarNumero(principalLive.jid), principalLive.lid)
        : null;

      const participantsMentions = [];

      let report = tr("•.°· ◇ `ᒪIՏTᗩ ᗪᗴ ᗷOTՏ ᗩᑕTIᐯOՏ` ◇ ·°.•\n", "•.°· ◇ `قائمة البوتات النشطة` ◇ ·°.•\n");
      report += tr(`〔💎〕Principal: ${config.botName}\n`, `〔💎〕الرئيسي: ${config.botName}\n`);
      report += tr(`〔🌀〕Sub-bots conectados: ${subbotsConectados.length}\n`, `〔🌀〕البوتات الفرعية المتصلة: ${subbotsConectados.length}\n`);
      report += tr(`〔🌱〕En este grupo: ${subbotsEnGrupo.length}\n\n`, `〔🌱〕في هذه المجموعة: ${subbotsEnGrupo.length}\n\n`);

      if (principalTarget) {
        const jidPrincipal = jidNormalizedUser(principalTarget.id);
        const digitosVisibles = jidPrincipal.split("@")[0];
        participantsMentions.push(jidPrincipal);
        report += `> *𖠌 ʙᴏᴛ::* @${digitosVisibles}\n`;
        report += tr(`> *⚝ ᴛɪᴘᴏ::* Principal 👑\n\n`, `> *⚝ ᴛɪᴘᴏ::* رئيسي 👑\n\n`);
      }

      if (subbotsEnGrupo.length > 0) {
        for (const bot of subbotsEnGrupo) {
          const digitosVisibles = bot.targetJid.split("@")[0];
          participantsMentions.push(bot.targetJid);
          report += `> *𖠌 ʙᴏᴛ::* @${digitosVisibles}\n`;
          report += `> *⚝ ᴛɪᴘᴏ::* Sub-bot 🌀\n\n`;
        }
      } else if (!principalTarget) {
        report += tr(`⚠️ No hay ningún bot de este sistema dentro de este grupo.\n\n`, `⚠️ لا يوجد أي بوت من هذا النظام داخل هذه المجموعة.\n\n`);
      }

      report += `🪼 _Powered by DuarteXV_`;

      await sock.sendMessage(
        from,
        { text: report, mentions: participantsMentions.filter(Boolean) },
        { quoted: msg }
      );

      await react("✅");
    } catch (e) {
      console.error(e);
      await react("❌");
      if (reply) await reply({ text: `Failed` });
    }
  }
};