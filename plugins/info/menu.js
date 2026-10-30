import { getPlugins } from "../../core/pluginLoader.js";
import { db } from "../../database/db.js";
import config from "../../config.js";
import {
  isArabic,
  categoryLabel,
  categoryKey,
  sortCategories,
  pickName,
  rawTextOf,
} from "../../core/i18n.js";

export default {
  name: ["menu", "اوامر", "الاوامر", "قائمة", "الأوامر", "help", "ayuda", "القائمة", "مساعدة"],
  description: "يعرض قائمة أوامر البوت",
  category: "info, المعلومات",
  ownerOnly: false,

  async run({ sock, from, sender, senderNum, isGroup, groupName, usedPrefix, msg }) {
    const lugar = isGroup ? groupName : "محادثة خاصة";

    // اللغة من الأمر المستدعى نفسه: ".قائمة" → عربي، ".menu" → إسباني.
    const invoked = rawTextOf(msg)
      .slice(String(usedPrefix || "").length)
      .trim()
      .split(/\s+/)[0] || "";
    const lang = isArabic(invoked) ? "ar" : "es";

    const currentBotNum = sock.user?.id
      ? sock.user.id.split("@")[0].split(":")[0].replace(/\D/g, "")
      : "";
    const currentBotJid = currentBotNum ? `${currentBotNum}@s.whatsapp.net` : "";
    const botData = db.getBot(currentBotJid) || db.getBot("main");

    const esLabelAutomatico =
      botData?.label?.startsWith("SUB_") || botData?.label === "Subbot" || botData?.label === "MAIN";
    const nombreBot = (esLabelAutomatico || !botData?.label ? config.botName : botData.label).replace(/@\d+/g, "").trim();
    const tipoBot = botData?.isMain === true || botData?.isMain === 1 ? "البوت الرئيسي" : "بوت فرعي";

    const esOwner = config.ownerNumber?.includes(senderNum) || config.coOwners?.includes(senderNum);

    const plugins = getPlugins();
    const categorias = {};
    const seen = new Set();

    for (const [, plugin] of plugins) {
      if (seen.has(plugin)) continue;
      seen.add(plugin);

      const key = categoryKey(plugin.category);
      // Owner commands are hidden from everyone else.
      if (key === "owner" && !esOwner) continue;

      if (!categorias[key]) categorias[key] = { raw: plugin.category, cmds: new Set() };
      categorias[key].cmds.add(pickName(plugin.name, lang));
    }

    const ui = {
      ar: {
        type: "النوع",
        place: "المكان",
        prefix: "البادئة",
        commands: "الأوامر",
        noCommands: "❌ لا توجد أوامر متاحة.",
      },
      es: {
        type: "ᴛɪᴘᴏ",
        place: "ʟᴜɢᴀʀ",
        prefix: "ᴘʀᴇꜰɪᴊᴏ",
        commands: "ᴄᴏᴍᴀɴᴅᴏs",
        noCommands: "❌ No hay comandos disponibles.",
      },
    }[lang];

    let texto = `╭━━━━━━━━━━━━━━━━━━━━━━╮\n`;
    texto += `   *${nombreBot}*\n`;
    texto += `╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n`;
    texto += lang === "ar" ? `مرحباً @${senderNum} 👋\n` : `¡Hola! @${senderNum} 👋\n`;
    texto += `├ ${ui.type}: ${tipoBot}\n`;
    texto += `├ ${ui.place}: ${lugar}\n`;
    texto += `├ ${ui.prefix}: ${usedPrefix}\n`;
    texto += `╰ ${ui.commands}: ${seen.size}\n\n`;

    const cats = sortCategories(Object.keys(categorias));

    if (cats.length === 0) {
      return await sock.sendMessage(from, { text: ui.noCommands }, { quoted: msg });
    }

    for (const key of cats) {
      const { raw, cmds } = categorias[key];
      const nombre = categoryLabel(raw, lang);
      texto += `╭─〔 *${lang === "ar" ? nombre : nombre.toUpperCase()}* 〕\n`;
      for (const cmd of [...cmds].filter(Boolean).sort()) {
        texto += `│ ▸ ${usedPrefix}${cmd}\n`;
      }
      texto += `╰──────────────\n\n`;
    }

    texto += `> ${config.dev}\n`;
    texto += `> ${config.author}`;

    try {
      await sock.sendMessage(from, { text: texto, mentions: [sender] }, { quoted: msg });
    } catch {
      await sock.sendMessage(from, { text: texto, mentions: [sender] });
    }
  },
};
