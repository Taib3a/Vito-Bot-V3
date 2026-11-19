import { getVoip, addCall, parseMediaArgs, wireCallEvents } from "../../اضافات/محركات.js"
import { missingRequirements, mediaRequirementMessage } from "../../اضافات/محركات.js"

export default {
  name: ["انضمام-مكالمة"],
  description: "ينضم إلى مكالمة عبر رابطها",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, from, msg, reply, react, args }) {
    const link = args.find((a) => /^https?:\/\//i.test(a))
    if (!link) {
      return reply({
        text: "❌ *طريقة الاستخدام:*\n> *.انضمام-مكالمة <رابط>*\n> *.انضمام-مكالمة <رابط> <دقة>*"
      })
    }

    const isVideo = args.some((a) => /^video$/i.test(a))
    const { media, resolution, hasMedia, autoEndCall, loop, tempFiles, cleanup: cleanupMedia } = await parseMediaArgs(sock, msg, args)

    if (hasMedia) {
      const missing = await missingRequirements({ media: true })
      if (missing.length) {
        cleanupMedia()
        return reply({ text: mediaRequirementMessage(missing) })
      }
    }

    await react("🚪")
    const sent = await reply({ text: "🚪 *جارٍ الانضمام إلى المكالمة...*" })

    try {
      const voip = getVoip(sock)
      const call = await voip.joinLink(link, media, resolution, { isVideo, loop, autoEndCall })
      addCall(from, call)
      wireCallEvents({ sock, from, call, key: sent?.key, tempFiles, title: "المكالمة" })
    } catch (e) {
      cleanupMedia()
      await react("❌")
      return reply({ text: `❌ فشل الانضمام: ${e?.message || e}` })
    }
  }
}
