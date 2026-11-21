import { channelNames } from "../../Corleone/بث/بث.js"
import streamChannel from "./مكالمة2.js"

// صورة المصدر الذي جاءت منه القنوات (iptv-org) — ترويسة كل رسالة
const SOURCE_IMAGE = "https://avatars.githubusercontent.com/iptv-org"

// ترتيب الأقسام — الأسماء يجب أن تطابق CHANNELS في بث.js حرفياً
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

// آخر عنصر = الجودة الأصلية بلا تحديد
const QUALITIES = ["240p", "360p", "480p", "720p", "1080p", null]
const QUALITY_LABELS = ["240p", "360p", "480p", "720p", "1080p", "الأصلية"]

const PER_PAGE = 2
const MAX_SECTIONS_PAGES = 12
const MAX_GROUP_PAGES = 12
const MAX_CHANNELS = 60

const T = {
  title: "📺 القنوات العربية",
  choose: "اختر طريقة العرض:",
  btnButtons: "🎯 أزرار قابلة للضغط",
  btnDropdown: "📋 أزرار منسدلة",
  pickSection: "اختر القسم:",
  pickChannel: "اختر قناة:",
  pickQuality: "اختر جودة البث:",
  more: "➕ المزيد",
  back: "⬅️ رجوع",
  noMore: "❌ لا توجد قنوات إضافية.",
  stale: "❌ انتهت صلاحية هذه القائمة — أرسل *.قنوات* من جديد.",
  footer: "المصدر: iptv-org"
}

// معرّفات الأزرار تُحمَل في اسم الأمر — لا حالة محفوظة على السيرفر
const idSections = (p) => `قنوات_اقسام_${p}`
const idGroupPage = (g, p) => `قنوات_ازرار_${g}_${p}`
const idQuality = (abs) => `قنوات_جوده_${abs}`
const idPlay = (abs, r) => `قنوات_بث_${abs}_${r}`

const parseSections = (n) => { const m = /^قنوات_اقسام_(\d+)$/.exec(n); return m ? +m[1] : null }
const parseGroupPage = (n) => { const m = /^قنوات_ازرار_(\d+)_(\d+)$/.exec(n); return m ? { g: +m[1], p: +m[2] } : null }
const parseQuality = (n) => { const m = /^قنوات_جوده_(\d+)$/.exec(n); return m ? +m[1] : null }
const parsePlay = (n) => { const m = /^قنوات_بث_(\d+)_(\d+)$/.exec(n); return m ? { abs: +m[1], r: +m[2] } : null }

// أي قناة تُضاف إلى بث.js ولم تُدرج في GROUPS تظهر في قسم «أخرى»
function groupsOf(all) {
  const known = new Set(GROUPS.flatMap((g) => g.names))
  const groups = GROUPS.map((g) => ({ title: g.title, names: g.names.filter((n) => all.includes(n)) }))
  const extra = all.filter((n) => !known.has(n))
  if (extra.length) groups.push({ title: "📻 أخرى", names: extra })
  return groups.filter((g) => g.names.length)
}

// الفهرسة المطلقة تُشتق من ترتيب القنوات نفسه، فتبقى ثابتة بين الرسائل
function indexOf(all) {
  let abs = 0
  return groupsOf(all).map((g) => ({
    title: g.title,
    items: g.names.map((name) => ({ name, abs: abs++ }))
  }))
}

export default {
  name: [
    "قنوات",
    "القنوات",
    "قنوات-قائمه",
    ...Array.from({ length: MAX_SECTIONS_PAGES }, (_, p) => idSections(p)),
    ...Array.from({ length: MAX_SECTIONS_PAGES }, (_, g) =>
      Array.from({ length: MAX_GROUP_PAGES }, (_, p) => idGroupPage(g, p))
    ).flat(),
    ...Array.from({ length: MAX_CHANNELS }, (_, i) => idQuality(i)),
    ...Array.from({ length: MAX_CHANNELS }, (_, i) =>
      Array.from({ length: QUALITIES.length }, (_, r) => idPlay(i, r))
    ).flat()
  ],
  description: "يعرض القنوات العربية بأزرار متسلسلة، ويختار الجودة قبل البثّ",
  category: "مكالمات",
  ownerOnly: true,

  async run(ctx) {
    const { sock, from, msg, cmdName, react, usedPrefix = "." } = ctx
    const name = String(cmdName || "").trim()
    const groups = indexOf(channelNames())
    const flat = groups.flatMap((g) => g.items)

    const send = (payload) =>
      typeof sock?.sendButtonMessage === "function"
        ? sock.sendButtonMessage(from, payload.text, payload.buttons || [], {
            title: T.title,
            footer: T.footer,
            quoted: msg?.message ? msg : null,
            image: SOURCE_IMAGE,
            selectLabel: payload.selectLabel || T.pickChannel,
            sections: payload.sections || []
          })
        : ctx.reply({ text: payload.text })

    // اختيار الجودة → ابدأ البثّ
    const play = parsePlay(name)
    if (play) {
      const entry = flat[play.abs]
      const quality = QUALITIES[play.r]
      if (!entry || quality === undefined) return ctx.reply({ text: T.stale })

      await react("📡")
      return streamChannel.run({
        ...ctx,
        cmdName: "مكالمة2",
        args: [entry.name, ...(quality ? [quality] : [])],
        text: entry.name
      })
    }

    // بعد اختيار القناة: قائمة الجودة
    const qualityFor = parseQuality(name)
    if (qualityFor !== null) {
      const entry = flat[qualityFor]
      if (!entry) return ctx.reply({ text: T.stale })

      await react("🎚️")
      return send({
        text: `📺 ${entry.name}\n${T.pickQuality}`,
        selectLabel: T.pickQuality,
        sections: [
          {
            title: T.pickQuality,
            rows: QUALITY_LABELS.map((label, r) => ({
              title: label,
              description: r === QUALITIES.length - 1 ? "بدون تحديد — أعلى جودة متاحة" : `بثّ بجودة ${label}`,
              id: `${usedPrefix}${idPlay(qualityFor, r)}`
            }))
          }
        ]
      })
    }

    // صفحة قنوات داخل قسم
    const groupPage = parseGroupPage(name)
    if (groupPage) {
      const group = groups[groupPage.g]
      if (!group) return ctx.reply({ text: T.stale })

      const total = Math.max(1, Math.ceil(group.items.length / PER_PAGE))
      const current = Math.min(Math.max(groupPage.p, 0), total - 1)
      const slice = group.items.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE)
      if (!slice.length) return ctx.reply({ text: T.noMore })

      const buttons = slice.map((it) => ({
        text: it.name,
        id: `${usedPrefix}${idQuality(it.abs)}`
      }))
      if (current < total - 1) {
        buttons.push({ text: T.more, id: `${usedPrefix}${idGroupPage(groupPage.g, current + 1)}` })
      } else if (current > 0) {
        buttons.push({ text: T.back, id: `${usedPrefix}${idGroupPage(groupPage.g, current - 1)}` })
      }

      await react("🎯")
      return send({ text: `${group.title}\n${T.pickChannel}\n${current + 1}/${total}`, buttons })
    }

    // القائمة المنسدلة: كل الأقسام والقنوات في نافذة واحدة
    if (name === "قنوات-قائمه") {
      await react("📋")
      return send({
        text: T.pickChannel,
        sections: groups.map((g) => ({
          title: g.title,
          rows: g.items.map((it) => ({
            title: it.name,
            description: `بثّ ${it.name}`,
            id: `${usedPrefix}${idQuality(it.abs)}`
          }))
        }))
      })
    }

    // اختيار القسم بالأزرار
    const sectionsPage = parseSections(name)
    if (sectionsPage !== null) {
      const total = Math.max(1, Math.ceil(groups.length / PER_PAGE))
      const current = Math.min(Math.max(sectionsPage, 0), total - 1)
      const slice = groups.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE)

      const buttons = slice.map((g) => ({
        text: g.title,
        id: `${usedPrefix}${idGroupPage(groups.indexOf(g), 0)}`
      }))
      if (current < total - 1) {
        buttons.push({ text: T.more, id: `${usedPrefix}${idSections(current + 1)}` })
      } else if (current > 0) {
        buttons.push({ text: T.back, id: `${usedPrefix}${idSections(current - 1)}` })
      }

      await react("📂")
      return send({ text: `${T.pickSection}\n${current + 1}/${total}`, buttons })
    }

    // الجذر: زرّان مثل .انطق
    await react("📺")
    return send({
      text: T.choose,
      buttons: [
        { text: T.btnButtons, id: `${usedPrefix}${idSections(0)}` },
        { text: T.btnDropdown, id: `${usedPrefix}قنوات-قائمه` }
      ]
    })
  }
}
