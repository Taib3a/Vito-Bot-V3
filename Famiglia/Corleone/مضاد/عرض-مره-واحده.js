import { downloadMediaMessage, extractMessageContent } from "@whiskeysockets/baileys";
import { log } from "../logger.js";

// رسائل «العرض مرة واحدة» تصل بلا نص، فلا يعتمد هذا المضاد على `body`.
const MEDIA = {
  imageMessage: { field: "image", mime: "image/jpeg" },
  videoMessage: { field: "video", mime: "video/mp4" },
  ptvMessage: { field: "video", mime: "video/mp4" },
  audioMessage: { field: "audio", mime: "audio/mp4" },
};

// الأغلفة التي تدلّ على «عرض مرة واحدة». وجود الغلاف وحده كافٍ: واتساب
// يُسقط علم `viewOnce` الداخلي في بعض المسارات، فيضيع الكشف لو اعتمدنا عليه.
const WRAPPERS = ["viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension"];

function numOf(jid = "") {
  return String(jid).split("@")[0].split(":")[0];
}

/**
 * يعيد نوع الوسيط وبياناته إن كانت الرسالة «عرض مرة واحدة»، وإلا null.
 * يفتح كل الأغلفة (محادثة تختفي، ملف بتعليق، عرض مرة واحدة) عبر
 * extractMessageContent، فلا يفلت شكل رسالة لم نعدّه.
 */
function viewOnceContent(message) {
  const wrapped = WRAPPERS.some((w) => message?.[w]);
  const content = extractMessageContent(message);
  const type = Object.keys(MEDIA).find((t) => content?.[t]);
  if (!type) return null;
  return wrapped || content[type].viewOnce ? { type, media: content[type] } : null;
}

/** يكشف وسائط «العرض مرة واحدة» ويعيد إرسالها ظاهرة. */
export default {
  name: "عرض-مره-واحده",
  flag: "viewonce",
  // كشف الوسائط خدمة لكل من في المجموعة، لا عقاب للمخالف.
  includeAdmins: true,

  async check({ sock, msg, from, sender, botLabel }) {
    const found = viewOnceContent(msg?.message);
    if (!found) return false;

    const meta = MEDIA[found.type];

    try {
      // نفس مسار الأمر اليدوي: يتكفّل بفتح الأغلفة وبطلب إعادة رفع
      // الوسيط إذا انتهت صلاحية رابطه (شائع في وسائط المشاهدة الواحدة).
      const buffer = await downloadMediaMessage(
        msg,
        "buffer",
        {},
        { logger: log, reuploadRequest: sock?.updateMediaMessage }
      );
      if (!buffer?.length) {
        log.warn(`[${botLabel}] عرض-مره-واحده: وسيط فارغ من ${numOf(sender)} في ${from}`);
        return false;
      }

      const payload = { [meta.field]: buffer, mimetype: found.media.mimetype || meta.mime };
      // التعليق للنصوص المرئية فقط؛ الصوت لا يقبله.
      if (found.media.caption) payload.caption = found.media.caption;

      await sock.sendMessage(from, payload, { quoted: msg });
      log.info(`[${botLabel}] عرض-مره-واحده: كشف ${found.type} من ${numOf(sender)} في ${from}`);
      return true;
    } catch (e) {
      log.error(`عرض-مره-واحده: ${e.message}`);
      return false;
    }
  },
};
