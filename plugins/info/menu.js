import { getPlugins } from "../../core/pluginLoader.js";
import { db } from "../../database/db.js";
import config from "../../config.js";

// Categories are shown in Arabic, in a fixed order, so the menu reads the same
// on every bot regardless of the order the plugins happen to load in.
const CATEGORIAS = {
  info: "المعلومات",
  grupos: "المجموعات",
  economy: "الاقتصاد",
  dl: "التحميل",
  stickers: "الملصقات",
  utils: "الأدوات",
  herramientas: "الأدوات",
  ia: "الذكاء الاصطناعي",
  sockets: "البوتات الفرعية",
  owner: "المالك",
  misc: "متنوع",
};

const ORDEN = ["info", "grupos", "economy", "dl", "stickers", "utils", "herramientas", "ia", "sockets", "misc", "owner"];

export default {
  name: ["menu", "help", "ayuda"],
  description: "يعرض قائمة أوامر البوت",
  category: "info",
  ownerOnly: false,

  async run({ sock, from, sender, senderNum, isGroup, groupName, usedPrefix, msg }) {
    const lugar = isGroup ? groupName : "محادثة خاصة";

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

      const cat = plugin.category || "misc";
      // Owner commands are hidden from everyone else.
      if (cat === "owner" && !esOwner) continue;

      if (!categorias[cat]) categorias[cat] = new Set();
      const names = Array.isArray(plugin.name) ? plugin.name : [plugin.name];
      categorias[cat].add(names[0]);
    }

    let texto = `╭━━━━━━━━━━━━━━━━━━━━━━╮\n`;
    texto += `   *${nombreBot}*\n`;
    texto += `╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n`;
    texto += `مرحباً @${senderNum} 👋\n`;
    texto += `├ النوع: ${tipoBot}\n`;
    texto += `├ المكان: ${lugar}\n`;
    texto += `├ البادئة: ${usedPrefix}\n`;
    texto += `╰ الأوامر: ${seen.size}\n\n`;

    const cats = Object.keys(categorias).sort((a, b) => {
      const ia = ORDEN.indexOf(a);
      const ib = ORDEN.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    for (const cat of cats) {
      const nombre = CATEGORIAS[cat] || cat.toUpperCase();
      texto += `╭─〔 *${nombre}* 〕\n`;
      for (const cmd of [...categorias[cat]].sort()) {
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
