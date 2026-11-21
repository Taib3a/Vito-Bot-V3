import { callsOf, removeCall } from "../../اضافات/محركات.js"
import { getLiveByCall, removeLive } from "../../Corleone/بث/مباشر.js"

// يستخرج رمز الغرفة من رابط واتساب للمكالمة
function tokenOf(input) {
  const s = String(input || "").trim()
  const m = s.match(/call\.whatsapp\.com\/([A-Za-z0-9_-]+)/i)
  if (m) return m[1]
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : null
}

function linkOf(call) {
  try {
    return call?.link || null
  } catch {
    return null
  }
}

export default {
  name: ["مكالمة-اغلاق", "اغلاق-مكالمة"],
  description: "يُغلق بثاً أو غرفة مكالمة بالرابط الذي أُنشئ سابقاً",
  category: "مكالمات",
  ownerOnly: true,

  async run({ from, reply, react, args }) {
    const calls = callsOf(from)

    if (calls.length === 0) {
      return reply({ text: "❌ *لا يوجد بث جارٍ في هذه المحادثة.*" })
    }

    const raw = args.find((a) => /call\.whatsapp\.com/i.test(a)) || args[0]

    if (!raw) {
      const list = calls
        .map((c, i) => {
          const l = linkOf(c)
          return `> ${i + 1}. ${l || "(بلا رابط)"}`
        })
        .join("\n")
      return reply({
        text:
          "🔴 *طريقة الاستخدام:*\n" +
          "> *.مكالمة-اغلاق <الرابط>* — لإغلاق بث محدد\n" +
          "> *.مكالمة-اغلاق* — لإغلاق كل البثوث هنا\n\n" +
          `📋 *البثوث الجارية (${calls.length}):*\n${list}`
      })
    }

    const token = tokenOf(raw)
    if (!token) {
      return reply({ text: "❌ *رابط غير صالح.*\n> أرسل رابط الغرفة كما ظهر عند إنشائها." })
    }

    const target = calls.find((c) => {
      const l = linkOf(c)
      return l && l.includes(token)
    })

    if (!target) {
      return reply({ text: "❌ *لا يوجد بث بهذا الرابط في هذه المحادثة.*\n> استخدم *.مكالمة-اغلاق* لعرض القائمة." })
    }

    await react("🔴")
    try {
      // نوقف إعادة التشغيل أولاً، وإلا أعاد بناء الغرفة فور إنهائها
      const record = getLiveByCall(target)
      if (typeof record?.stop === "function") record.stop()
      await target.hangup()
      removeCall(from, target)
      if (record) removeLive(record.id)
      return reply({ text: "🔴 *أُغلق البث بنجاح.*" })
    } catch (e) {
      removeCall(from, target)
      return reply({ text: `⚠️ *أُغلق البث مع خطأ:* ${e?.message || e}` })
    }
  }
}
