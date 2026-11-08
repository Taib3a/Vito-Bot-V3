import { downloadContentFromMessage } from "@whiskeysockets/baileys";

async function getBuffer(message, type) {
  const stream = await downloadContentFromMessage(message, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
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
      if (!quoted) {
        return await reply({ text: T.noQuote });
      }

      // فكّ تغليف رسالة المشاهدة مرة واحدة
      const message =
        quoted.viewOnceMessageV2?.message ||
        quoted.viewOnceMessage?.message ||
        quoted.viewOnceMessageV2Extension?.message ||
        quoted;

      const isViewOnce =
        message.imageMessage?.viewOnce ||
        message.videoMessage?.viewOnce ||
        message.audioMessage?.viewOnce;

      if (!isViewOnce) {
        return await reply({ text: T.notViewOnce });
      }

      await react("👁️");

      let outMessage = null;

      if (message.imageMessage) {
        const buffer = await getBuffer(message.imageMessage, "image");
        outMessage = {
          image: buffer,
          caption: message.imageMessage.caption || "👁️ مكشوفة",
        };
      } else if (message.videoMessage) {
        const buffer = await getBuffer(message.videoMessage, "video");
        outMessage = {
          video: buffer,
          caption: message.videoMessage.caption || "👁️ مكشوفة",
        };
      } else if (message.audioMessage) {
        const buffer = await getBuffer(message.audioMessage, "audio");
        outMessage = {
          audio: buffer,
          mimetype: "audio/mp4",
          ptt: false,
        };
      }

      if (!outMessage) {
        await react("❌");
        return await reply({ text: T.fail });
      }

      await sock.sendMessage(from, outMessage, { quoted: msg });
      await react("✅");
    } catch (error) {
      await react("❌");
      await reply({ text: T.error(error.message) });
    }
  },
};
