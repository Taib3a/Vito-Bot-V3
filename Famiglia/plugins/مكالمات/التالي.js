import { currentCall } from "../../اضافات/محركات.js"

export default {
  name: ["التالي", "تخطي"],
  description: "ينتقل إلى الوسيط التالي في مكالمة جارية",
  category: "مكالمات",
  ownerOnly: true,

  async run({ from, reply, react }) {
    const call = currentCall(from)
    if (!call) {
      return reply({ text: "❌ لا توجد مكالمة جارية هنا." })
    }

    try {
      const items = call.items || []
      const index = typeof call.index === "number" ? call.index : 0

      if (index + 1 >= items.length) {
        return reply({ text: "⏹️ لا يوجد عنصر تالٍ في الطابور.\n> أضف أغنية بـ *.شغل <اسم>*" })
      }

      const moved = await call.jump(index + 1)
      if (!moved) {
        return reply({ text: "❌ تعذّر الانتقال. قد تكون المكالمة منتهية." })
      }

      await react("⏭️")
      return reply({ text: `⏭️ *العنصر ${index + 2} من ${items.length}*` })
    } catch (e) {
      await react("❌")
      return reply({ text: `❌ خطأ: ${e.message}` })
    }
  }
}
