import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import { getCachedMessage, getCachedMedia } from "../../Corleone/messageCache.js";

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
  const type = Object.keys(MEDIA).find((t) => content?.[t]);
  if (!type) return null;
  return { type: MEDIA[type], key: type, media: content[type] };
}

function keys(obj) {
  return obj && typeof obj === "object" ? Object.keys(obj) : [];
}

function mediaReport(media) {
  if (!media) return null;
  return {
    viewOnce: !!media.viewOnce,
    mimetype: media.mimetype || null,
    fileLength: media.fileLength ?? null,
    caption: media.caption ? String(media.caption).slice(0, 80) : null,
    hasUrl: !!media.url,
    hasDirectPath: !!media.directPath,
    hasMediaKey: !!media.mediaKey,
    mediaKeyLength: media.mediaKey?.length || 0,
    hasFileSha256: !!media.fileSha256,
    hasFileEncSha256: !!media.fileEncSha256,
    hasThumbnail: !!media.jpegThumbnail,
  };
}

export default {
  name: ["تحليل-الرسالة"],
  description: "تحليل بنية رسالة واتساب والوسائط وطريقة الوصول إليها",
  category: "أدوات",
  ownerOnly: false,

  async run({ sock, msg, from, sender, reply, args, botLabel, isGroup }) {
    const contextInfo =
      msg.message?.extendedTextMessage?.contextInfo ||
      msg.message?.imageMessage?.contextInfo ||
      msg.message?.videoMessage?.contextInfo ||
      msg.message?.audioMessage?.contextInfo ||
      msg.quoted?.contextInfo;

    const quoted = msg.quoted?.message || contextInfo?.quotedMessage || null;
    const target = quoted || msg.message || null;
    const stanzaId = contextInfo?.stanzaId || null;
    const found = findMedia(target);
    const cachedMessage = getCachedMessage(stanzaId);
    const cachedMedia = getCachedMedia(stanzaId);

    const report = {
      bot: botLabel || null,
      sender: sender || null,
      from: from || null,
      isGroup: !!isGroup,
      commandKey: {
        id: msg.key?.id || null,
        remoteJid: msg.key?.remoteJid || null,
        fromMe: !!msg.key?.fromMe,
        participant: msg.key?.participant || null,
      },
      context: contextInfo
        ? {
            stanzaId,
            participant: contextInfo.participant || null,
            mentionedCount: contextInfo.mentionedJid?.length || 0,
          }
        : null,
      messageKeys: keys(msg.message),
      quotedKeys: keys(quoted),
      targetKeys: keys(target),
      unwrappedKeys: keys(unwrap(target)),
      wrapper: WRAPPERS.find((w) => target?.[w]) || null,
      mediaType: found?.key || null,
      media: mediaReport(found?.media),
      cache: {
        hasMessage: !!cachedMessage,
        messageKeys: keys(cachedMessage?.message),
        hasMedia: !!cachedMedia,
        mediaBytes: cachedMedia?.length || 0,
      },
      send: {
        userId: sock.user?.id || null,
        isMainBot: !!sock.isMainBot,
        isOpen: sock.isOpen !== false,
        hasUpdateMediaMessage: typeof sock.updateMediaMessage === "function",
      },
    };

    if (String(args?.[0] || "").toLowerCase() === "تنزيل" && found) {
      try {
        const stream = await downloadContentFromMessage(found.media, found.type);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        report.download = { ok: true, bytes: Buffer.concat(chunks).length };
      } catch (e) {
        report.download = { ok: false, error: e.message };
      }
    }

    console.log("[تحليل-الرسالة]", JSON.stringify(report));
    await reply({
      text: `🔎 *تحليل الرسالة*\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\``,
    });
  },
};
