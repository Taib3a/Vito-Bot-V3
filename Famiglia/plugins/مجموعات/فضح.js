import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import { getCachedMessage } from "../../Corleone/messageCache.js";

const WRAPPERS = [
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
  "ephemeralMessage",
];

const MEDIA = {
  imageMessage: { type: "image", field: "image", mime: "image/jpeg" },
  videoMessage: { type: "video", field: "video", mime: "video/mp4" },
  ptvMessage: { type: "video", field: "video", mime: "video/mp4" },
  audioMessage: { type: "audio", field: "audio", mime: "audio/mp4" },
};

function unwrap(message) {
  let current = message;
  for (let i = 0; i < 5 && current; i++) {
    const inner = WRAPPERS.map((w) => current?.[w]?.message).find(Boolean);
    if (!inner) break;
    current = inner;
  }
  return current;
}

function findMedia(message) {
  const content = unwrap(message);
  const key = Object.keys(MEDIA).find((t) => content?.[t]);
  if (!key) return null;
  return { ...MEDIA[key], media: content[key], message };
}

async function getBuffer(media, type) {
  const stream = await downloadContentFromMessage(media, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function downloadMedia(found, { sock, cached, contextInfo, from }) {
  try {
    return await getBuffer(found.media, found.type);
  } catch (error) {
    if (!/No valid media URL|directPath/i.test(error.message)) throw error;

    const key = cached?.key || {
      remoteJid: from,
      fromMe: !!contextInfo?.participant && contextInfo.participant === sock.user?.id,
      id: contextInfo?.stanzaId,
      participant: contextInfo?.participant,
    };
    if (!sock?.updateMediaMessage || !key?.id) throw error;

    const fresh = await sock.updateMediaMessage({
      key,
      message: cached?.message || found.message,
    });
    const retry = findMedia(fresh?.message);
    if (!retry) throw error;
    return getBuffer(retry.media, retry.type);
  }
}

const T = {
  ar: {
    noQuote: "❌ رد على رسالة (صورة/فيديو/صوت) لمشاهدة مرة واحدة",
    notViewOnce: "❌ هذه الرسالة ليست من نوع المشاهدة مرة واحدة",
    fail: "❌ فشل استخراج الوسائط",
    unavailable: "❌ الوسيط غير متوفر للتنزيل. اطلب من المرسل إعادة إرساله.",
    error: (e) => `❌ خطأ: ${e}`,
  },
  es: {
    noQuote: "❌ Responde a un mensaje (imagen/video/audio) de ver una vez",
    notViewOnce: "❌ Este mensaje no es de tipo ver una vez",
    fail: "❌ Error al extraer el medio",
    unavailable: "❌ El medio no está disponible. Pide al remitente que lo reenvíe.",
    error: (e) => `❌ Error: ${e}`,
  },
};

export default {
  name: ["فضح"],
  description: "كشف الوسائط ذات المشاهدة مرة واحدة",
  category: "المجموعات",
  ownerOnly: false,

  async run({ sock, from, msg, reply, react, cmdName }) {
    const isArabic = /[\u0600-\u06FF]/.test(String(cmdName || ""));
    const lang = isArabic ? "ar" : "es";
    const t = T[lang];

    try {
      const contextInfo =
        msg.message?.extendedTextMessage?.contextInfo ||
        msg.message?.imageMessage?.contextInfo ||
        msg.message?.videoMessage?.contextInfo ||
        msg.message?.audioMessage?.contextInfo ||
        msg.quoted?.contextInfo;

      const quoted = msg.quoted?.message || contextInfo?.quotedMessage;
      if (!quoted) {
        return await reply({ text: t.noQuote });
      }

      const cached = getCachedMessage(contextInfo?.stanzaId);
      const raw = cached?.message || quoted;
      const found = findMedia(raw);
      if (!found) {
        return await reply({ text: t.fail });
      }

      const isViewOnce =
        WRAPPERS.some((w) => raw?.[w]) || found.media.viewOnce;
      if (!isViewOnce) {
        return await reply({ text: t.notViewOnce });
      }

      await react("👁️");

      const buffer = await downloadMedia(found, {
        sock,
        cached,
        contextInfo,
        from,
      });

      if (!buffer?.length) {
        await react("❌");
        return await reply({ text: t.fail });
      }

      const payload = {
        [found.field]: buffer,
        mimetype: found.media.mimetype || found.mime,
      };
      if (found.type === "audio") payload.ptt = false;
      if (found.media.caption && found.type !== "audio") {
        payload.caption = found.media.caption;
      }

      await sock.sendMessage(from, payload, { quoted: msg });
      await react("✅");
    } catch (e) {
      await react("❌");
      const unavailable = /No valid media URL|directPath/i.test(e.message);
      await reply({ text: unavailable ? t.unavailable : t.error(e.message) });
    }
  },
};
