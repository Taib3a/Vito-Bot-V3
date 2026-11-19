import { getVoip, addCall, parseMediaArgs, wireCallEvents } from "../../Corleone/مكالمات/ربط.js"

export default {
  name: ["غرفة"],
  description: "ينشئ غرفة مكالمة برابط قابل للمشاركة والانضمام",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, from, msg, reply, react, args }) {
    const requireApproval = args.includes("approval")
    const { media, resolution, isVideo, tempFiles, cleanup: cleanupMedia } = await parseMediaArgs(sock, msg, args)

    await react("🚪")
    const sent = await reply({
      text: `🚪 *جارٍ إنشاء غرفة مكالمة${isVideo ? " مرئية" : " صوتية"}...*`
    })

    try {
      const voip = getVoip(sock)
      const call = await voip.createRoom(media, resolution, { requireApproval })
      addCall(from, call)

      const { edit } = wireCallEvents({ sock, from, call, key: sent?.key, tempFiles, title: "الغرفة" })

      const link = call.link
      edit(
        `🚪 *الغرفة جاهزة*\n` +
          (link ? `> الرابط: ${link}\n` : "") +
          (requireApproval ? "> 🔐 تتطلب موافقة قبل الانضمام\n" : "") +
          `> *.إغلاق* لإغلاقها · *.انتظار* لإدارة الموافقة`
      )
    } catch (e) {
      cleanupMedia()
      await react("❌")
      return reply({ text: `❌ فشل إنشاء الغرفة: ${e?.message || e}` })
    }
  }
}
