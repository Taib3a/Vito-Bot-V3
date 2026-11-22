import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import { cacheMedia, getCachedMedia } from "./messageCache.js";

const WRAPPERS = [
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
  "ephemeralMessage",
];

const MEDIA = {
  imageMessage: "image",
  videoMessage: "video",
  ptvMessage: "video",
  audioMessage: "audio",
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
  return { media: content[key], type: MEDIA[key] };
}

async function getBuffer(media, type) {
  const stream = await downloadContentFromMessage(media, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** يخزّن وسيط «العرض مرة واحدة» فور وصوله، قبل أن يفقد المقتبس مفاتيحه. */
export async function cacheViewOnceMedia(msg) {
  const id = msg?.key?.id;
  if (!id || getCachedMedia(id)) return;

  const found = findMedia(msg?.message);
  if (!found) return;

  const wrapped = WRAPPERS.some((w) => msg?.message?.[w]);
  if (!wrapped && !found.media.viewOnce) return;

  try {
    const buffer = await getBuffer(found.media, found.type);
    if (buffer?.length) cacheMedia(id, buffer);
  } catch {
    // المقتبس قد يصل بمفاتيح كاملة لاحقاً؛ لا نُسقط الرسالة هنا.
  }
}
