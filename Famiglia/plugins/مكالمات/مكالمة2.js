import { execFile } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { getVoip, addCall, wireCallEvents } from "../../اضافات/محركات.js"
import { missingRequirements, mediaRequirementMessage } from "../../اضافات/محركات.js"

const RESOLUTIONS = /^(240p|360p|480p|720p|1080p)$/i
const YOUTUBE_RE = /(youtube\.com|youtu\.be)/i

// yt-dlp غالباً خارج PATH (مثل ~/.local/bin)
function resolveYtDlp() {
  const candidates = [
    process.env.YTDLP_PATH,
    path.join(os.homedir(), ".local", "bin", "yt-dlp"),
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp"
  ].filter(Boolean)
  return candidates.find((c) => {
    try {
      return fs.existsSync(c)
    } catch {
      return false
    }
  }) || "yt-dlp"
}

function extractStreamUrl(ytDlp, url) {
  return new Promise((resolve, reject) => {
    execFile(
      ytDlp,
      ["-f", "bestaudio/best", "-g", "--no-warnings", "--no-playlist", url],
      { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(new Error(`تعذّر استخراج رابط البث: ${String(err.message).split("\n")[0]}`))
        const found = String(stdout)
          .split("\n")
          .map((l) => l.trim())
          .find((l) => /^https?:\/\//i.test(l))
        if (!found) return reject(new Error("لم يُعِد yt-dlp رابط بث صالحاً"))
        resolve(found)
      }
    )
  })
}

export default {
  name: ["مكالمة2", "بث-قناة"],
  description: "يبثّ رابط قناة أو بث مباشر (يوتيوب أو HLS) بالصوت داخل غرفة مكالمة برابط دائم",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, from, reply, react, args }) {
    const resolutionArg = args.find((a) => RESOLUTIONS.test(a))
    const resolution = resolutionArg ? resolutionArg.toLowerCase() : null
    const url = args.find((a) => /^https?:\/\//i.test(a))

    if (!url) {
      return reply({
        text:
          "📡 *طريقة الاستخدام:*\n" +
          "> *.مكالمة2 <رابط القناة أو البث>* — بالجودة الأصلية\n" +
          "> *.مكالمة2 <الرابط> 720* — بجودة محددة\n" +
          "> الجودات: 240 · 360 · 480 · 720 · 1080\n" +
          "> *.مكالمة-اغلاق <رابط الغرفة>* لإغلاق البث"
      })
    }

    const missing = await missingRequirements({ media: true })
    if (missing.length) {
      return reply({ text: mediaRequirementMessage(missing) })
    }

    await react("📡")

    let streamUrl = url
    if (YOUTUBE_RE.test(url)) {
      const wait = await reply({ text: "📡 *جارٍ استخراج رابط البث...*" })
      try {
        streamUrl = await extractStreamUrl(resolveYtDlp(), url)
      } catch (e) {
        await react("❌")
        return reply({ text: `❌ ${e?.message || e}\n> تأكّد من تثبيت yt-dlp على السيرفر.` })
      }
      if (wait?.key) await sock.sendMessage(from, { delete: wait.key }).catch(() => {})
    }

    const sent = await reply({ text: "📡 *جارٍ الاتصال بالبث المباشر...*" })

    try {
      const voip = getVoip(sock)
      // رابط http → المحرّك يبثّه حياً عبر startStream (بلا تنزيل)
      const call = await voip.createRoom(streamUrl, resolution, {
        isVideo: false,
        loop: true,
        autoEndCall: false,
        requireApproval: false
      })
      addCall(from, call)

      const { edit } = wireCallEvents({
        sock,
        from,
        call,
        key: sent?.key,
        tempFiles: [],
        title: "البث المباشر"
      })

      const link = call.link
      edit(
        `📡 *البث المباشر جاهز*\n` +
          (link ? `> الرابط: ${link}\n` : "") +
          `> الجودة: ${resolution || "الأصلية"}\n` +
          `> 🔁 يُعيد الاتصال تلقائياً عند الانقطاع\n` +
          `> *.مكالمة-اغلاق ${link || "<الرابط>"}* لإيقافه`
      )
    } catch (e) {
      await react("❌")
      return reply({ text: `❌ فشل بث الرابط: ${e?.message || e}` })
    }
  }
}
