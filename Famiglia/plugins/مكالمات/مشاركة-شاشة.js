import { currentCall } from "../_محرّكات/مكالمات/ربط.js"

export default {
  name: ["مشاركة-شاشة"],
  description: "يبدأ أو يوقف مشاركة الشاشة في المكالمة الجارية",
  category: "مكالمات",
  ownerOnly: true,

  async run({ from, reply, react, args }) {
    const call = currentCall(from)
    if (!call) return reply({ text: "❌ لا توجد مكالمة جارية في هذه المحادثة." })

    const stop = ["ايقاف", "إيقاف", "ايقاف-المشاركة", "stop", "0"].includes((args[0] || "").toLowerCase())
    await react(stop ? "🛑" : "🖥️")

    try {
      call.shareScreen(!stop)
      return reply({
        text: stop ? "🛑 *أُوقفت مشاركة الشاشة.*" : "🖥️ *بدأت مشاركة الشاشة.*"
      })
    } catch (e) {
      await react("❌")
      return reply({ text: `❌ تعذّرت مشاركة الشاشة: ${e?.message || e}` })
    }
  }
}
