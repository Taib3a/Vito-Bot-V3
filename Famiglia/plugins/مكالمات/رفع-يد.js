import { currentCall } from "../../Corleone/مكالمات/ربط.js"

export default {
  name: ["رفع-يد"],
  description: "يرفع أو يُنزل اليد في المكالمة الجارية",
  category: "مكالمات",
  ownerOnly: true,

  async run({ from, reply, react, args }) {
    const call = currentCall(from)
    if (!call) return reply({ text: "❌ لا توجد مكالمة جارية في هذه المحادثة." })

    const down = ["نزل", "إنزال", "down", "0"].includes((args[0] || "").toLowerCase())
    await react(down ? "👇" : "✋")

    try {
      call.raiseHand(!down)
      return reply({
        text: down ? "👇 *أُنزلت اليد.*" : "✋ *رُفعت اليد* — أُشعر المشاركون."
      })
    } catch (e) {
      await react("❌")
      return reply({ text: `❌ تعذّر تغيير اليد: ${e?.message || e}` })
    }
  }
}
