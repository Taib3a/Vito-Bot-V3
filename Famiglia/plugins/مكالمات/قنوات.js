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

// أي قناة تُضاف إلى قنوات.js ولم تُدرج في GROUPS تظهر في قسم «أخرى»
function unlisted(all) {
  const known = new Set(GROUPS.flatMap((g) => g.names))
  return all.filter((n) => !known.has(n))
}

function sectionsFor(all, prefix, filter) {
  const matches = (n) => !filter || n.toLowerCase().includes(filter)

  const sections = GROUPS.map((g) => ({
    title: g.title,
    rows: g.names
      .filter((n) => all.includes(n) && matches(n))
      .map((n) => ({ title: n, description: `بثّ ${n}`, id: `${prefix}مكالمة2 ${n}` }))
  }))

  const extra = unlisted(all).filter(matches)
  if (extra.length) {
    sections.push({
      title: "📻 أخرى",
      rows: extra.map((n) => ({ title: n, description: `بثّ ${n}`, id: `${prefix}مكالمة2 ${n}` }))
    })
  }

  return sections.filter((s) => s.rows.length)
}

export default {
  name: ["قنوات", "القنوات"],
  description: "يعرض القنوات العربية المتاحة بأزرار جاهزة لبدء البثّ",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, from, msg, reply, args, usedPrefix = "." }) {
    const all = channelNames()
    if (!all.length) return reply({ text: "❌ لا توجد قنوات متاحة." })

    const filter = String(args.join(" ") || "").trim().toLowerCase()
    const sections = sectionsFor(all, usedPrefix, filter)
    const shown = sections.reduce((n, s) => n + s.rows.length, 0)

    if (!shown) {
      return reply({
        text: `🔍 *لا قناة تطابق:* ${args.join(" ")}\n> اكتب *${usedPrefix}قنوات* لعرض كل القنوات.`
      })
    }

    const summary = sections.map((s) => `> ${s.title} — ${s.rows.length}`).join("\n")
    const text =
      `📺 *القنوات المتاحة (${shown}${filter ? ` من ${all.length}` : ""})*\n\n` +
      summary +
      `\n\n💡 افتح القائمة لاختيار قناة، أو اكتب:\n` +
      `> *${usedPrefix}مكالمة2 <اسم القناة>*\n` +
      `> *${usedPrefix}قنوات <كلمة>* للبحث`

    // واتساب يعرض 3 أزرار فقط — الباقي في القائمة المنسدلة
    const buttons = FEATURED
      .filter((n) => all.includes(n) && (!filter || n.toLowerCase().includes(filter)))
      .map((n) => ({ text: n, id: `${usedPrefix}مكالمة2 ${n}` }))

    if (typeof sock?.sendButtonMessage === "function") {
      try {
        return await sock.sendButtonMessage(from, text, buttons, {
          title: "📺 القنوات العربية",
          footer: "اضغط قناة للبثّ · القائمة فيها كل الأقسام",
          quoted: msg?.message ? msg : null,
          selectLabel: "اختر قناة",
          sections
        })
      } catch {
        // فشل إرسال الأزرار لا يمنع إرسال النص
      }
    }

    const listing = sections
      .map((s) => `*${s.title}*\n` + s.rows.map((r) => `> ${r.title}`).join("\n"))
      .join("\n\n")

    return reply({ text: `${text}\n\n${listing}` })
  }
}
