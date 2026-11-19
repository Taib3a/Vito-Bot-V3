import { getVoip } from "../_محرّكات/مكالمات/ربط.js"

export default {
  name: ["رفض-مكالمة"],
  description: "يرفض مكالمة واردة بالمعرّف أو الأولى في القائمة",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, reply, react, args }) {
    try {
      const voip = getVoip(sock)
      await voip.listen()

      const list = voip.incoming()
      if (!list.length) return reply({ text: "📥 *لا توجد مكالمات واردة لرفضها.*" })

      let callId = args.find((a) => a && a.length > 6)
      if (!callId) {
        const index = Number(args[0]) - 1
        const pick = Number.isInteger(index) && index >= 0 && index < list.length ? list[index] : list[0]
        callId = pick.id
      }

      const target = list.find((c) => c.id === callId)
      if (!target) return reply({ text: `❌ لا توجد مكالمة واردة بالمعرّف \`${callId}\`.` })

      await react("📵")
      await voip.reject(callId)
      return reply({ text: `📵 *رُفضت المكالمة من ${target.from || "غير معروف"}.*` })
    } catch (e) {
      await react("❌")
      return reply({ text: `❌ فشل رفض المكالمة: ${e?.message || e}` })
    }
  }
}
