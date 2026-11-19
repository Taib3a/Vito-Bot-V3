import { channelNames } from "../../Corleone/بث/بث.js"

// ترتيب الأقسام في القائمة المنسدلة — الأسماء يجب أن تطابق قنوات.js حرفياً
const GROUPS = [
  {
    title: "📰 إخبارية",
    names: [
      "الجزيرة", "الجزيرة 2", "الجزيرة مباشر", "الجزيرة مباشر 24", "الجزيرة مباشر 2",
      "العربية للأعمال", "العربية برامج", "الإخبارية السعودية", "الحدث", "العربي",
      "العربي 2", "الغد", "الجديد", "المصرية", "المغربية", "المسار", "المعارف",
      "العالم اليوم", "AL24", "النجاح", "القمر"
    ]
  },
  { title: "🇮🇶 عراقية", names: ["العراقية", "العراقية الإخبارية", "العراقية الرياضية"] },
  { title: "🕌 خليجية", names: ["السعودية", "السعودية الآن", "عجمان", "الحياة"] },
  { title: "📖 قرآنية", names: ["القرآن الكريم", "إذاعة القرآن"] },
  { title: "🎬 ترفيه", names: ["أفلام", "أغاني أغاني", "2M"] }
]

const FEATURED = ["الجزيرة", "القرآن الكريم", "العربية للأعمال"]

export default {
  name: ["قنوات", "القنوات"],
  description: "يعرض القنوات العربية المتاحة بأزرار جاهزة لبدء البثّ",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, from, msg, reply, args }) {
    const all = channelNames()
    if (!all.length) return reply({ text: "❌ لا توجد قنوات متاحة." })

    const sections = GROUPS.map((g) => ({
      title: g.title,
      rows: g.names
        .filter((n) => all.includes(n))
        .map((n) => ({ title: n, description: `بثّ ${n}`, id: `.مكالمة2 ${n}` }))
    })).filter((s) => s.rows.length)

    // القائمة النصية: كل قناة تحت قسمها
    const listing = GROUPS.map((g) => {
      const names = g.names.filter((n) => all.includes(n))
      return names.length ? `*${g.title}*\n` + names.map((n) => `> ${n}`).join("\n") : ""
    })
      .filter(Boolean)
      .join("\n\n")

    const text =
      `📺 *القنوات المتاحة (${all.length})*\n\n` +
      listing +
      `\n\n💡 اضغط زراً سريعاً أو افتح *كل القنوات* من القائمة.`

    // واتساب يعرض 3 أزرار فقط — الباقي في القائمة المنسدلة
    const buttons = FEATURED.filter((n) => all.includes(n)).map((n) => ({
      text: n,
      id: `.مكالمة2 ${n}`
    }))

    if (typeof sock?.sendButtonMessage === "function") {
      try {
        return await sock.sendButtonMessage(from, text, buttons, {
          title: "📺 القنوات العربية",
          footer: "اضغط قناة للبثّ · القائمة فيها كل الأقسام",
          quoted: msg,
          sections
        })
      } catch {
        // فشل إرسال الأزرار لا يمنع إرسال النص
      }
    }

    return reply({
      text: text + `\n\n*للبثّ مباشرة:*\n` + buttons.map((b) => `> ${b.text} → ${b.id}`).join("\n")
    })
  }
}
