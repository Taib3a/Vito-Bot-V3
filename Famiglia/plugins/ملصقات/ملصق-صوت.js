import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { execFile } from "child_process";
import { downloadMediaMessage, proto } from "@whiskeysockets/baileys";
import { log } from "../../Corleone/logger.js";
import config from "../../Corleone/settings.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, "../../../tmp");
const DEFAULT_COVER = path.join(__dirname, "../../assets/vito-1.png");

const MAX_AUDIO_SECONDS = 30;
const MAX_VIDEO_SECONDS = 10;
const MAX_STICKER_BYTES = 1_000_000;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const PICK_TTL_MS = 90_000;

// الأغلفة المختارة مؤقتًا: مفتاحها المحادثة + المرسل.
const pickedCovers = new Map();
let busy = false;

const RAW_FIELDS = Symbol("rawFields");

const USAGE =
  "🎙️ *ملصق بصوت*\n\n" +
  "ردّ على مقطع صوتي أو فيديو بأمر `.ملصق-صوت`:\n" +
  "• صوت: ملصق ثابت بصوتك، وغلافه الافتراضي صورة البوت.\n" +
  "• فيديو: ملصق متحرك من الفيديو نفسه مع صوته.\n\n" +
  "🖼️ لاختيار غلاف للصوت: ردّ على صورة أو ملصق بالأمر، ثم ردّ على الصوت خلال 90 ثانية.";

function ensureTmp() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest();
}

function contextInfoOf(message) {
  for (const type of [
    "extendedTextMessage",
    "imageMessage",
    "videoMessage",
    "documentMessage",
    "audioMessage",
  ]) {
    const info = message?.[type]?.contextInfo;
    if (info) return info;
  }
  return null;
}

async function convert(input, args, extension) {
  ensureTmp();
  const id = crypto.randomBytes(8).toString("hex");
  const inputPath = path.join(TMP_DIR, `audio-sticker-${id}.in`);
  const outputPath = path.join(TMP_DIR, `audio-sticker-${id}.${extension}`);

  fs.writeFileSync(inputPath, input);
  try {
    await execFileAsync(
      "ffmpeg",
      ["-y", "-v", "error", "-i", inputPath, ...args, outputPath],
      { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }
    );
    return fs.readFileSync(outputPath);
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
}

export function toOpus(input, maxSeconds = MAX_AUDIO_SECONDS) {
  return convert(
    input,
    [
      "-vn",
      "-map_metadata", "-1",
      "-c:a", "libopus",
      "-b:a", "64k",
      "-ar", "48000",
      "-ac", "1",
      "-t", String(maxSeconds),
      "-f", "ogg",
    ],
    "ogg"
  );
}

export function toWebp(input) {
  return convert(
    input,
    [
      "-frames:v", "1",
      "-vf", "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2",
      "-c:v", "libwebp",
      "-f", "webp",
    ],
    "webp"
  );
}

export function toAnimatedWebp(input, maxSeconds, fps = 10, quality = 55) {
  return convert(
    input,
    [
      "-an",
      "-t", String(maxSeconds),
      "-vf", `fps=${fps},scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2`,
      "-c:v", "libwebp",
      "-lossless", "0",
      "-q:v", String(quality),
      "-loop", "0",
      "-f", "webp",
    ],
    "webp"
  );
}

async function buildAnimatedSticker(input, seconds) {
  const duration = Math.min(seconds || MAX_VIDEO_SECONDS, MAX_VIDEO_SECONDS);
  let output = await toAnimatedWebp(input, duration);
  if (output.length > MAX_STICKER_BYTES) {
    output = await toAnimatedWebp(input, Math.min(duration, 6), 8, 35);
  }
  if (output.length > MAX_STICKER_BYTES) {
    throw new Error("الملصق المتحرك تجاوز 1 ميغابايت؛ جرّب فيديو أقصر.");
  }
  return output;
}

export async function probeSeconds(input) {
  ensureTmp();
  const probePath = path.join(TMP_DIR, `audio-sticker-${crypto.randomBytes(8).toString("hex")}.probe`);
  fs.writeFileSync(probePath, input);
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", probePath],
      { timeout: 20_000 }
    );
    const seconds = Number.parseFloat(String(stdout).trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(probePath); } catch {}
  }
}

export function parseWebp(buffer) {
  if (
    buffer.length < 30 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw new Error("الملف ليس صورة WebP صالحة.");
  }

  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff, isAnimated: false };
  }
  if (chunk === "VP8L") {
    return {
      width: 1 + (buffer[21] | ((buffer[22] & 0x3f) << 8)),
      height: 1 + ((buffer[22] >> 6) | (buffer[23] << 2) | ((buffer[24] & 0x0f) << 10)),
      isAnimated: false,
    };
  }
  if (chunk === "VP8X") {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
      isAnimated: (buffer[20] & 2) !== 0,
    };
  }
  throw new Error("صيغة WebP غير مدعومة.");
}

function buildExifPayload(json) {
  const data = Buffer.from(JSON.stringify(json), "utf8");
  const header = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);
  header.writeUInt32LE(data.length, 14);
  return Buffer.concat([header, data]);
}

function splitChunks(buffer) {
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32LE(offset + 4);
    const length = 8 + size + (size % 2);
    if (offset + length > buffer.length) break;
    chunks.push({
      type: buffer.toString("ascii", offset, offset + 4),
      raw: buffer.subarray(offset, offset + length),
    });
    offset += length;
  }
  if (!chunks.length) throw new Error("لا توجد مقاطع WebP صالحة.");
  return chunks;
}

export function addStickerExif(buffer, json) {
  const info = parseWebp(buffer);
  const chunks = splitChunks(buffer).filter((chunk) => chunk.type !== "EXIF");
  const existingVp8x = chunks.find((chunk) => chunk.type === "VP8X");
  const rest = chunks.filter((chunk) => chunk.type !== "VP8X");

  let vp8x;
  if (existingVp8x) {
    vp8x = Buffer.from(existingVp8x.raw);
    vp8x[8] |= 0x08;
  } else {
    vp8x = Buffer.alloc(18);
    vp8x.write("VP8X", 0, "ascii");
    vp8x.writeUInt32LE(10, 4);
    vp8x[8] = 0x08;
    vp8x.writeUIntLE(info.width - 1, 12, 3);
    vp8x.writeUIntLE(info.height - 1, 15, 3);
  }

  const payload = buildExifPayload(json);
  const exif = Buffer.alloc(8 + payload.length + (payload.length % 2));
  exif.write("EXIF", 0, "ascii");
  exif.writeUInt32LE(payload.length, 4);
  payload.copy(exif, 8);

  const body = Buffer.concat([
    Buffer.from("WEBP", "ascii"),
    vp8x,
    ...rest.map((chunk) => chunk.raw),
    exif,
  ]);
  const output = Buffer.alloc(8 + body.length);
  output.write("RIFF", 0, "ascii");
  output.writeUInt32LE(body.length, 4);
  body.copy(output, 8);
  return output;
}

function randomBotName() {
  const names = Array.isArray(global.botNames) ? global.botNames.filter(Boolean) : [];
  if (names.length) return names[Math.floor(Math.random() * names.length)];
  return config.packname || config.botname || "BOT VITO V3";
}

function buildCredit(pushName, senderNum) {
  return {
    "sticker-pack-id": crypto.randomBytes(32).toString("hex"),
    "sticker-pack-name": randomBotName(),
    "sticker-pack-publisher": `@${pushName || senderNum}`,
    emojis: ["🎙️"],
  };
}

export async function prepareCover(buffer) {
  if (
    buffer.length > 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { buffer, webp: parseWebp(buffer) };
  }
  const converted = await toWebp(buffer);
  return { buffer: converted, webp: parseWebp(converted) };
}

function varint(value) {
  const bytes = [];
  let n = value;
  while (n > 127) {
    bytes.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  bytes.push(n);
  return Buffer.from(bytes);
}

// حقل protobuf بطول محدَّد: (رقم الحقل << 3) | 2.
function lengthDelimited(field, body) {
  return Buffer.concat([varint(field * 8 + 2), varint(body.length), body]);
}

function encryptMedia(plain, hkdfInfo) {
  const mediaKey = crypto.randomBytes(32);
  const expanded = Buffer.from(
    crypto.hkdfSync("sha256", mediaKey, Buffer.alloc(32), Buffer.from(hkdfInfo), 112)
  );
  const iv = expanded.subarray(0, 16);
  const cipher = crypto.createCipheriv("aes-256-cbc", expanded.subarray(16, 48), iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const mac = crypto
    .createHmac("sha256", expanded.subarray(48, 80))
    .update(iv)
    .update(encrypted)
    .digest()
    .subarray(0, 10);
  const file = Buffer.concat([encrypted, mac]);

  return {
    mediaKey,
    file,
    fileLength: plain.length,
    fileSha256: sha256(plain),
    fileEncSha256: sha256(file),
    mediaKeyTimestamp: Math.floor(Date.now() / 1000),
  };
}

async function uploadMedia(sock, media, mediaType) {
  if (typeof sock.waUploadToServer !== "function") {
    throw new Error("نسخة Baileys الحالية لا توفّر waUploadToServer لرفع الوسائط.");
  }
  ensureTmp();
  const uploadPath = path.join(TMP_DIR, `audio-sticker-${crypto.randomBytes(8).toString("hex")}.enc`);
  fs.writeFileSync(uploadPath, media.file);
  try {
    const result = await sock.waUploadToServer(uploadPath, {
      fileEncSha256B64: media.fileEncSha256.toString("base64"),
      mediaType,
    });
    if (!result?.directPath) throw new Error("فشل رفع الوسيط إلى خوادم واتساب.");

    const { file, ...rest } = media;
    return {
      ...rest,
      directPath: result.directPath,
      url: result.mediaUrl || `https://mmg.whatsapp.net${result.directPath}`,
    };
  } finally {
    try { fs.unlinkSync(uploadPath); } catch {}
  }
}

function mediaDomainInfo(mediaKey) {
  return lengthDelimited(
    74,
    Buffer.concat([Buffer.from([0x08, 0x01]), lengthDelimited(2, mediaKey)])
  );
}

function encodeSticker(sticker, webp) {
  const encoded = proto.Message.StickerMessage.encode(
    proto.Message.StickerMessage.create({
      url: sticker.url,
      fileSha256: sticker.fileSha256,
      fileEncSha256: sticker.fileEncSha256,
      mediaKey: sticker.mediaKey,
      mimetype: "image/webp",
      height: webp.height,
      width: webp.width,
      directPath: sticker.directPath,
      fileLength: sticker.fileLength,
      mediaKeyTimestamp: sticker.mediaKeyTimestamp,
      isAnimated: webp.isAnimated,
      stickerSentTs: Date.now(),
    })
  ).finish();

  return Buffer.concat([
    encoded,
    lengthDelimited(17, Buffer.concat([mediaDomainInfo(sticker.mediaKey), lengthDelimited(82, varint(13001))])),
  ]);
}

function encodeAudio(audio, seconds) {
  const encoded = proto.Message.AudioMessage.encode(
    proto.Message.AudioMessage.create({
      url: audio.url,
      mimetype: "audio/ogg; codecs=opus",
      fileSha256: audio.fileSha256,
      fileEncSha256: audio.fileEncSha256,
      fileLength: audio.fileLength,
      mediaKey: audio.mediaKey,
      directPath: audio.directPath,
      mediaKeyTimestamp: audio.mediaKeyTimestamp,
      seconds: Math.min(Math.round(seconds || 0), MAX_AUDIO_SECONDS),
      ptt: false,
    })
  ).finish();

  return Buffer.concat([encoded, lengthDelimited(17, mediaDomainInfo(audio.mediaKey))]);
}

/**
 * يبني رسالة غير موثّقة: الحقل 134 لا وجود له في بروتوكول Baileys الحالي،
 * وفيه StickerMessage يتضمّن AudioMessage في حقل 26. واتساب يتجاهل الحقول
 * المجهولة، وبعض إصدارات العميل تقرأ الصوت من هذا الموضع؛ لذلك الميزة تجريبية.
 */
export function buildPayload({ sticker, audio, webp, seconds }) {
  const stickerBytes = encodeSticker(sticker, webp);
  const audioBytes = encodeAudio(audio, seconds);

  const futureProof = lengthDelimited(
    1,
    lengthDelimited(26, Buffer.concat([stickerBytes, lengthDelimited(26, audioBytes)]))
  );

  const payload = proto.Message.create({
    messageContextInfo: { messageSecret: crypto.randomBytes(32) },
  });
  // enumerable كيخلّي النسخ بـ{ ...message } داخل Baileys يحمل الحقول الخام.
  Object.defineProperty(payload, RAW_FIELDS, { value: [[134, futureProof]], enumerable: true });

  return payload;
}

/** يُرمّز الرسالة بعد حقن الحقول الخام، ويُعيد الترميز الأصلي دائمًا. */
async function withRawEncoder(fn) {
  const originalEncode = proto.Message.encode;
  proto.Message.encode = function patchedEncode(message, writer) {
    const result = originalEncode.call(this, message, writer);
    const raw = message?.[RAW_FIELDS];
    if (raw) for (const [field, body] of raw) result.uint32(field * 8 + 2).bytes(body);
    return result;
  };
  try {
    return await fn();
  } finally {
    proto.Message.encode = originalEncode;
  }
}

export function encodeWithRaw(payload) {
  return withRawEncoder(() => proto.Message.encode(payload).finish());
}

function relayWithRaw(sock, jid, payload) {
  return withRawEncoder(() => sock.relayMessage(jid, payload, {}));
}

async function downloadQuoted(sock, from, contextInfo, quoted) {
  return downloadMediaMessage(
    {
      key: {
        remoteJid: from,
        id: contextInfo?.stanzaId,
        participant: contextInfo?.participant,
      },
      message: quoted,
    },
    "buffer",
    {},
    { sock }
  );
}

export default {
  name: ["ملصق-صوت", "ملصق_بصوت"],
  description: "يصنع ملصقًا بصوت مدمج (ميزة تجريبية)",
  category: "الملصقات",

  async run({ sock, from, sender, senderNum, msg, react, reply }) {
    const contextInfo = contextInfoOf(msg.message);
    const quoted = contextInfo?.quotedMessage;
    const quotedType = quoted ? Object.keys(quoted)[0] : null;
    const pickKey = `${from}|${sender}`;

    if (quotedType === "imageMessage" || quotedType === "stickerMessage") {
      try {
        const buffer = await downloadQuoted(sock, from, contextInfo, quoted);
        if (!buffer?.length) throw new Error("لم أستطع تنزيل الغلاف.");
        for (const [key, entry] of pickedCovers) {
          if (Date.now() - entry.ts > PICK_TTL_MS) pickedCovers.delete(key);
        }
        pickedCovers.set(pickKey, { buffer, ts: Date.now() });
        await react("🎵");
        return await reply({
          text: "✅ حفظت الغلاف. ردّ الآن على مقطع صوتي بنفس الأمر خلال 90 ثانية.",
        });
      } catch (e) {
        await react("❌");
        return await reply({ text: `❌ تعذّر حفظ الغلاف:\n${e.message}` });
      }
    }

    const isVideo = quotedType === "videoMessage";
    if (quotedType !== "audioMessage" && !isVideo) {
      return await reply({ text: USAGE });
    }

    if (busy) return await reply({ text: "⏳ هناك معالجة جارية الآن، انتظر قليلًا ثم أعد المحاولة." });
    busy = true;

    try {
      const mediaBuffer = await downloadQuoted(sock, from, contextInfo, quoted);
      if (!mediaBuffer?.length) throw new Error("لم أستطع تنزيل الوسيط.");
      if (mediaBuffer.length > MAX_AUDIO_BYTES) {
        throw new Error(`حجم ${isVideo ? "الفيديو" : "الصوت"} أكبر من 25 ميغابايت.`);
      }

      const seconds = await probeSeconds(mediaBuffer);
      let opus;
      let webpBuffer;
      let covered = false;
      let clipSeconds = seconds === null ? 0 : Math.min(seconds, MAX_AUDIO_SECONDS);

      if (isVideo) {
        const duration = Math.min(seconds || MAX_VIDEO_SECONDS, MAX_VIDEO_SECONDS);
        clipSeconds = duration;
        [webpBuffer, opus] = await Promise.all([
          buildAnimatedSticker(mediaBuffer, duration),
          toOpus(mediaBuffer, duration),
        ]);
      } else {
        opus = await toOpus(mediaBuffer);

        const pick = pickedCovers.get(pickKey);
        covered = Boolean(pick && Date.now() - pick.ts <= PICK_TTL_MS);
        const cover = covered
          ? await prepareCover(pick.buffer)
          : await prepareCover(fs.readFileSync(DEFAULT_COVER));
        webpBuffer = cover.buffer;
      }

      let finalWebp = webpBuffer;
      try {
        finalWebp = addStickerExif(webpBuffer, buildCredit(msg.pushName, senderNum));
      } catch (e) {
        log.warn(`ملصق-صوت: تعذّر إضافة الحقوق — ${e.message}`);
      }

      const [sticker, audio] = await Promise.all([
        uploadMedia(sock, encryptMedia(finalWebp, "WhatsApp Image Keys"), "sticker"),
        uploadMedia(sock, encryptMedia(opus, "WhatsApp Audio Keys"), "audio"),
      ]);

      const payload = buildPayload({
        sticker,
        audio,
        webp: parseWebp(finalWebp),
        seconds: clipSeconds,
      });

      await relayWithRaw(sock, from, payload);

      if (covered) pickedCovers.delete(pickKey);
      await react("✅");
    } catch (e) {
      await react("❌");
      log.error(`ملصق-صوت: ${e.message}`);
      await reply({ text: `❌ تعذّر صناعة الملصق الصوتي:\n${e.message}` });
    } finally {
      busy = false;
    }
  },
};
