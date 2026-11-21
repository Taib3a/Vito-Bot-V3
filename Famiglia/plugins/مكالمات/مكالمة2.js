import { getVoip, addCall, wireCallEvents } from "../../اضافات/محركات.js"
import { missingRequirements, mediaRequirementMessage } from "../../اضافات/محركات.js"
import { resolveStreamUrl } from "../../Corleone/بث/بث.js"

// يقبل "240" و"240p" — المستخدم يكتب الجودة بلا حرف p عادةً
const RESOLUTIONS = /^(240|360|480|720|1080)p?$/i
const REFRESH_DELAY_MS = 8_000


// رابط المكالمة لا يكون جاهزاً فور createRoom — ننتظره قليلاً
async function waitForLink(call, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const link = call?.link
    if (link) return link
    await new Promise((r) => setTimeout(r, 400))
  }
  return null
}

export default {
  name: ["مكالمة2", "بث-قناة"],
  description: "يبثّ قناة عربية أو رابط بث مباشر بالصوت والفيديو داخل غرفة مكالمة برابط دائم",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, from, reply, react, args }) {
    const resolutionArg = args.find((a) => RESOLUTIONS.test(a))
    const resolution = resolutionArg ? `${resolutionArg.toLowerCase().replace(/p$/, "")}p` : null
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
      // فيديو + صوت: القناة بلا صورة مجرد راديو
      const call = await voip.createRoom(resolved.url, resolution, {
        isVideo: true,
        loop: true,
        autoEndCall: false,
        requireApproval: false
      })
      addCall(from, call)

      wireCallEvents({
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
            await voip.coordinator?.loadVideo(call.callId, next.url)
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
      call.on("ended", () => {
        stopped = true
      })

      // رسالة الرابط منفصلة تماماً عن رسالة الحالة: wireCallEvents يعدّل
      // رسالة الحالة عند الاتصال، فلو حملت الرابط لمحته.
      const link = await waitForLink(call)
      if (link) await sock.sendMessage(from, { text: link })
    } catch (e) {
      await react("❌")
      return reply({ text: `❌ فشل بث القناة: ${e?.message || e}` })
    }
  }
}
