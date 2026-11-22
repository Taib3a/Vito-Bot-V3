import config from "../../Corleone/settings.js";
import { activeBots } from "../../Corleone/subbotManager.js";
import { jidNormalizedUser, isLidUser } from "@whiskeysockets/baileys";

export default {
  name: ["بوتات"],
  description: "يعرض البوتات المتصلة في المجموعة الحالية",
  category: "البوتات الفرعية",
  groupOnly: true,

  async run({ sock, from, msg, react, reply, groupMeta }) {

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

      const botName = (() => {
        const names = (Array.isArray(global.botNames) ? global.botNames : [])
          .map((n) => String(n || "").normalize("NFKC").trim())
          .filter((n) => n && /^[\x20-\x7E]+$/.test(n));
        if (names.length) return names[0];
        return String(config.botName || "BOT").normalize("NFKC");
      })();

      let report = `قائمة البوتات النشطة\n`;
      report += `الرئيسي: ${botName}\n`;
      report += `البوتات الفرعية المتصلة: ${subbotsConectados.length}\n`;
      report += `في هذه المجموعة: ${subbotsEnGrupo.length}\n\n`;

      if (principalTarget) {
        const jidPrincipal = jidNormalizedUser(principalTarget.id);
        const digitosVisibles = jidPrincipal.split("@")[0];
        participantsMentions.push(jidPrincipal);
        report += `البوت: @${digitosVisibles}\n`;
        report += `النوع: رئيسي\n\n`;
      }

      if (subbotsEnGrupo.length > 0) {
        for (const bot of subbotsEnGrupo) {
          const digitosVisibles = bot.targetJid.split("@")[0];
          participantsMentions.push(bot.targetJid);
          report += `البوت: @${digitosVisibles}\n`;
          report += `النوع: بوت فرعي\n\n`;
        }
      } else if (!principalTarget) {
        report += `لا يوجد أي بوت من هذا النظام داخل هذه المجموعة.\n\n`;
      }

      report += `Powered by Taib`;

      let imageUrl = null;
      if (Array.isArray(global.botImages) && global.botImages.length) {
        imageUrl = global.botImages[Math.floor(Math.random() * global.botImages.length)];
      }
      if (!imageUrl) {
        try {
          imageUrl = await sock.profilePictureUrl(jidNormalizedUser(sock.user?.id || ""), "image");
        } catch {}
      }

      const mentions = participantsMentions.filter(Boolean);
      const payload = imageUrl
        ? { image: { url: imageUrl }, caption: report, mentions }
        : { text: report, mentions };

      try {
        await sock.sendMessage(from, payload, { quoted: msg });
      } catch (e) {
        if (!imageUrl) throw e;
        await sock.sendMessage(from, { text: report, mentions }, { quoted: msg });
      }

      await react("✅");
    } catch (e) {
      console.error(e);
      await react("❌");
      if (reply) await reply({ text: `Failed` });
    }
  }
};