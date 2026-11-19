import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { currentCall } from "../../اضافات/محركات.js"
import { missingRequirements, mediaRequirementMessage } from "../../اضافات/محركات.js"
import { searchYouTube, youtubeAudioBuffer, cleanFileName } from "../../اضافات/محركات.js"

const STAGING = path.join(os.tmpdir(), "vito_songs")

function stagingFile(title) {
  fs.mkdirSync(STAGING, { recursive: true })
  return path.join(STAGING, `${cleanFileName(title)}_${Date.now()}.mp3`)
}

// المحرّك لا يحذف إلا ما نزّله بنفسه، فنتتبّع ملفاتنا ونحذفها عند انتهاء المكالمة.
const stagedByCall = new WeakMap()

function trackStaged(call, file) {
  if (!stagedByCall.has(call)) {
    const files = new Set()
    stagedByCall.set(call, files)
    const purge = () => {
      for (const f of files) {
        try {
          fs.existsSync(f) && fs.unlinkSync(f)
        } catch {}
      }
      files.clear()
    }
    call.once("ended", purge)
    call.once("error", purge)
  }
  stagedByCall.get(call).add(file)
}

export default {
  name: ["شغل", "أغنية-مكالمة", "play"],
  description: "يشغّل أغنية داخل مكالمة جارية (يضيفها للطابور)",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, from, reply, react, text, args }) {
    const query = (text || args.join(" ")).trim()
    if (!query) {
      return reply({
        text:
          "🎵 *طريقة الاستخدام:*\n" +
          "> *.شغل <اسم الأغنية أو رابط يوتيوب>*\n" +
          "> يضيف الأغنية إلى المكالمة الجارية في هذه الدردشة\n\n" +
          "*أمثلة:*\n" +
          "> `.شغل Adele Hello`\n" +
          "> `.شغل https://youtu.be/dQw4w9WgXcQ`\n\n" +
          "> ابدأ مكالمة أولاً: `.مكالمة <رقم> silence` أو `.غرفة`"
      })
    }

    const call = currentCall(from)
    if (!call) {
      return reply({
        text: "❌ لا توجد مكالمة جارية هنا.\n> ابدأ واحدة بـ `.مكالمة <رقم>` أو `.غرفة`، ثم أعد الأمر."
      })
    }

    const missing = await missingRequirements({ media: true })
    if (missing.length) {
      return reply({ text: mediaRequirementMessage(missing) })
    }

    await react("🎧")

    let file
    try {
      const results = await searchYouTube(query, 1)
      if (!results.length) {
        await react("❌")
        return reply({ text: `❌ لم أجد نتائج لـ: ${query}` })
      }

      const video = results[0]
      await reply({ text: `🎵 *جارٍ تجهيز:* ${video.title}\n> المدة: ${video.duration}` })

      const { buffer } = await youtubeAudioBuffer(video.url)
      file = stagingFile(video.title)
      fs.writeFileSync(file, buffer)
      trackStaged(call, file)

      await call.append(file)
      await react("✅")

      return reply({
        text:
          `🎶 *أُضيفت للمكالمة:* ${video.title}\n` +
          `> القناة: ${video.channel}\n` +
          `> الحجم: ${(buffer.length / 1024 / 1024).toFixed(1)} م.ب\n` +
          `> استخدم *.التالي* للانتقال أو *.إغلاق* للإنهاء`
      })
    } catch (e) {
      if (file) try { fs.existsSync(file) && fs.unlinkSync(file) } catch {}
      await react("❌")
      return reply({ text: `❌ تعذّر التشغيل: ${e.message}` })
    }
  }
}
