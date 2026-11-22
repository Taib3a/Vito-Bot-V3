import { requestSubbotCode, activeBots } from "../../Corleone/subbotManager.js";
import config from "../../Corleone/settings.js";
import { jidNormalizedUser } from "@whiskeysockets/baileys";

const cooldowns = new Map();

const pickRandom = (arr, fallback = null) =>
  Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random() * arr.length)] : fallback;

const T = {
  ar: {
    needNumber:
      `⚠️ لم أستطع تحديد رقمك تلقائياً (يحدث هذا إذا كان لديك *اسم مستخدم* في واتساب ولم أكن في جهات اتصالك).\n\n` +
      `اكتب رقمك مع رمز الدولة هكذا: *.تنصيب +967735541558*`,
    alreadyLinked:
      `⚠️ رقمك مربوط بالفعل كبوت فرعي.\nاستخدم *.حذف-بوت* لإلغاء الربط.`,
    cooldown: (sec) =>
      `🌾 لقد طلبت كوداً مؤخراً.\nانتظر *${sec} ثانية* قبل طلب كود آخر.`,
    instructions:
      `⚔️ *ربط البوت الفرعي*\n\n` +
      `📋 *التعليمات:*\n` +
      ` ✦ افتح واتساب على هاتفك\n` +
      ` ✦ اذهب إلى *الأجهزة المرتبطة*\n` +
      ` ✦ اضغط *ربط جهاز*\n` +
      ` ✦ اضغط *الربط برقم الهاتف*\n` +
      ` ✦ أدخل الكود الذي سيصلك الآن\n` +
      ` ✦ لديك *60 ثانية* قبل انتهاء صلاحيته\n\n` +
      `⏳ _جاري توليد الكود..._`,
    codeError: (e) => `❌ خطأ في توليد الكود:\n${e}`,
  },
  es: {
    needNumber:
      `⚠️ No pude detectar tu número automáticamente (esto pasa si tienes activado un *nombre de usuario* de WhatsApp y no me tienes en tus contactos).\n\n` +
      `Escribe tu número con código de país así: *.تنصيب +967735541558*`,
    alreadyLinked:
      `⚠️ Tu número ya está vinculado como subbot.\nUsa *.حذف-بوت* para desvincularlo.`,
    cooldown: (sec) =>
      `🌾 Ya pediste un código recientemente.\nEspera *${sec} segundos* antes de pedir otro.`,
    instructions:
      `⚔️ *VINCULACIÓN DE SUBBOT*\n\n` +
      `📋 *Instrucciones:*\n` +
      ` ✦ Abre WhatsApp en tu teléfono\n` +
      ` ✦ Ve a *Dispositivos vinculados*\n` +
      ` ✦ Toca *Vincular dispositivo*\n` +
      ` ✦ Toca *Vincular con número de teléfono*\n` +
      ` ✦ Ingresa el código que recibirás ahora\n` +
      ` ✦ Tienes *60 segundos* antes de que expire\n\n` +
      `⏳ _Generando código..._`,
    codeError: (e) => `❌ Error generando código:\n${e}`,
  },
};

export default {
  name: ["تنصيب", "code", "كود"],
  description: "ربط رقمك كبوت فرعي",
  category: "البوتات الفرعية",
  ownerOnly: false,

  async run({ sock, from, sender, react, reply, msg, resolveLid, args, cmdName }) {
    const isArabic = /[\u0600-\u06FF]/.test(String(cmdName || ""));
    const lang = isArabic ? "ar" : "es";
    const t = T[lang];

    await react("🔑");

    let resolved = jidNormalizedUser(sender);

    if (resolved.endsWith("@lid")) {
      resolved = await resolveLid(resolved);
    }

    let phone = resolved.endsWith("@lid") ? "" : resolved.split("@")[0].replace(/\D/g, "");

    if (!phone && args?.[0]) {
      const manual = args[0].replace(/\D/g, "");
      if (manual.length >= 8) phone = manual;
    }

    if (!phone || phone.length < 8) {
      return await reply({ text: t.needNumber });
    }

    const id = `sub_${phone}`;

    if (activeBots.has(id) && activeBots.get(id).status === "online") {
      return await reply({ text: t.alreadyLinked });
    }

    if (cooldowns.has(phone)) {
      const diff = Date.now() - cooldowns.get(phone);
      const restante = Math.ceil((60000 - diff) / 1000);
      if (diff < 60000) {
        return await reply({ text: t.cooldown(restante) });
      }
    }

    cooldowns.set(phone, Date.now());

    const names = Array.isArray(global.botNames) && global.botNames.length
      ? global.botNames
      : [config.botName || "Bot"];
    const title = pickRandom(names, config.botName || "Bot");
    const footer = pickRandom(names, config.botName || "Bot");
    const image = pickRandom(global.botImages, null);

    const sendInteractive = async (text, btns, extra = {}) => {
      if (typeof sock.sendButtonMessage !== "function") return false;
      try {
        await sock.sendButtonMessage(from, text, btns, {
          title,
          footer,
          quoted: msg,
          image,
          mentions: [sender],
          ...extra,
        });
        return true;
      } catch {
        return false;
      }
    };

    const instructionsText = `${title}\n\n${t.instructions}`;
    if (image) {
      try {
        await sock.sendMessage(
          from,
          { image: { url: image }, caption: instructionsText },
          { quoted: msg }
        );
      } catch {
        await reply({ text: instructionsText });
      }
    } else {
      await reply({ text: instructionsText });
    }

    try {
      const code = await requestSubbotCode(id, phone, sock, from, lang);
      const codeText = "\u200B";
      const codeButtons = [
        { text: lang === "ar" ? "📋 نسخ الكود" : "📋 Copiar código", copy: code },
      ];
      const codeSent = await sendInteractive(codeText, codeButtons, {
        image: null,
        title: "",
        footer: "",
      });
      if (!codeSent) await sock.sendMessage(from, { text: `${code}` }, { quoted: msg });
      await react("✅");
    } catch (e) {
      cooldowns.delete(phone);
      await react("❌");
      await reply({ text: t.codeError(e.message) });
    }
  },
};
