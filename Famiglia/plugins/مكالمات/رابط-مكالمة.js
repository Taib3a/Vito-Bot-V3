import { currentCall, getVoip } from "../_محرّكات/مكالمات/ربط.js"

export default {
  name: ["رابط-مكالمة"],
  description: "يعرض رابط المكالمة أو الغرفة الجارية",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, from, reply, react }) {
    const call = currentCall(from)
    if (!call) return reply({ text: "❌ لا توجد مكالمة جارية في هذه المحادثة." })

    await react("🔗")
    let link = null
    try {
      const voip = getVoip(sock)
      await voip.listen()
      link = (await voip.getLink(call)) ?? call.link ?? null
    } catch (e) {
      link = call.link ?? null
    }

    return reply({
      text: link
        ? `🔗 *رابط المكالمة:*\n${link}\n\n> يشارَك مع من تريد دعوته.`
        : "⚠️ *لا يوجد رابط لهذه المكالمة.*\n> الرابط يتوفر في الغرف المنشأة بـ *.غرفة*."
    })
  }
}
