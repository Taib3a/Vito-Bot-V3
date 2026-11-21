import streamChannel from "./مكالمة2.js"
import { listLive } from "../../Corleone/بث/مباشر.js"
import { COUNTRIES_TREE, channelNames } from "../../Corleone/بث/بث.js"

const SOURCE_IMAGE = "https://avatars.githubusercontent.com/iptv-org"

const QUALITIES = ["240p", "360p", "480p", "720p", "1080p", null]
const QUALITY_LABELS = ["240p", "360p", "480p", "720p", "1080p", "الأصلية"]

// معرّف الزر يعود للبوت كنص أمر، فلا بد أن يكون اسماً مسجّلاً سلفاً.
// لذلك لا نُسجّل اسمأ لكل قناة (6824 قناة = عشرات آلاف الأسماء)، بل
// «خانات» مرقّمة ثابتة (0..8) ودور كل خانة محفوظ في حالة المحادثة.
const SLOTS = 9
const MAX_LIVE = 20
const FLOW_TTL = 10 * 60_000

const T = {
  title: "📺 القنوات",
  country: "🌍 اختر الدولة:",
  category: "📂 اختر التصنيف:",
  channel: "📺 اختر القناة:",
  quality: "🎚️ اختر جودة البث:",
  btnLive: "📡 البث المباشر الآن",
  liveTitle: "📡 البثوث الجارية الآن:",
  liveNone: "لا يوجد بثّ جارٍ حالياً.",
  back: "⬅️ القائمة",
  stale: "❌ انتهت صلاحية القائمة — أرسل *.قنوات* من جديد.",
  empty: "❌ لا يوجد المزيد.",
  footer: "المصدر: iptv-org"
}

// حالة التدفّق لكل محادثة: مستوى واحد نشِط وصفحته واختياراته.
const flows = new Map()

const getFlow = (jid) => {
  const f = flows.get(jid)
  if (!f || f.exp < Date.now()) {
    flows.delete(jid)
    return null
  }
  return f
}

const setFlow = (jid, data) => {
  flows.set(jid, { ...data, exp: Date.now() + FLOW_TTL })
  return flows.get(jid)
}

setInterval(() => {
  const now = Date.now()
  for (const [k, f] of flows) if (f.exp < now) flows.delete(k)
}, 60_000).unref?.()

const LEVELS = ["د", "ص", "ق"]
const PREV = "س"
const NEXT = "ت"

const idRow = (lv, i) => `قنوات_${lv}_${i}`
const idPrev = (lv) => `قنوات_${lv}_${PREV}`
const idNext = (lv) => `قنوات_${lv}_${NEXT}`
const idQuality = (i) => `قنوات_ج_${i}`
const idLive = () => "قنوات_مباشر"
const idLiveLink = (i) => `قنوات_رابط_${i}`

// يطابق اسم الأمر: خانة رقم أو سهم تنقّل
function parseLevel(name) {
  for (const lv of LEVELS) {
    const m = new RegExp(`^قنوات_${lv}_([0-9]|${PREV}|${NEXT})$`).exec(name)
    if (m) return { lv, arg: m[1] }
  }
  return null
}

const parseQuality = (name) => {
  const m = /^قنوات_ج_(\d)$/.exec(name)
  return m ? +m[1] : null
}

const parseLiveLink = (name) => {
  const m = /^قنوات_رابط_(\d+)$/.exec(name)
  return m ? +m[1] : null
}

const stripIcon = (s) => String(s).replace(/^[\p{Emoji}\uFE0F\s]+/u, "").trim()
const clip = (s, n) => {
  const v = String(s)
  return v.length > n ? `${v.slice(0, n - 1)}…` : v
}

// صفحة من قائمة + رقم الصفحة ومجموعها
function paginate(items, p) {
  const pages = Math.max(1, Math.ceil(items.length / SLOTS))
  const cur = Math.min(Math.max(0, p | 0), pages - 1)
  return { slice: items.slice(cur * SLOTS, cur * SLOTS + SLOTS), cur, pages }
}

export default {
  name: [
    "قنوات",
    "القنوات",
    idLive(),
    ...Array.from({ length: MAX_LIVE }, (_, i) => idLiveLink(i)),
    ...LEVELS.flatMap((lv) => [
      ...Array.from({ length: SLOTS }, (_, i) => idRow(lv, i)),
      idPrev(lv),
      idNext(lv)
    ]),
    ...Array.from({ length: QUALITIES.length }, (_, i) => idQuality(i))
  ],
  description: "قنوات العالم بأربعة مستويات: دولة ← تصنيف ← قناة ← جودة",
  category: "مكالمات",
  ownerOnly: true,

  async run(ctx) {
    const { sock, from, msg, cmdName, react, usedPrefix = ".", text } = ctx
    const name = String(cmdName || "").trim()
    const reply = (t) => ctx.reply({ text: t })

    const send = (payload) =>
      typeof sock?.sendButtonMessage === "function"
        ? sock.sendButtonMessage(from, payload.text, payload.buttons || [], {
            title: T.title,
            footer: T.footer,
            quoted: msg?.message ? msg : null,
            image: SOURCE_IMAGE,
            selectLabel: payload.selectLabel || T.channel,
            sections: payload.sections || []
          })
        : ctx.reply({ text: payload.text })

    // ═══ المستوى 4: الجودة ═══
    const q = parseQuality(name)
    if (q !== null) {
      const f = getFlow(from)
      const quality = QUALITIES[q]
      if (!f?.channel || quality === undefined) return reply(T.stale)

      await react("📡")
      return streamChannel.run({
        ...ctx,
        cmdName: "مكالمة2",
        args: [f.channel.name, ...(quality ? [quality] : [])],
        text: f.channel.name
      })
    }

    // ═══ المستويات 1-3 ═══
    const hit = parseLevel(name)
    if (hit) {
      const f = getFlow(from)
      if (!f) return reply(T.stale)

      // سهم التنقّل: نفس المستوى بصفحة مجاورة
      if (hit.arg === PREV || hit.arg === NEXT) {
        const next = { ...f, page: (f.page || 0) + (hit.arg === NEXT ? 1 : -1) }
        setFlow(from, next)
        return render(ctx, send, reply, usedPrefix, next)
      }

      const i = +hit.arg

      if (hit.lv === "د") {
        const c = paginate(COUNTRIES_TREE, f.page || 0).slice[i]
        if (!c) return reply(T.empty)
        return render(ctx, send, reply, usedPrefix, setFlow(from, { level: "ص", page: 0, country: c }))
      }

      if (hit.lv === "ص") {
        const c = f.country?.categories[paginate(f.country.categories, f.page || 0).cur * SLOTS + i]
        if (!c) return reply(T.empty)
        return render(ctx, send, reply, usedPrefix, setFlow(from, { level: "ق", page: 0, country: f.country, category: c }))
      }

      // المستوى 3: اختيار قناة → اعرض الجودة
      const ch = paginate(f.category?.channels || [], f.page || 0).slice[i]
      if (!ch) return reply(T.empty)

      await react("🎚️")
      return send({
        text: `📺 *${ch.name}*\n${ch.quality ? `> الجودة الأصلية: ${ch.quality}\n` : ""}${T.quality}`,
        selectLabel: T.quality,
        sections: [
          {
            title: T.quality,
            rows: QUALITY_LABELS.map((label, r) => ({
              title: label,
              description: r === QUALITIES.length - 1 ? "بدون تحديد — أعلى جودة متاحة" : `بثّ بجودة ${label}`,
              id: `${usedPrefix}${idQuality(r)}`
            }))
          }
        ]
      }).then(() => setFlow(from, { ...f, channel: ch }))
    }

    // ═══ البثوث الجارية ═══
    const liveLink = parseLiveLink(name)
    if (liveLink !== null) {
      const it = listLive()[liveLink]
      const link = (() => { try { return it?.call?.link } catch { return null } })()
      if (!link) return reply("❌ *انتهى هذا البثّ أو لم يُجهَّز رابطه بعد.*")
      return reply(link)
    }

    if (name === idLive()) {
      const items = listLive().slice(0, MAX_LIVE)
      await react("📡")
      if (!items.length) return send({ text: T.liveNone, buttons: [{ text: T.back, id: `${usedPrefix}قنوات` }] })

      return send({
        text: T.liveTitle,
        selectLabel: T.liveTitle,
        sections: [
          {
            title: T.liveTitle,
            rows: items.map((it, i) => ({
              title: clip(`${it.source || "بثّ"}${it.quality ? ` · ${it.quality}` : ""}`, 60),
              description: "أرسل الرابط وحده",
              id: `${usedPrefix}${idLiveLink(i)}`
            }))
          }
        ]
      })
    }

    // ═══ البحث المباشر: .قنوات <اسم> ═══
    const query = String(text || "").trim()
    if (query) {
      const hits = channelNames().filter((n) => n.toLowerCase().includes(query.toLowerCase())).slice(0, SLOTS)
      if (!hits.length) return reply(`❌ لا توجد قناة تطابق «${query}»`)

      await react("🔍")
      const chans = hits.map((n) => ({ name: n, url: null, quality: null }))
      setFlow(from, { level: "ق", page: 0, search: query, category: { title: `🔍 ${query}`, channels: chans } })
      return send({
        text: `🔍 نتائج «${query}»`,
        selectLabel: T.channel,
        sections: [
          {
            title: T.channel,
            rows: chans.map((ch, i) => ({
              title: clip(ch.name, 60),
              description: "اضغط لعرض الجودات",
              id: `${usedPrefix}${idRow("ق", i)}`
            }))
          }
        ]
      })
    }

    // ═══ الجذر: الدول ═══
    await react("🌍")
    return render(ctx, send, reply, usedPrefix, setFlow(from, { level: "د", page: 0 }))
  }
}

// يرسم المستوى النشِط من حالة التدفّق
async function render(ctx, send, reply, usedPrefix, f) {
  if (f.level === "د") {
    const { slice, cur, pages } = paginate(COUNTRIES_TREE, f.page || 0)
    const total = COUNTRIES_TREE.reduce(
      (n, c) => n + c.categories.reduce((m, k) => m + k.channels.length, 0),
      0
    )

    return send({
      text: `${T.country}\n> ${total} قناة في ${COUNTRIES_TREE.length} دولة · صفحة ${cur + 1}/${pages}`,
      selectLabel: T.country,
      buttons: nav(usedPrefix, "د", cur, pages),
      sections: [
        {
          title: T.country,
          rows: slice.map((c, i) => {
            const n = c.categories.reduce((m, x) => m + x.channels.length, 0)
            return {
              title: clip(c.title, 60),
              description: `${n} قناة · ${c.categories.length} تصنيف`,
              id: `${usedPrefix}${idRow("د", i)}`
            }
          })
        }
      ]
    })
  }

  if (f.level === "ص") {
    const cats = f.country?.categories || []
    const { slice, cur, pages } = paginate(cats, f.page || 0)
    if (!slice.length) return reply(T.empty)

    return send({
      text: `${f.country.title}\n${T.category}\n> صفحة ${cur + 1}/${pages}`,
      selectLabel: T.category,
      buttons: nav(usedPrefix, "ص", cur, pages),
      sections: [
        {
          title: T.category,
          rows: slice.map((c, i) => ({
            title: clip(stripIcon(c.title), 60),
            description: `${c.channels.length} قناة`,
            id: `${usedPrefix}${idRow("ص", i)}`
          }))
        }
      ]
    })
  }

  // المستوى 3: القنوات
  const chans = f.category?.channels || []
  const { slice, cur, pages } = paginate(chans, f.page || 0)
  if (!slice.length) return reply(T.empty)

  return send({
    text: `${f.country?.title ? `${f.country.title}\n` : ""}*${stripIcon(f.category.title)}*\n${T.channel}\n> ${chans.length} قناة · صفحة ${cur + 1}/${pages}`,
    selectLabel: T.channel,
    buttons: nav(usedPrefix, "ق", cur, pages),
    sections: [
      {
        title: T.channel,
        rows: slice.map((ch, i) => ({
          title: clip(ch.name, 60),
          description: ch.quality ? `جودة ${ch.quality}` : "بثّ مباشر",
          id: `${usedPrefix}${idRow("ق", i)}`
        }))
      }
    ]
  })
}

// أزرار التنقّل: واتساب يسمح بثلاثة، فنُظهر ما يلزم فقط
function nav(usedPrefix, lv, cur, pages) {
  const out = []
  if (cur > 0) out.push({ text: "⬅️ السابق", id: `${usedPrefix}${idPrev(lv)}` })
  if (cur < pages - 1) out.push({ text: "التالي ➡️", id: `${usedPrefix}${idNext(lv)}` })
  if (lv === "د") out.push({ text: T.btnLive, id: `${usedPrefix}${idLive()}` })
  return out.slice(0, 3)
}
