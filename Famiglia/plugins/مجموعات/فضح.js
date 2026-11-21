import { downloadMediaMessage, extractMessageContent } from "@whiskeysockets/baileys";

const MEDIA = {
  imageMessage: { field: "image", mime: "image/jpeg" },
  videoMessage: { field: "video", mime: "video/mp4" },
  ptvMessage: { field: "video", mime: "video/mp4" },
  audioMessage: { field: "audio", mime: "audio/mp4" },
};

const WRAPPERS = ["viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension"];

/**
 * يستخرج نوع الوسيط وبياناته من الرسالة المقتبسة.
 * وجود غلاف «العرض مرة واحدة» كافٍ: العلم الداخلي يُسقط في بعض المسارات.
 * ويُفتح أيضاً غلافا المحادثة المختفية والملف بتعليق.
 */
function extractMedia(quoted) {
  const wrapped = WRAPPERS.some((w) => quoted?.[w]);
  const message = extractMessageContent(quoted);
  const key = Object.keys(MEDIA).find((k) => message?.[k]);
  if (!key) return null;
  return wrapped || message[key].viewOnce ? { key, media: message[key] } : null;
}

export default {
  name: ["فضح"],
  description: "كشف الوسائط ذات المشاهدة مرة واحدة",
  category: "المجموعات",
  ownerOnly: false,

  async run({ sock, from, msg, reply, react }) {
    const T = {
      noQuote: "❌ ردّ على رسالة (صورة/فيديو/صوت) لمشاهدة مرة واحدة",
      notViewOnce: "❌ هذه الرسالة ليست من نوع المشاهدة مرة واحدة",
      fail: "❌ فشل استخراج الوسائط",
      error: (e) => `❌ خطأ: ${e}`,
    };

    try {
      const contextInfo =
        msg.message?.extendedTextMessage?.contextInfo ||
        msg.message?.imageMessage?.contextInfo ||
        msg.message?.videoMessage?.contextInfo ||
        msg.message?.documentMessage?.contextInfo ||
        msg.message?.audioMessage?.contextInfo ||
        null;

      const quoted = contextInfo?.quotedMessage || null;
      if (!quoted) return await reply({ text: T.noQuote });

      const found = extractMedia(quoted);
      if (!found) return await reply({ text: T.notViewOnce });

      await react("👁️");

      // downloadMediaMessage يتطلّب رسالة كاملة بمفتاح، فنعيد بناء الغلاف.
      const meta = MEDIA[found.key];
      const stub = { key: contextInfo.stanzaId ? { id: contextInfo.stanzaId, remoteJid: from } : undefined, message: quoted };
      const buffer = await downloadMediaMessage(stub, "buffer", {}, { logger: console, reuploadRequest: sock.updateMediaMessage });
      if (!buffer?.length) {
        await react("❌");
        return await reply({ text: T.fail });
      }

      const media = found.media;
      const outMessage =
        meta.field === "audio"
          ? { audio: buffer, mimetype: media.mimetype || meta.mime, ptt: false }
          : { [meta.field]: buffer, caption: media.caption || "👁️ مكشوفة" };

      await sock.sendMessage(from, outMessage, { quoted: msg });
      await react("✅");
    } catch (error) {
      await react("❌");
      await reply({ text: T.error(error.message) });
    }
  },
};
