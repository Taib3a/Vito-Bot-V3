import { currentCall } from "../../ربط.js"

export default {
  name: ["اضف-للمكالمة"],
  description: "يضيف رقماً إلى المكالمة الجارية",
  category: "مكالمات",
  ownerOnly: true,

  async run({ from, reply, react, args }) {
    const call = currentCall(from)
    if (!call) return reply({ text: "❌ لا توجد مكالمة جارية في هذه المحادثة." })

    const number = String(args[0] || "").replace(/\D/g, "")
    if (!number) {
      return reply({ text: "❌ *طريقة الاستخدام:* *.اضف-للمكالمة <الرقم>*" })
    }

    await react("➕")
    try {
      await call.addParticipant(number)
      return reply({ text: `➕ *أُضيف ${number} إلى المكالمة.*` })
    } catch (e) {
      await react("❌")
      return reply({ text: `❌ فشل إضافة ${number}: ${e?.message || e}` })
    }
  }
}
