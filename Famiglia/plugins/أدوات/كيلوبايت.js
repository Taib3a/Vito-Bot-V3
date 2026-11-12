import axios from "axios";
import FormData from "form-data";
import { downloadMediaMessage } from "@whiskeysockets/baileys";

const UPLOAD_URL = "https://uploadkb.com/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MEDIA_TYPES = {
  imageMessage: "image",
  videoMessage: "video",
  documentMessage: "document",
  audioMessage: "audio",
  stickerMessage: "sticker",
};

export default {
  name: ["كيلوبايت"],
  description: "رفع الملفات إلى كيلو بايت وإرجاع الروابط كأزرار تفاعلية",
  category: "الأدوات",
  ownerOnly: false,

  async run({ sock, from, msg, reply, react }) {
    try {
      await react("⏳");

      const contextInfo =
        msg.message?.extendedTextMessage?.contextInfo ||
        msg.message?.imageMessage?.contextInfo ||
        msg.message?.videoMessage?.contextInfo ||
        msg.message?.documentMessage?.contextInfo ||
        null;

      const quoted = contextInfo?.quotedMessage || null;

      const targetMessage = quoted
        ? quoted.viewOnceMessageV2?.message ||
          quoted.viewOnceMessage?.message ||
          quoted.viewOnceMessageV2Extension?.message ||
          quoted
        : msg.message || {};

      const type = Object.keys(targetMessage)[0];

      if (!MEDIA_TYPES[type]) {
        await react("❌");
        return reply({ text: "❌ يرجى إرسال صورة أو ملف أو الرد على ملف بأمر الرفع." });
      }

      const target = quoted
        ? {
            key: {
              remoteJid: from,
              id: contextInfo.stanzaId,
              participant: contextInfo.participant,
            },
            message: quoted,
          }
        : msg;

      const buffer = await downloadMediaMessage(target, "buffer", {}, {
        logger: console,
        reuploadRequest: sock.updateMediaMessage,
      });

      if (!buffer || !buffer.length) throw new Error("فشل في تحميل الملف.");

      const mime = targetMessage[type]?.mimetype || "application/octet-stream";
      const ext = mime.split("/")[1]?.split(";")[0] || "bin";
      const filename = `file_${Date.now()}.${ext}`;

      const form = new FormData();
      form.append("file_1_", buffer, { filename, contentType: mime });
      form.append("submitr", "رفع الملفات");

      const response = await axios.post(UPLOAD_URL, form, {
        headers: {
          ...form.getHeaders(),
          "User-Agent": UA,
          Origin: "https://uploadkb.com",
          Referer: "https://uploadkb.com/",
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 60000,
      });

      const html = String(response.data || "");

      const pick = (re) => html.match(re)?.[0] || "";
      const pageUrl = pick(/https:\/\/uploadkb\.com\/download\d+\.html/);
      const imageUrl = pick(/https:\/\/uploadkb\.com\/image\d+\.html/);
      const deleteUrl = pick(/https:\/\/uploadkb\.com\/del[a-f0-9]+\.html/);
      const forumCode =
        pick(/\[url=https:\/\/uploadkb\.com\/\]\[img\][^\[]*\[\/img\]\[\/url\]/) || imageUrl;

      if (!pageUrl && !imageUrl) {
        throw new Error("لم يتم العثور على روابط الملف في استجابة الخادم.");
      }

      const caption =
        `☁️ *مركز كيلو بايت*\n\n` +
        `✅ *تم الرفع بنجاح!*\n\n` +
        `📦 *الحجم:* ${(buffer.length / 1024).toFixed(2)} KB\n\n` +
        `👇 *اختر الرابط المطلوب:*`;

      // أزرار النسخ (cta_copy) تنسخ النص مباشرة، فلا تحتاج أي أمر إضافي —
      // الإضافة تبقى بأمر واحد فقط.
      const buttons = [];
      if (imageUrl) buttons.push({ text: "🖼️ نسخ رابط الصورة", copy: imageUrl });
      if (forumCode) buttons.push({ text: "💬 نسخ كود المنتدى", copy: forumCode });
      if (deleteUrl) buttons.push({ text: "🗑️ نسخ رابط الحذف", copy: deleteUrl });

      await sock.sendButtonMessage(from, caption, buttons, {
        title: "كيلو بايت",
        footer: "اختر من الأزرار أدناه",
        quoted: msg,
      });

      await react("✅");
    } catch (error) {
      console.error("[Upload Error]:", error.message);
      await react("❌");
      await reply({ text: `❌ حدث خطأ أثناء الرفع:\n${error.message}` });
    }
  },
};
