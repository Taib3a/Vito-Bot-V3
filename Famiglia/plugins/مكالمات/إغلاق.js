import { callsOf, getVoip } from "../../اضافات/محركات.js"

export default {
  name: ["إغلاق"],
  description: "ينهي المكالمة الجارية في هذه المحادثة",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, from, reply, react, args }) {
    const voip = getVoip(sock)

    if (args[0] === "force") {
      await react("🧹")
      await voip.end(true)
      return reply({ text: "🧹 *تم تصفير حالة المكالمات قسرياً.*" })
    }

    const calls = callsOf(from)
    if (calls.length === 0) return reply({ text: "❌ لا توجد مكالمة جارية في هذه المحادثة." })

    await react("📴")
    await reply({ text: `📴 *جارٍ إنهاء ${calls.length} مكالمة...*` })

    for (const call of calls) {
      try {
        await call.hangup()
      } catch (e) {
        console.error("[إغلاق] فشل إنهاء مكالمة:", e.message)
      }
    }
  }
}
