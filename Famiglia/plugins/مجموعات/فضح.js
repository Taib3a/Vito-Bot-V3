import { downloadContentFromMessage } from "@whiskeysockets/baileys";

async function getBuffer(message, type) {
  const stream = await downloadContentFromMessage(message, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const T = {
  ar: {
    noQuote: "❌ رد على رسالة (صورة/فيديو/صوت) لمشاهدة مرة واحدة",
    notViewOnce: "❌ هذه الرسالة ليست من نوع المشاهدة مرة واحدة",
    fail: "❌ فشل استخراج الوسائط",
    error: (e) => `❌ خطأ: ${e}`,
  },
  es: {
    noQuote: "❌ Responde a un mensaje (imagen/video/audio) de ver una vez",
    notViewOnce: "❌ Este mensaje no es de tipo ver una vez",
    fail: "❌ Error al extraer el medio",
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
      const quoted =
        msg.quoted?.message ||
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

      if (!quoted) {
        return await reply({ text: t.noQuote });
      }

      const isViewOnce =
        quoted.imageMessage?.viewOnce ||
        quoted.videoMessage?.viewOnce ||
        quoted.audioMessage?.viewOnce;

      if (!isViewOnce) {
        return await reply({ text: t.notViewOnce });
      }

      await react("👁️");

      let sendMsg = null;

      if (quoted.imageMessage) {
        const buffer = await getBuffer(quoted.imageMessage, "image");
        sendMsg = {
          image: buffer,
          caption: quoted.imageMessage.caption || "👁️ Revealed",
        };
      } else if (quoted.videoMessage) {
        const buffer = await getBuffer(quoted.videoMessage, "video");
        sendMsg = {
          video: buffer,
          caption: quoted.videoMessage.caption || "👁️ Revealed",
        };
      } else if (quoted.audioMessage) {
        const buffer = await getBuffer(quoted.audioMessage, "audio");
        sendMsg = {
          audio: buffer,
          mimetype: "audio/mp4",
          ptt: false,
        };
      }

      if (!sendMsg) {
        await react("❌");
        return await reply({ text: t.fail });
      }

      await sock.sendMessage(from, sendMsg, { quoted: msg });
      await react("✅");
    } catch (e) {
      await react("❌");
      await reply({ text: t.error(e.message) });
    }
  },
};
