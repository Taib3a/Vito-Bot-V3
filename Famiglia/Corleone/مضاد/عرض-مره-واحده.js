import { downloadContentFromMessage, downloadMediaMessage, extractMessageContent } from "@whiskeysockets/baileys";
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

// غلاف لا يفتحه extractMessageContent، فنفتحه يدوياً.
const EXTRA_WRAPPERS = ["deviceSentMessage"];

function numOf(jid = "") {
  return String(jid).split("@")[0].split(":")[0];
}

function unwrap(message) {
  let current = message;
  for (let i = 0; i < 5 && current; i++) {
    const inner = EXTRA_WRAPPERS.map((w) => current?.[w]?.message).find(Boolean);
    if (!inner) break;
    current = inner;
  }
  return current;
}

/**
 * يعيد نوع الوسيط وبياناته إن كانت الرسالة «عرض مرة واحدة»، وإلا null.
 * extractMessageContent يفتح أغلفة المحادثة المختفية والملف بتعليق أيضاً.
 */
function viewOnceContent(rawMessage) {
  const message = unwrap(rawMessage);
  const wrapped = WRAPPERS.some((w) => message?.[w]);
  const content = extractMessageContent(message);
  const type = Object.keys(MEDIA).find((t) => content?.[t]);
  if (!type) return null;
  return wrapped || content[type].viewOnce ? { type, media: content[type], message } : null;
}

async function getBuffer(media, type) {
  const stream = await downloadContentFromMessage(media, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** يكشف وسائط «العرض مرة واحدة» ويعيد إرسالها ظاهرة. */
export default {
  name: "عرض-مره-واحده",
  flag: "viewonce",
  // كشف الوسائط خدمة لكل من في المجموعة، لا عقاب للمخالف.
  includeAdmins: true,
  // خدمة لا عقاب: تعمل قبل بوابات الوضع الخاص/المشرفين، وعلى رسائل
  // البوت نفسه — وإلا ظلّت معطّلة لمن يرسل من رقم البوت.
  service: true,

  async check({ sock, msg, from, sender, botLabel }) {
    const found = viewOnceContent(msg?.message);
    if (!found) return false;

    log.info(
      `[${botLabel}] عرض-مره-واحده: اكتشاف ${found.type} من ${numOf(sender)} في ${from} ` +
        `| url=${!!found.media?.url} directPath=${!!found.media?.directPath} mediaKey=${!!found.media?.mediaKey}`
    );

    const meta = MEDIA[found.type];

    try {
      const stub = {
        key: { id: msg.key?.id, remoteJid: from, participant: msg.key?.participant },
        message: found.message,
      };

      // نفس مسار «فضح» اليدوي الذي يعمل: تنزيل الوسيط الداخلي مباشرة.
      let buffer;
      const mediaType = found.type === "ptvMessage" ? "video" : found.type.replace("Message", "");
      try {
        buffer = await getBuffer(found.media, mediaType);
      } catch (contentError) {
        buffer = await downloadMediaMessage(
          stub,
          "buffer",
          {},
          { logger: console, reuploadRequest: sock?.updateMediaMessage }
        );
      }

      if (!buffer?.length) {
        log.warn(`[${botLabel}] عرض-مره-واحده: وسيط فارغ من ${numOf(sender)} في ${from}`);
        return false;
      }

      const payload = { [meta.field]: buffer, mimetype: found.media.mimetype || meta.mime };
      if (found.type === "audioMessage") payload.ptt = false;
      // التعليق للنصوص المرئية فقط؛ الصوت لا يقبله.
      if (found.media.caption && meta.field !== "audio") payload.caption = found.media.caption;

      // بلا اقتباس: واتساب يرفض الإرسال المقتبس من رسالة مشاهدتها مرة واحدة.
      // هذا هو الفرق الذي أبقى الكشف التلقائي صامتاً بينما «فضح» يعمل، لأنه
      // يقتبس رسالة الأمر النصية لا الرسالة المخفية.
      await sock.sendMessage(from, payload);
      log.info(`[${botLabel}] عرض-مره-واحده: كشف ${found.type} من ${numOf(sender)} في ${from}`);
      return true;
    } catch (e) {
      log.error(`عرض-مره-واحده: ${e.message}`);
      return false;
    }
  },
};
