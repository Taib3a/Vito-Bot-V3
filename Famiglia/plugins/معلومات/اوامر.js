import axios from "axios";
import { getPlugins } from "../../Corleone/pluginLoader.js";
import { db } from "../../database/db.js";
import { getMainSock } from "../../Corleone/subbotManager.js";
import config from "../../Corleone/settings.js";


let bannerCache = null;
let bannerCacheTime = 0;
let lastUsedUrl = null;


async function getBuffer(url) {
  const res = await axios({ method: "get", url, responseType: "arraybuffer" });
  return Buffer.from(res.data);
}


async function getBannerBuffer(url) {
  if (bannerCache && lastUsedUrl === url && Date.now() - bannerCacheTime < 3600000)
    return bannerCache;
  bannerCache = await getBuffer(url);
  bannerCacheTime = Date.now();
  lastUsedUrl = url;
  return bannerCache;
}


function img(conn) {
  try {
    if (typeof global.getBotImage === "function") return global.getBotImage();
    if (Array.isArray(global.botImages) && global.botImages.length)
      return global.botImages[Math.floor(Math.random() * global.botImages.length)];
    const botId = conn?.user?.id?.split(":")[0] + "@s.whatsapp.net";
    const botData = db.getBot?.(botId) || db.getBot?.("main");
    if (botData?.banner) return botData.banner;
    return "";
  } catch (e) {
    return "";
  }
}


function name(conn) {
  try {
    if (typeof global.getBotName === "function") return global.getBotName();
    if (Array.isArray(global.botNames) && global.botNames.length)
      return global.botNames[Math.floor(Math.random() * global.botNames.length)];
    const botId = conn?.user?.id?.split(":")[0] + "@s.whatsapp.net";
    const botData = db.getBot?.(botId) || db.getBot?.("main");
    if (botData?.label && !botData.label.startsWith("SUB_")) return botData.label;
    return config.botName || "Bot";
  } catch (e) {
    return config.botName || "Bot";
  }
}


function getRmr() {
  if (typeof global.rmr === "string") return global.rmr;
  if (typeof global.my?.rmr === "string") return global.my.rmr;
  return "";
}


function isArabic(text) {
  return /[\u0600-\u06FF]/.test(text);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}


// ═══════════════════════════════════════
// ── دالة وقت التشغيل ──
// ═══════════════════════════════════════
function getUptime() {
  const uptime = process.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);


  const parts = [];
  if (days > 0) parts.push(`${days}ي`);
  if (hours > 0) parts.push(`${hours}س`);
  if (minutes > 0) parts.push(`${minutes}د`);
  parts.push(`${seconds}ث`);


  return parts.join(" ");
}


export default {
  name: ["اوامر"],
  description: "يعرض قائمة الأوامر مع طرق العرض والشرح.",
  category: "المعلومات",
  ownerOnly: false,


  async run({ sock, from, sender, senderNum, isGroup, groupName, usedPrefix, msg, args, cmdName }) {
    try {
      // ✅ اكتشف اللغة من الرسالة الأصلية
      let rawText = "";
      try {
        const m = msg?.message || {};
        rawText =
          m.conversation ||
          m.extendedTextMessage?.text ||
          m.imageMessage?.caption ||
          m.videoMessage?.caption ||
          "";
      } catch (e) { rawText = ""; }


      const afterPrefix = rawText.startsWith(usedPrefix)
        ? rawText.slice(usedPrefix.length).trim()
        : rawText.trim();
      const invokedCommand = afterPrefix.split(/\s+/)[0] || "";


      const lang = isArabic(String(cmdName || invokedCommand)) || isArabic(rawText) ? "ar" : "es";


      const currentBotNum = sock.user?.id
        ? sock.user.id.split("@")[0].split(":")[0].replace(/\D/g, "")
        : "";
      const currentBotJid = currentBotNum ? `${currentBotNum}@s.whatsapp.net` : "";


      let botData = db.getBot(currentBotJid) || db.getBot("main");


      const nombreBot = name(sock);
      const urlFoto = img(sock) || botData?.banner;


      // المقبس نفسه هو المرجع: جدول البوتات قد يحمل صفاً قديماً بـisMain:false،
      // والمقترن حديثاً قد لا يملك صفاً بعد — فيُعرَض الرئيسي كـ"بوت فرعي".
      // الوسم sock.isMainBot يُضبط عند إنشاء الاتصال، فهو الفصل القاطع.
      const esVerdaderoMain =
        sock.isMainBot === true
          ? true
          : sock.isMainBot === false
            ? false
            : sock === getMainSock() ||
              botData?.isMain === true ||
              botData?.isMain === 1 ||
              (global.mainBotNum && currentBotNum === String(global.mainBotNum));


      const esOwnerOCoOwner =
        config.ownerNumber?.includes(senderNum) ||
        config.coOwners?.includes(senderNum);


      const plugins = getPlugins();
      const seen = new Set();


      // ✅ سنبني الأقسام ديناميكيًا بناءً على category في الملفات
      const categories = {}; // { categoryName: Set(commands) }
      const commandInfo = new Map(); // commandName -> { description }


      for (const [, plugin] of plugins) {
        if (seen.has(plugin)) continue;
        seen.add(plugin);


        // استخرج الـ category كاملًا (قد يحتوي على "owner, المطور")
        const catRaw = plugin.category || "misc";


        // ✅ اقسم على الفاصلة واختر الجزء المطابق للغة
        const catParts = String(catRaw).split(",").map(s => s.trim()).filter(Boolean);


        let catDisplay;
        if (lang === "ar") {
          // ابحث عن الجزء العربي من category
          const arabicPart = catParts.find(p => isArabic(p));
          catDisplay = arabicPart || catParts[0] || "misc";
        } else {
          // ابحث عن الجزء غير العربي
          const nonArabicPart = catParts.find(p => !isArabic(p));
          catDisplay = nonArabicPart || catParts[0] || "misc";
        }


        // أقسام المالك/المطور مخفية عن غير المصرّح لهم.
        if ((catDisplay === "المالك" || catDisplay === "المطور") && !esOwnerOCoOwner) continue;


        const names = Array.isArray(plugin.name) ? plugin.name : [plugin.name];
        const arabicNames = names.filter(n => isArabic(n));
        const nonArabicNames = names.filter(n => !isArabic(n));


        if (!categories[catDisplay]) categories[catDisplay] = new Set();


        const displayName = lang === "ar" ? arabicNames[0] : nonArabicNames[0];
        if (!displayName) continue;
        categories[catDisplay].add(displayName);
        commandInfo.set(displayName, {
          description: String(plugin.description || plugin.desc || "").trim(),
        });
      }


      if (Object.keys(categories).length === 0) {
        return await sock.sendMessage(from, {
          text: lang === "ar"
            ? "❌ لا توجد أوامر عربية حاليًا."
            : "❌ No hay comandos disponibles."
        }, { quoted: msg });
      }


      // ✅ نصوص الواجهة حسب اللغة
      const ui = {
        ar: {
          greeting: `*أهلاً!* *@${senderNum}* أنا "${nombreBot}"`,
          type: "النوع",
          system: "النظام/المشغل",
          user: "المستخدم",
          uptime: "وقت تشغيل",
          botMain: "بوت رئيسي",
          subbot: "بوت فرعي",
          android: "أندرويد",
          sector: "القسم",
        },
        es: {
          greeting: `*𝐇𝐨𝐥𝐚!* *@${senderNum}* soy "${nombreBot}"`,
          type: "ᴛɪᴘᴏ",
          system: "sɪsᴛᴇᴍᴀ/ᴏᴘʀ",
          user: "ᴜsᴇʀ",
          uptime: "ᴜᴘᴛɪᴍᴇ",
          botMain: "Bot Principal",
          subbot: "Subbot",
          android: "Android",
          sector: "SECTOR",
        },
      }[lang];


      const tipoBot = esVerdaderoMain ? ui.botMain : ui.subbot;


      let menuHeader = `${ui.greeting}\n`;
      menuHeader += `╭━━━━━━━━━━━━━━━━━━\n`;
      menuHeader += `│ 𖠌 \`${ui.type}::\` ${tipoBot}\n`;
      menuHeader += `│ 𖠌 \`${ui.system}::\` ${ui.android}\n`;
      menuHeader += `│ 𖠌 \`${ui.user}::\` @${senderNum}\n`;
      menuHeader += `│ 𖠌 \`${ui.uptime}::\` ${getUptime()}\n`;
      menuHeader += `╰━━━━━━━━━━━━━━━━━━\n\n`;
      let textoMenu = menuHeader;


      // ✅ اعرض الأقسام كما استخرجناها من الملفات
      for (const [cat, cmds] of Object.entries(categories)) {
        textoMenu += `𓆩◇𓆪 ⸙ ${ui.sector}│ *${cat.toUpperCase()}* ·°ᰍ•\n`;


        for (const cmd of cmds) {
          textoMenu += `• ${usedPrefix}${cmd}\n`;
        }
        textoMenu += `\n`;
      }


      textoMenu += `╭━─━─━─━─━─━─━─━╮\n`;
      textoMenu += `🕴🏻 _تم تطوير من قبل Taib_ │\n`;
      textoMenu += `╰━─━─━─━─━─━─━─━╯\n\n`;
      textoMenu += getRmr();


      const nombreRandom = global.botNames[Math.floor(Math.random() * global.botNames.length)];
      const nombreRandom2 = global.botNames[Math.floor(Math.random() * global.botNames.length)];
      const imagenRandom = global.botImages[Math.floor(Math.random() * global.botImages.length)];
      const canalJid = "120363429662971001@newsletter";
      const image = urlFoto || imagenRandom;

      const sendPanel = async (text, buttons = [], sections = [], selectLabel = "") => {
        if (typeof sock.sendButtonMessage !== "function") {
          return await sock.sendMessage(from, { text }, { quoted: msg });
        }
        try {
          await sock.sendButtonMessage(from, text, buttons, {
            title: nombreBot,
            footer: nombreRandom,
            quoted: msg,
            image,
            mentions: [sender],
            sections,
            selectLabel,
            contextInfo: {
              mentionedJid: [sender],
              isForwarded: true,
              forwardingScore: 1,
              forwardedNewsletterMessageInfo: {
                newsletterJid: canalJid,
                newsletterName: nombreRandom2,
                serverMessageId: -1,
              },
            },
          });
        } catch {
          await sock.sendMessage(from, { text }, { quoted: msg });
        }
      };

      const sendImageCaption = async (caption) => {
        const sources = [
          ...new Set(
            [image, ...(Array.isArray(global.botImages) ? global.botImages : [])].filter(Boolean)
          ),
        ];
        for (const src of sources) {
          try {
            await sock.sendMessage(
              from,
              typeof src === "string"
                ? { image: { url: src }, caption }
                : { image: src, caption },
              { quoted: msg }
            );
            return true;
          } catch {}
        }
        return false;
      };

      const cmd = `${usedPrefix}اوامر`;
      const modeRaw = String(args?.[0] || "");
      const mode = modeRaw.toLowerCase();
      const catArg = String(args?.slice(1).join(" ") || "").trim();
      const isClick =
        ["ازرار", "أزرار", "buttons", "button"].includes(mode) ||
        mode.startsWith("ازرار-") ||
        mode.startsWith("buttons-");
      const isList = ["قائمة", "قائمه", "list", "dropdown"].includes(mode);
      const isText = ["نص", "نصي", "text"].includes(mode);
      const isExplain =
        ["اشرح", "شرح", "explain"].includes(mode) || mode.startsWith("اشرح-");

      const modePrompt = async () => {
        const modeButtons = lang === "ar"
          ? [
              { text: "🔵 أزرار قابلة للضغط", id: `${cmd} ازرار` },
              { text: "📋 أزرار منسدلة", id: `${cmd} قائمة` },
              { text: "📜 القائمة النصية", id: `${cmd} نص` },
              { text: "🧠 اشرح لي", id: `${cmd} اشرح` },
            ]
          : [
              { text: "🔵 Botones pulsables", id: `${cmd} buttons` },
              { text: "📋 Menú desplegable", id: `${cmd} list` },
              { text: "📜 Lista de texto", id: `${cmd} text` },
              { text: "🧠 Explícame", id: `${cmd} explain` },
            ];
        await sendPanel(
          lang === "ar"
            ? `${menuHeader}اختر طريقة عرض الأوامر:`
            : `${menuHeader}Elige cómo mostrar los comandos:`,
          modeButtons
        );
      };

      if (!mode) {
        return await modePrompt();
      }

      if (isClick) {
        const cats = Object.keys(categories);
        const PAGE_SIZE = 2;
        const findCat = (value) =>
          cats.find((c) => c === value) ||
          cats.find((c) => c.toLowerCase() === String(value).toLowerCase());

        const sendCategoryPage = async (page = 0) => {
          const total = Math.ceil(cats.length / PAGE_SIZE);
          const safePage = Math.max(0, Math.min(page, Math.max(total - 1, 0)));
          const pageCats = cats.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
          const btns = pageCats.map((cat) => ({
            text: `${cat} (${categories[cat].size})`,
            id: `${cmd} ازرار-قسم_0_${encodeURIComponent(cat)}`,
          }));
          if (safePage + 1 < total) {
            btns.push({
              text: lang === "ar" ? "➕ المزيد" : "➕ Más",
              id: `${cmd} ازرار-المزيد_${safePage + 1}`,
            });
          }
          if (safePage > 0) {
            btns.push({
              text: lang === "ar" ? "↩️ السابق" : "↩️ Anterior",
              id: `${cmd} ازرار-المزيد_${safePage - 1}`,
            });
          }
          return await sendPanel(
            lang === "ar"
              ? `اختر القسم (${safePage + 1}/${total}):`
              : `Elige una categoría (${safePage + 1}/${total}):`,
            btns
          );
        };

        const sendCategoryText = async (catName) => {
          const cat = findCat(catName);
          if (!cat) {
            return await sock.sendMessage(
              from,
              { text: lang === "ar" ? "❌ القسم غير موجود." : "❌ Categoría no encontrada." },
              { quoted: msg }
            );
          }
          const cmds = [...categories[cat]];
          const header =
            lang === "ar"
              ? `القسم: ${cat}\nعدد الأوامر: ${cmds.length}\n\n`
              : `Categoría: ${cat}\nComandos: ${cmds.length}\n\n`;
          const footer = `\n\n${nombreBot}`;
          const text = `${header}${cmds.map((c) => `• ${usedPrefix}${c}`).join("\n")}${footer}`;

          if (text.length <= 1024) {
            if (await sendImageCaption(text)) return;
            return await sock.sendMessage(from, { text }, { quoted: msg });
          }

          const shortCaption =
            lang === "ar"
              ? `القسم: ${cat}\nعدد الأوامر: ${cmds.length}\n\n${nombreBot}`
              : `Categoría: ${cat}\nComandos: ${cmds.length}\n\n${nombreBot}`;
          await sendImageCaption(shortCaption);
          await sock.sendMessage(from, { text }, { quoted: msg });
        };

        if (mode === "ازرار" || mode === "أزرار" || mode === "buttons" || mode === "button") {
          return await sendCategoryPage(0);
        }
        if (mode.startsWith("ازرار-المزيد_")) {
          const page = parseInt(modeRaw.slice("ازرار-المزيد_".length), 10) || 0;
          return await sendCategoryPage(page);
        }
        if (mode.startsWith("ازرار-قسم_")) {
          const rest = modeRaw.slice("ازرار-قسم_".length);
          const [, ...catParts] = rest.split("_");
          const cat = decodeURIComponent(catParts.join("_"));
          return await sendCategoryText(cat);
        }
        if (catArg) {
          return await sendCategoryText(catArg);
        }
        return await sendCategoryPage(0);
      }

      if (isExplain) {
        const cats = Object.keys(categories);
        const PAGE_SIZE = 2;
        const findCat = (value) =>
          cats.find((c) => c === value) ||
          cats.find((c) => c.toLowerCase() === String(value).toLowerCase());

        const sendExplainCategories = async (page = 0) => {
          const total = Math.ceil(cats.length / PAGE_SIZE);
          const safePage = Math.max(0, Math.min(page, Math.max(total - 1, 0)));
          const pageCats = cats.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
          const btns = pageCats.map((cat) => ({
            text: `${cat} (${categories[cat].size})`,
            id: `${cmd} اشرح-قسم_0_${encodeURIComponent(cat)}`,
          }));
          if (safePage + 1 < total) {
            btns.push({
              text: lang === "ar" ? "➕ المزيد" : "➕ Más",
              id: `${cmd} اشرح-المزيد_${safePage + 1}`,
            });
          }
          if (safePage > 0) {
            btns.push({
              text: lang === "ar" ? "↩️ السابق" : "↩️ Anterior",
              id: `${cmd} اشرح-المزيد_${safePage - 1}`,
            });
          }
          return await sendPanel(
            lang === "ar"
              ? `اختر القسم لشرح أوامره (${safePage + 1}/${total}):`
              : `Elige una categoría para explicar (${safePage + 1}/${total}):`,
            btns
          );
        };

        const sendExplainCategory = async (catName) => {
          const cat = findCat(catName);
          if (!cat) {
            return await sock.sendMessage(
              from,
              { text: lang === "ar" ? "❌ القسم غير موجود." : "❌ Categoría no encontrada." },
              { quoted: msg }
            );
          }
          const cmds = [...categories[cat]];
          const lines = cmds.map((name) => {
            const desc = commandInfo.get(name)?.description;
            const fallback = lang === "ar" ? "لا يوجد وصف." : "Sin descripción.";
            return `• ${usedPrefix}${name}\n  ${desc || fallback}`;
          });
          const header =
            lang === "ar"
              ? `شرح أوامر قسم ${cat}\nعدد الأوامر: ${cmds.length}\n\n`
              : `Explicación de ${cat}\nComandos: ${cmds.length}\n\n`;
          const footer = `\n\n${nombreBot}`;
          const text = `${header}${lines.join("\n")}${footer}`;

          if (text.length <= 1024) {
            if (await sendImageCaption(text)) return;
            return await sock.sendMessage(from, { text }, { quoted: msg });
          }

          const shortCaption =
            lang === "ar"
              ? `شرح أوامر قسم ${cat}\nعدد الأوامر: ${cmds.length}\n\n${nombreBot}`
              : `Explicación de ${cat}\nComandos: ${cmds.length}\n\n${nombreBot}`;
          await sendImageCaption(shortCaption);
          await sock.sendMessage(from, { text }, { quoted: msg });
        };

        if (mode === "اشرح" || mode === "شرح" || mode === "explain") {
          return await sendExplainCategories(0);
        }
        if (mode.startsWith("اشرح-المزيد_")) {
          const page = parseInt(modeRaw.slice("اشرح-المزيد_".length), 10) || 0;
          return await sendExplainCategories(page);
        }
        if (mode.startsWith("اشرح-قسم_")) {
          const rest = modeRaw.slice("اشرح-قسم_".length);
          const [, ...catParts] = rest.split("_");
          const cat = decodeURIComponent(catParts.join("_"));
          return await sendExplainCategory(cat);
        }
        if (catArg) {
          return await sendExplainCategory(catArg);
        }
        return await sendExplainCategories(0);
      }

      if (isList) {
        const cats = Object.keys(categories);
        if (!catArg) {
          const sections = chunk(cats, 10).map((group, i) => ({
            title:
              i === 0
                ? lang === "ar" ? "الأقسام" : "Categorías"
                : `${lang === "ar" ? "الأقسام" : "Categorías"} ${i + 1}`,
            rows: group.map((cat) => ({
              title: cat,
              description: lang === "ar" ? `${categories[cat].size} أمر` : `${categories[cat].size} comandos`,
              id: `${cmd} قائمة ${cat}`,
            })),
          }));
          return await sendPanel(
            lang === "ar" ? "اختر القسم من القائمة:" : "Elige una categoría de la lista:",
            [],
            sections,
            lang === "ar" ? "الأقسام" : "Categorías"
          );
        }
        const cat = cats.find((c) => c === catArg) || cats.find((c) => c.toLowerCase() === catArg.toLowerCase());
        if (!cat) return await sendPanel(lang === "ar" ? "❌ القسم غير موجود." : "❌ Categoría no encontrada.");
        const rows = [...categories[cat]].map((c) => ({
          title: `${usedPrefix}${c}`,
          id: `${usedPrefix}${c}`,
        }));
        rows.push({
          title: lang === "ar" ? "↩️ رجوع" : "↩️ Volver",
          id: `${cmd} قائمة`,
        });
        const sections = chunk(rows, 10).map((group, i) => ({
          title: i === 0 ? cat : `${cat} ${i + 1}`,
          rows: group,
        }));
        return await sendPanel(
          lang === "ar" ? `أوامر قسم ${cat}:` : `Comandos de ${cat}:`,
          [],
          sections,
          cat
        );
      }

      if (isText) {
        const linkCanal = "https://whatsapp.com/channel/0029Vb8hDbBDuMRXBFk3u02L";
        const textButtons = lang === "ar"
          ? [
              { text: "📢 القناة", url: linkCanal },
              { text: "📋 نسخ الرابط", copy: linkCanal },
            ]
          : [
              { text: "📢 Canal", url: linkCanal },
              { text: "📋 Copiar enlace", copy: linkCanal },
            ];
        return await sendPanel(textoMenu, textButtons);
      }

      return await modePrompt();


    } catch (error) {
      console.error("Error crítico en el comando menu:", error);
    }
  },
};
