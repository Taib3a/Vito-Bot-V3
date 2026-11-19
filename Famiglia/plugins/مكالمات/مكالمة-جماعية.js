import { getVoip, addCall, removeCall, groupMemberNumbers, parseMediaArgs } from "../../ربط.js"
import { missingRequirements, mediaRequirementMessage } from "../../المتطلبات.js"

export default {
  name: ["مكالمة-جماعية"],
  description: "يبدأ مكالمة جماعية لأعضاء المجموعة (يعمل داخل المجموعات فقط)",
  category: "مكالمات",
  groupOnly: true,
  ownerOnly: true,

  async run(ctx) {
    const { sock, from, msg, reply, react, args, groupMeta } = ctx

    const members = await groupMemberNumbers(ctx)
    if (members.length < 2) {
      return reply({ text: "❌ *لا يمكن بدء مكالمة جماعية:* يحتاج المحرّك عضوين على الأقل غير البوت في المجموعة." })
    }

    const { media, resolution, isVideo, hasMedia, tempFiles, cleanup: cleanupMedia } = await parseMediaArgs(sock, msg, args)

    if (hasMedia) {
      const missing = await missingRequirements({ media: true })
      if (missing.length) {
        cleanupMedia()
        return reply({ text: mediaRequirementMessage(missing) })
      }
    }

    try {
      const willBeVideo = isVideo

      await react("📞")
      const sent = await reply({
        text:
          `📞 *جارٍ بدء مكالمة جماعية...*\n` +
          `> المشاركون: *${members.length}*${willBeVideo ? " (مرئية)" : ""}\n` +
          `> استخدم *.إغلاق* لإنهاء المكالمة`
      })
      const key = sent?.key

      const voip = getVoip(sock)
      const call = await voip.groupCall(members, media, resolution, { groupJid: from })
      addCall(from, call)

      const edit = (t) => (key ? sock.sendMessage(from, { text: t, edit: key }) : sock.sendMessage(from, { text: t }))
      const cleanup = () => {
        removeCall(from, call)
        cleanupMedia()
      }

      call.on("ringing", () => edit(`📞 *ترنّ المكالمة الجماعية...* (${members.length} مشارك)`))
      call.on("connected", () => edit(`✅ *المكالمة الجماعية جارية* (${members.length} مشارك)\n> *.إغلاق* للإنهاء · *.كتم* للكتم`))
      call.on("group_state", (state) => {
        const joined = state?.participants?.length ?? 0
        if (joined > 0) edit(`✅ *المكالمة الجماعية جارية*\n> المنضمّون: *${joined}* · الإجمالي: ${members.length}`)
      })
      call.on("downgraded", () => sock.sendMessage(from, { text: "🎥 أُوقفت الكاميرات، تحوّلت المكالمة إلى صوتية." }))
      call.on("ended", (reason) => {
        cleanup()
        edit(reason === "declined" ? "📵 *رُفضت المكالمة الجماعية.*" : `📴 *انتهت المكالمة الجماعية:* ${reason}`)
      })
      call.on("error", (err) => {
        cleanup()
        sock.sendMessage(from, { text: `❌ *خطأ في المكالمة الجماعية:* ${err?.message || err}` })
      })
    } catch (e) {
      cleanupMedia()
      await react("❌")
      return reply({ text: `❌ فشل بدء المكالمة الجماعية: ${e?.message || e}` })
    }
  }
}
