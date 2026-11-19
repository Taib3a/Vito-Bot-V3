import { getVoip, addCall, parseMediaArgs, wireCallEvents } from "../../اضافات/محركات.js"
import { missingRequirements, mediaRequirementMessage } from "../../اضافات/محركات.js"
import { resolveStreamUrl, findChannel } from "../../Corleone/بث/بث.js"

export default {
  name: ["مكالمه", "مكالمة-وسائط"],
  description: "يبثّ وسائط أو قناة داخل غرفة مكالمة برابط دائم — ردّ على وسائط أو مرّر رابطاً/اسم قناة",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, from, msg, reply, react, args }) {
    // يقبل "240" كما يقبل "240p"
    const normalizedArgs = args.map((a) => (/^\d{3,4}$/.test(String(a)) ? `${a}p` : a))

    const {
      media,
      resolution,
      isVideo,
      hasMedia,
      hasQuotedMedia: quotedHasMedia,
      mediaError,
      tempFiles,
      cleanup: cleanupMedia
    } = await parseMediaArgs(sock, msg, normalizedArgs)

    // اسم قناة عربية (مثل: الجزيرة) أو رابط صفحة بث
    const channelWord = normalizedArgs.filter((a) => !/^https?:\/\//i.test(a) && !/^\d{3,4}p$/i.test(a)).join(" ").trim()
    const pageUrl = normalizedArgs.find((a) => /^https?:\/\//i.test(a) && !/\.(mp3|aac|m4a|ogg|opus|flac|wav|mp4|webm|mov|mkv|m4v|3gp)(\?|#|$)/i.test(a))

    if (!hasMedia && !quotedHasMedia && !channelWord && !pageUrl) {
      return reply({
        text:
          "🎬 *طريقة الاستخدام:*\n" +
          "> ردّ على مقطع صوت أو فيديو واكتب:\n" +
          "> *.مكالمه* — بالجودة الأصلية\n" +
          "> *.مكالمه 240* — بجودة محددة\n" +
          "> أو *.مكالمه <اسم قناة>* — مثال: *.مكالمه الجزيرة*\n" +
          "> أو *.مكالمه <رابط>*\n" +
          "> الجودات: 240 · 360 · 480 · 720 · 1080\n" +
          "> *.مكالمة-اغلاق <الرابط>* لإغلاق البث"
      })
    }

    // الردّ على وسائط لكن التنزيل فشل → لا نبثّ صمتاً بلا تنبيه
    if (quotedHasMedia && !hasMedia && !channelWord && !pageUrl) {
      cleanupMedia()
      const reason = mediaError?.message || mediaError?.toString?.() || ""
      const text =
        "❌ *تعذّر تنزيل الوسائط المردود عليها.*\n" +
        (reason ? `> السبب: ${String(reason).slice(0, 160)}\n` : "") +
        "> أعد إرسال المقطع أو تأكّد أن الحجم ضمن الحد المسموح."
      if (typeof sock?.sendButtonMessage === "function") {
        return sock
          .sendButtonMessage(
            from,
            text,
            [
              { text: "🔁 إعادة المحاولة", id: ".مكالمه" },
              { text: "📺 القنوات", id: ".قنوات" }
            ],
            { footer: "أعد الردّ على المقطع ثم اضغط الزر", quoted: msg }
          )
          .catch(() => reply({ text }))
      }
      return reply({ text })
    }

    // مصدر البث: وسائط مردود عليها، أو رابط/اسم قناة من الوسائط
    let sourceMedia = media
    let sourceIsVideo = isVideo

    const isLocalMedia = hasMedia && !/^https?:\/\//i.test(String(media || ""))
    const target = channelWord || pageUrl

    if (!isLocalMedia && target) {
      // parseMediaArgs يمرّر أي رابط كما هو — حتى صفحات HTML — فحلّه دائماً
      try {
        const resolved = /^https?:\/\//i.test(target)
          ? await resolveStreamUrl(target)
          : (() => {
              const known = findChannel(target)
              if (!known) throw new Error(`قناة غير معروفة: ${target}\n> استخدم *.قنوات* لعرض القائمة`)
              return { url: known.url }
            })()
        sourceMedia = resolved.url
        sourceIsVideo = false
      } catch (e) {
        cleanupMedia()
        return reply({ text: `❌ ${e?.message || e}` })
      }
    }

    const missing = await missingRequirements({ media: true })
    if (missing.length) {
      cleanupMedia()
      return reply({ text: mediaRequirementMessage(missing) })
    }

    await react("🎬")
    const sent = await reply({
      text: `🎬 *جارٍ تجهيز البث${sourceIsVideo ? " المرئي" : " الصوتي"}...*`
    })

    try {
      const voip = getVoip(sock)
      const call = await voip.createRoom(sourceMedia, resolution, {
        isVideo: sourceIsVideo,
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
        tempFiles,
        title: "البث"
      })

      const link = call.link
      edit(
        `🎬 *البث جاهز داخل المجموعة*\n` +
          (link ? `> الرابط: ${link}\n` : "") +
          `> النوع: ${sourceIsVideo ? "فيديو مع صوت" : "صوت"}\n` +
          `> الجودة: ${resolution || "الأصلية"}\n` +
          `> 🔁 يتكرّر تلقائياً · الرابط دائم\n` +
          `> *.مكالمة-اغلاق ${link || "<الرابط>"}* لإيقافه`
      )
    } catch (e) {
      cleanupMedia()
      await react("❌")
      return reply({ text: `❌ فشل بدء البث: ${e?.message || e}` })
    }
  }
}
