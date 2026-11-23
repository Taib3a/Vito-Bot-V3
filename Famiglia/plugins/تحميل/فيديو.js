import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, "../../../tmp");
const MAX_MB = 60;
const YTDLP = process.env.YTDLP_PATH || "yt-dlp";

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const isUrl = (value) => /^https?:\/\/\S+$/i.test(String(value || ""));

export default {
  name: ["فيديو"],
  description: "تحميل فيديو من رابط مباشر أو مواقع التواصل",
  category: "التحميل",
  groupOnly: false,

  async run({ sock, from, msg, args, reply, react }) {
    const url = args[0];

    if (!isUrl(url)) {
      return await reply({
        text: "🎬 أرسل رابط الفيديو بعد الأمر.\n\nمثال:\n`.فيديو https://www.tiktok.com/@user/video/123`",
      });
    }

    const id = crypto.randomBytes(8).toString("hex");
    const outputTemplate = path.join(TMP_DIR, `vito_video_${id}.%(ext)s`);
    let filePath = null;

    await react("🎬");

    try {
      await execFileAsync(
        YTDLP,
        [
          "--no-playlist",
          "--no-warnings",
          "--restrict-filenames",
          "--no-mtime",
          "--max-filesize",
          `${MAX_MB}M`,
          "--merge-output-format",
          "mp4",
          "--remux-video",
          "mp4",
          "-o",
          outputTemplate,
          url,
        ],
        { timeout: 300000, maxBuffer: 20 * 1024 * 1024 }
      );

      filePath = fs
        .readdirSync(TMP_DIR)
        .filter((name) => name.startsWith(`vito_video_${id}.`))
        .map((name) => path.join(TMP_DIR, name))
        .find((candidate) => fs.statSync(candidate).size > 0);

      if (!filePath) throw new Error("لم يُنتج yt-dlp أي ملف.");

      const sizeMB = fs.statSync(filePath).size / (1024 * 1024);
      if (sizeMB > MAX_MB) {
        throw new Error(`حجم الفيديو ${sizeMB.toFixed(1)}MB أكبر من الحد ${MAX_MB}MB.`);
      }

      const host = new URL(url).hostname.replace(/^www\./, "");

      await sock.sendMessage(
        from,
        {
          video: { url: filePath },
          mimetype: "video/mp4",
          fileName: "video.mp4",
          caption: `🎬 *تم تحميل الفيديو*\n> المصدر: ${host}`,
        },
        { quoted: msg }
      );

      await react("✅");
    } catch (error) {
      await react("❌");
      const detail = String(error?.stderr || error?.message || error).split("\n").slice(-3).join("\n");
      await reply({ text: `❌ تعذّر تحميل الفيديو:\n${detail}` });
    } finally {
      if (filePath) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
  },
};
