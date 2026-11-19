import { getVoip, addCall, wireCallEvents } from "../../اضافات/محركات.js"
import { missingRequirements, mediaRequirementMessage } from "../../اضافات/محركات.js"
import { resolveStreamUrl } from "../../Corleone/بث/بث.js"

const RESOLUTIONS = /^(240p|360p|480p|720p|1080p)$/i
const REFRESH_DELAY_MS = 8_000

export default {
  name: ["مكالمة2", "بث-قناة"],
  description: "يبثّ قناة عربية أو رابط بث مباشر بالصوت داخل غرفة مكالمة برابط دائم",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, from, reply, react, args }) {
    const resolutionArg = args.find((a) => RESOLUTIONS.test(a))
    const resolution = resolutionArg ? resolutionArg.toLowerCase() : null
    const target = args.filter((a) => !RESOLUTIONS.test(a)).join(" ").trim()

    if (!target) {
      return reply({
        text:
          "📡 *طريقة الاستخدام:*\n" +
          "> *.مكالمة2 <اسم القناة>* — مثال: *.مكالمة2 الجزيرة*\n" +
          "> *.مكالمة2 <رابط بث>* — يوتيوب أو m3u8 أو صفحة بث\n" +
          "> *.مكالمة2 الجزيرة 720* — بجودة محددة\n" +
          "> *.قنوات* لعرض القنوات المتاحة\n" +
          "> *.مكالمة-اغلاق <الرابط>* لإغلاق البث"
      })
    }

    await react("📡")
    const sent = await reply({ text: "📡 *جارٍ تجهيز البث...*" })

    let resolved
    try {
      resolved = await resolveStreamUrl(target)
    } catch (e) {
      await react("❌")
      return reply({ text: `❌ ${e?.message || e}` })
    }

    const missing = await missingRequirements({ media: true })
    if (missing.length) {
      return reply({ text: mediaRequirementMessage(missing) })
    }

    try {
      const voip = getVoip(sock)
      const call = await voip.createRoom(resolved.url, resolution, {
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

      // تجديد تلقائي: روابط البث تنتهي صلاحيتها أو تنقطع
      let refreshing = false
      let stopped = false
      const refresh = async () => {
        if (refreshing || stopped || call.ended) return
        refreshing = true
        try {
          const next = await resolveStreamUrl(target)
          if (next.url !== resolved.url || resolved.via === "page" || resolved.via === "yt-dlp") {
            await voip.coordinator?.loadAudio(call.callId, next.url)
            resolved = next
          }
        } catch {
          // فشل التجديد — المحرّك يعيد المحاولة عبر reconnect
        } finally {
          refreshing = false
        }
      }

      const onStall = () => {
        if (stopped) return
        setTimeout(refresh, REFRESH_DELAY_MS)
      }
      call.on("reconnecting", onStall)
      call.on("audio_finished", onStall)
      call.on("ended", () => {
        stopped = true
      })

      const label = resolved.channel || resolved.url
      const link = call.link
      edit(
        `📡 *البث المباشر جاهز*\n` +
          (link ? `> الرابط: ${link}\n` : "") +
          `> المصدر: ${String(label).slice(0, 60)}\n` +
          `> الجودة: ${resolution || "الأصلية"}\n` +
          `> 🔁 يُجدّد الرابط تلقائياً عند الانقطاع\n` +
          `> *.مكالمة-اغلاق ${link || "<الرابط>"}* لإيقافه`
      )
    } catch (e) {
      await react("❌")
      return reply({ text: `❌ فشل بث القناة: ${e?.message || e}` })
    }
  }
}
