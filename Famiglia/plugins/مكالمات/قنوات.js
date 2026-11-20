import { channelNames } from "../../Corleone/بث/بث.js"
import streamChannel from "./مكالمة2.js"

// صورة المصدر الذي جاءت منه القنوات (iptv-org) — ترويسة كل رسالة
const SOURCE_IMAGE = "https://avatars.githubusercontent.com/iptv-org"

// ترتيب الأقسام — الأسماء يجب أن تطابق قنوات.js حرفياً
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

const RESOLUTION = /^(240|360|480|720|1080)p?$/i
const PER_PAGE = 2
// أوسع قسم فيه 21 قناة → 11 صفحة، والجولة تكفي 12
const PAGES = 12

const T = {
  title: "📺 القنوات العربية",
  choose: "اختر طريقة العرض:",
  btnButtons: "🎯 أزرار قابلة للضغط",
  btnDropdown: "📋 أزرار منسدلة",
  pickSection: "اختر القسم:",
  pickChannel: "اختر قناة لتبدأ بثّها:",
  pickLabel: "اختر قناة",
  more: "➕ المزيد",
  back: "⬅️ رجوع",
  noMore: "❌ لا توجد قنوات إضافية.",
  stale: "❌ انتهت صلاحية هذه القائمة — أرسل *.قنوات* من جديد.",
  footer: "المصدر: iptv-org"
}

// معرّفات الأزرار تُحمَل في اسم الأمر — لا حالة محفوظة على السيرفر
const chanId = (g, page, slot) => `قنوات_تشغيل_${g}_${page}_${slot}`
const pageId = (g, page) => `قنوات_ازرار_${g}_${page}`

const parseChan = (n) => {
  const m = /^قنوات_تشغيل_(\d+)_(\d+)_(\d+)$/.exec(n)
  return m ? { g: +m[1], page: +m[2], slot: +m[3] } : null
}
const parsePage = (n) => {
  const m = /^قنوات_ازرار_(\d+)_(\d+)$/.exec(n)
  return m ? { g: +m[1], page: +m[2] } : null
}
const parseSections = (n) => {
  const m = /^قنوات_اقسام_(\d+)$/.exec(n)
  return m ? Number(m[1]) : null
}

// أي قناة تُضاف إلى قنوات.js ولم تُدرج في GROUPS تظهر في قسم «أخرى»
function groupsOf(all) {
  const known = new Set(GROUPS.flatMap((g) => g.names))
  const groups = GROUPS.map((g) => ({ title: g.title, names: g.names.filter((n) => all.includes(n)) }))
  const extra = all.filter((n) => !known.has(n))
  if (extra.length) groups.push({ title: "📻 أخرى", names: extra })
  return groups.filter((g) => g.names.length)
}

export default {
  name: [
    "قنوات",
    "القنوات",
    "قنوات-قائمه",
    ...Array.from({ length: PAGES }, (_, i) => `قنوات_اقسام_${i}`),
    ...Array.from({ length: PAGES }, (_, g) =>
      Array.from({ length: PAGES }, (_, p) =>
        Array.from({ length: PER_PAGE }, (_, s) => chanId(g, p, s))
      )
    ).flat(2),
    ...Array.from({ length: PAGES }, (_, g) =>
      Array.from({ length: PAGES }, (_, p) => pageId(g, p))
    ).flat()
  ],
  description: "يعرض القنوات العربية بأزرار متسلسلة ويبدأ بثّها في مكالمة",
  category: "مكالمات",
  ownerOnly: true,

  async run(ctx) {
    const { sock, from, msg, cmdName, args, react, usedPrefix = "." } = ctx
    const name = String(cmdName || "").trim()
    const groups = groupsOf(channelNames())

    const send = (payload) =>
      typeof sock?.sendButtonMessage === "function"
        ? sock.sendButtonMessage(from, payload.text, payload.buttons || [], {
            title: T.title,
            footer: T.footer,
            quoted: msg?.message ? msg : null,
            image: SOURCE_IMAGE,
            selectLabel: T.pickLabel,
            sections: payload.sections || []
          })
        : ctx.reply({ text: payload.text })

    // ضغط قناة → شغّلها فوراً
    const picked = parseChan(name)
    if (picked) {
      const channel = groups[picked.g]?.names[picked.page * PER_PAGE + picked.slot]
      if (!channel) return ctx.reply({ text: T.stale })

      await react("📡")
      const resolutionArg = args.find((a) => RESOLUTION.test(a))
      return streamChannel.run({
        ...ctx,
        cmdName: "مكالمة2",
        args: [channel, ...(resolutionArg ? [resolutionArg] : [])],
        text: channel
      })
    }

    // اختيار القسم بالأزرار
    const sectionPage = parseSections(name)
    if (sectionPage !== null) {
      const perPage = 2
      const total = Math.max(1, Math.ceil(groups.length / perPage))
      const current = Math.min(Math.max(sectionPage, 0), total - 1)
      const slice = groups.slice(current * perPage, current * perPage + perPage)

      const buttons = slice.map((g, slot) => ({
        text: g.title,
        id: `${usedPrefix}${pageId(current * perPage + slot, 0)}`
      }))
      if (current < total - 1) {
        buttons.push({ text: T.more, id: `${usedPrefix}قنوات_اقسام_${current + 1}` })
      } else if (current > 0) {
        buttons.push({ text: T.back, id: `${usedPrefix}قنوات_اقسام_${current - 1}` })
      }

      await react("📂")
      return send({ text: `${T.pickSection}\n${current + 1}/${total}`, buttons })
    }

    // صفحة قنوات داخل قسم
    const page = parsePage(name)
    if (page) {
      const group = groups[page.g]
      if (!group) return ctx.reply({ text: T.stale })

      const total = Math.max(1, Math.ceil(group.names.length / PER_PAGE))
      const current = Math.min(Math.max(page.page, 0), total - 1)
      const start = current * PER_PAGE
      const slice = group.names.slice(start, start + PER_PAGE)
      if (!slice.length) return ctx.reply({ text: T.noMore })

      const buttons = slice.map((ch, slot) => ({
        text: ch,
        id: `${usedPrefix}${chanId(page.g, current, slot)}`
      }))
      if (current < total - 1) {
        buttons.push({ text: T.more, id: `${usedPrefix}${pageId(page.g, current + 1)}` })
      } else if (current > 0) {
        buttons.push({ text: T.back, id: `${usedPrefix}${pageId(page.g, current - 1)}` })
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
          rows: g.names.map((ch) => ({ title: ch, description: `بثّ ${ch}`, id: `${usedPrefix}مكالمة2 ${ch}` }))
        }))
      })
    }

    // الجذر: زرّان مثل .انطق
    await react("📺")
    return send({
      text: T.choose,
      buttons: [
        { text: T.btnButtons, id: `${usedPrefix}قنوات_اقسام_0` },
        { text: T.btnDropdown, id: `${usedPrefix}قنوات-قائمه` }
      ]
    })
  }
}
