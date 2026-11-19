import { currentCall } from "../../Corleone/اضافات/مكالمات/ربط.js"

export default {
  name: ["انتظار"],
  description: "يدير غرفة الانتظار: تفعيل الموافقة، أو قبول/رفض منتظر",
  category: "مكالمات",
  ownerOnly: true,

  async run({ from, reply, react, args }) {
    const call = currentCall(from)
    if (!call) return reply({ text: "❌ لا توجد مكالمة جارية في هذه المحادثة." })

    const sub = (args[0] || "").toLowerCase()
    const target = args[1] || ""

    try {
      // تفعيل/تعطيل شرط الموافقة
      if (["تفعيل", "on", "1"].includes(sub)) {
        await react("🔐")
        await call.setApprovalRequired(true)
        return reply({ text: "🔐 *فُعّلت الموافقة:* لن يدخل أحد قبل قبولك." })
      }
      if (["تعطيل", "off", "0"].includes(sub)) {
        await react("🔓")
        await call.setApprovalRequired(false)
        return reply({ text: "🔓 *عُطّلت الموافقة:* يدخل المشاركون مباشرة." })
      }

      // قبول منتظر
      if (["قبول", "admit"].includes(sub)) {
        if (!target) return reply({ text: "❌ *طريقة الاستخدام:* *.انتظار قبول <المعرّف>*" })
        await react("✅")
        await call.admit(target)
        return reply({ text: `✅ *أُذن لـ ${target} بالدخول.*` })
      }

      // رفض منتظر
      if (["رفض", "deny"].includes(sub)) {
        if (!target) return reply({ text: "❌ *طريقة الاستخدام:* *.انتظار رفض <المعرّف>*" })
        await react("🚫")
        await call.deny(target)
        return reply({ text: `🚫 *رُفض ${target}.*` })
      }

      // عرض القائمة
      const room = call.waitingRoom
      const lines = ["🚪 *غرفة الانتظار:*"]
      if (!room) {
        lines.push("> لا توجد بيانات انتظار لهذه المكالمة.")
      } else {
        const list = Array.isArray(room) ? room : room.participants || room.waiting || []
        if (!list.length) lines.push("> لا يوجد منتظرون.")
        else {
          lines.push(`> المنتظرون: *${list.length}*`, "")
          list.forEach((p, i) => lines.push(`*${i + 1}.* ${p.jid || p.id || p}`))
        }
      }
      lines.push(
        "",
        "*الأوامر:*",
        "> *.انتظار تفعيل* · *.انتظار تعطيل*",
        "> *.انتظار قبول <المعرّف>* · *.انتظار رفض <المعرّف>*"
      )
      return reply({ text: lines.join("\n") })
    } catch (e) {
      await react("❌")
      return reply({ text: `❌ خطأ في غرفة الانتظار: ${e?.message || e}` })
    }
  }
}
