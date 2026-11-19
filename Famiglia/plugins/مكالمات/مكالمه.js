import { getVoip, addCall, parseMediaArgs, wireCallEvents } from "../../اضافات/محركات.js"
import { missingRequirements, mediaRequirementMessage } from "../../اضافات/محركات.js"

export default {
  name: ["مكالمه", "مكالمة-وسائط"],
  description: "يبثّ وسائط (صوت أو فيديو) داخل غرفة مكالمة برابط دائم — ردّ على الوسائط واكتب الأمر مع الدقة",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, from, msg, reply, react, args }) {
    const contextInfo = msg?.message?.extendedTextMessage?.contextInfo
    const quoted = contextInfo?.quotedMessage
    const hasQuotedMedia = !!(quoted?.audioMessage || quoted?.videoMessage)

    // يقبل "240" كما يقبل "240p"
    const normalizedArgs = args.map((a) => (/^\d{3,4}$/.test(String(a)) ? `${a}p` : a))

    const { media, resolution, isVideo, hasMedia, tempFiles, cleanup: cleanupMedia } =
      await parseMediaArgs(sock, msg, normalizedArgs)

    if (!hasMedia && !hasQuotedMedia) {
      return reply({
        text:
          "🎬 *طريقة الاستخدام:*\n" +
          "> ردّ على مقطع صوت أو فيديو واكتب:\n" +
          "> *.مكالمه* — بالجودة الأصلية\n" +
          "> *.مكالمه 240* — بجودة محددة\n" +
          "> الجودات: 240 · 360 · 480 · 720 · 1080\n" +
          "> *.مكالمة-اغلاق <الرابط>* لإغلاق البث"
      })
    }

    // الردّ على وسائط لكن التنزيل فشل → لا نبثّ صمتاً بلا تنبيه
    if (hasQuotedMedia && !hasMedia) {
      cleanupMedia()
      return reply({
        text: "❌ *تعذّر تنزيل الوسائط المردود عليها.*\n> أعد إرسال المقطع أو تأكّد أن الحجم ضمن الحد المسموح."
      })
    }

    const missing = await missingRequirements({ media: true })
    if (missing.length) {
      cleanupMedia()
      return reply({ text: mediaRequirementMessage(missing) })
    }

    await react("🎬")
    const sent = await reply({
      text: `🎬 *جارٍ تجهيز البث${isVideo ? " المرئي" : " الصوتي"}...*`
    })

    try {
      const voip = getVoip(sock)
      const call = await voip.createRoom(media, resolution, {
        isVideo: isVideo,
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
          `> النوع: ${isVideo ? "فيديو مع صوت" : "صوت"}\n` +
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
