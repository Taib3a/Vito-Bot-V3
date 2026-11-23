import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { execFile } from "child_process";
import { downloadMediaMessage } from "@whiskeysockets/baileys";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, "../../../tmp");

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

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

export default {
  name: ["لصوره", "لصورة", "تحويل-صورة"],
  description: "يحوّل الملصق إلى صورة",
  category: "أدوات",

  async run({ sock, from, msg, react, reply }) {
    const contextInfo = contextInfoOf(msg.message);
    const quoted = contextInfo?.quotedMessage;
    const quotedType = quoted ? Object.keys(quoted)[0] : null;

    if (quotedType !== "stickerMessage") {
      return await reply({ text: "❌ ردّ على ملصق بأمر `.لصوره`." });
    }

    const id = crypto.randomBytes(8).toString("hex");
    const input = path.join(TMP_DIR, `toimg_${id}.webp`);
    const output = path.join(TMP_DIR, `toimg_${id}.png`);

    await react("🖼️");

    try {
      const quotedMsg = {
        key: {
          remoteJid: from,
          id: contextInfo.stanzaId,
          participant: contextInfo.participant,
        },
        message: quoted,
      };

      const buffer = await downloadMediaMessage(quotedMsg, "buffer", {}, { sock });
      fs.writeFileSync(input, buffer);

      await execFileAsync(
        "ffmpeg",
        ["-i", input, "-frames:v", "1", "-y", output],
        { timeout: 60_000 }
      );

      if (!fs.existsSync(output)) throw new Error("لم يُنتج ffmpeg صورة.");

      await sock.sendMessage(
        from,
        {
          image: fs.readFileSync(output),
          caption: "✅ تم تحويل الملصق إلى صورة.",
        },
        { quoted: msg }
      );

      await react("✅");
    } catch (e) {
      await react("❌");
      await reply({ text: `❌ تعذّر تحويل الملصق:\n${e.message}` });
    } finally {
      try { fs.unlinkSync(input); } catch {}
      try { fs.unlinkSync(output); } catch {}
    }
  },
};
