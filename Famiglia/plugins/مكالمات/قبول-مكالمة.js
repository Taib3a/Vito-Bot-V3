import { getVoip, addCall, parseMediaArgs, wireCallEvents } from "../_محرّكات/مكالمات/ربط.js"

export default {
  name: ["قبول-مكالمة"],
  description: "يقبل مكالمة واردة بالمعرّف أو الأولى في القائمة",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, from, msg, reply, react, args }) {
    try {
      const voip = getVoip(sock)
      await voip.listen()

      const list = voip.incoming()
      if (!list.length) return reply({ text: "📥 *لا توجد مكالمات واردة لقبولها.*" })

      // يُقبل معرّف صريح طويل، أو رقم ترتيبي قصير، وإلا الأولى في القائمة.
      let callId = args.find((a) => a && a.length > 6)
      if (!callId) {
        const index = Number(args[0]) - 1
        const pick = Number.isInteger(index) && index >= 0 && index < list.length ? list[index] : list[0]
        callId = pick.id
      }

      const target = list.find((c) => c.id === callId)
      if (!target) return reply({ text: `❌ لا توجد مكالمة واردة بالمعرّف \`${callId}\`.` })

      const { media, resolution, tempFiles, cleanup: cleanupMedia } = await parseMediaArgs(sock, msg, args)

      await react("📲")
      const sent = await reply({ text: `📲 *جارٍ قبول المكالمة من ${target.from || "غير معروف"}...*` })

      const call = await voip.accept(callId, media, resolution)
      addCall(from, call)
      wireCallEvents({ sock, from, call, key: sent?.key, tempFiles, title: "المكالمة" })
    } catch (e) {
      await react("❌")
      return reply({ text: `❌ فشل قبول المكالمة: ${e?.message || e}` })
    }
  }
}
