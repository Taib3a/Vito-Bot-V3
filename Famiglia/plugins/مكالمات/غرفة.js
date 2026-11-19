import { getVoip, addCall, parseMediaArgs, wireCallEvents } from "../../Corleone/اضافات/مكالمات/ربط.js"
import { missingRequirements, mediaRequirementMessage } from "../../Corleone/اضافات/مكالمات/المتطلبات.js"

export default {
  name: ["غرفة"],
  description: "ينشئ غرفة مكالمة برابط قابل للمشاركة والانضمام",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, from, msg, reply, react, args }) {
    const requireApproval = args.some((a) => /^approval$/i.test(a)) ? true : args.some((a) => /^open$/i.test(a)) ? false : undefined
    const forceVideo = args.some((a) => /^video$/i.test(a))
    const { media, resolution, isVideo, hasMedia, autoEndCall, loop, tempFiles, cleanup: cleanupMedia } = await parseMediaArgs(sock, msg, args)

    if (hasMedia) {
      const missing = await missingRequirements({ media: true })
      if (missing.length) {
        cleanupMedia()
        return reply({ text: mediaRequirementMessage(missing) })
      }
    }

    await react("🚪")
    const sent = await reply({
      text: `🚪 *جارٍ إنشاء غرفة مكالمة${isVideo ? " مرئية" : " صوتية"}...*`
    })

    try {
      const voip = getVoip(sock)
      const call = await voip.createRoom(media, resolution, {
        requireApproval,
        isVideo: forceVideo || isVideo,
        loop,
        autoEndCall
      })
      addCall(from, call)

      const { edit } = wireCallEvents({ sock, from, call, key: sent?.key, tempFiles, title: "الغرفة" })

      const link = call.link
      edit(
        `🚪 *الغرفة جاهزة*\n` +
          (link ? `> الرابط: ${link}\n` : "") +
          (requireApproval === true ? "> 🔐 تتطلب موافقة قبل الانضمام\n" : "") +
          `> *.إغلاق* لإغلاقها · *.انتظار* لإدارة الموافقة`
      )
    } catch (e) {
      cleanupMedia()
      await react("❌")
      return reply({ text: `❌ فشل إنشاء الغرفة: ${e?.message || e}` })
    }
  }
}
