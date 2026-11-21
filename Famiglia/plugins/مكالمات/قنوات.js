import streamChannel from "./مكالمة2.js"
import { removeCall } from "../../اضافات/محركات.js"
import { listLive, removeLive } from "../../Corleone/بث/مباشر.js"
import { COUNTRIES_TREE, channelNames } from "../../Corleone/بث/بث.js"

const SOURCE_IMAGE = "https://avatars.githubusercontent.com/iptv-org"

const QUALITIES = ["240p", "360p", "480p", "720p", "1080p", null]
const QUALITY_LABELS = ["240p", "360p", "480p", "720p", "1080p", "الأصلية"]

// معرّف الزر يعود للبوت كنص أمر، فلا بد أن يكون اسماً مسجّلاً سلفاً.
// لذلك لا نُسجّل اسماً لكل قناة (6824 قناة = عشرات آلاف الأسماء)، بل
// «خانات» مرقّمة ثابتة (0..6) ودور كل خانة محفوظ في حالة المحادثة.
// القائمة المنسدلة تتحمّل عشرة صفوف: سبعة عناصر + السابق/التالي + الرجوع.
const SLOTS = 7
const SLOTS_BTN = 2
const MAX_LIVE = 20
const FLOW_TTL = 10 * 60_000

const T = {
  title: "📺 القنوات",
  mode: "اختر طريقة عرض القنوات:",
  btnList: "📋 أزرار منسدلة",
  btnButtons: "🎯 أزرار قابلة للضغط",
  group: "🗂️ اختر التجميع:",
  byCountry: "🌍 حسب الدولة",
  byCategory: "📂 حسب التصنيف",
  country: "🌍 اختر الدولة:",
  category: "📂 اختر التصنيف:",
  channel: "📺 اختر القناة:",
  quality: "🎚️ اختر جودة البث:",
  btnLive: "📡 البث المباشر الآن",
  liveTitle: "📡 البثوث الجارية الآن:",
  liveNone: "لا يوجد بثّ جارٍ حالياً.",
  livePick: "📡 اختر البثّ:",
  liveActions: "ماذا تريد أن تفعل بهذا البثّ؟",
  liveSend: "🔗 إرسال الرابط",
  liveStop: "⏹ إيقاف البث",
  back: "⬅️ رجوع",
  stale: "❌ انتهت صلاحية القائمة — أرسل *.قنوات* من جديد.",
  empty: "❌ لا يوجد المزيد.",
  footer: "𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹"
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

// المستويات: و=طريقة العرض، مج=التجميع، د=الدول، ص=التصنيفات، ق=القنوات
const LEVELS = ["د", "ص", "ق"]
const PREV = "س"
const NEXT = "ت"

const idRow = (lv, i) => `قنوات_${lv}_${i}`
const idPrev = (lv) => `قنوات_${lv}_${PREV}`
const idNext = (lv) => `قنوات_${lv}_${NEXT}`
const idQuality = (i) => `قنوات_ج_${i}`
const idQPrev = () => "قنوات_جس"
const idQNext = () => "قنوات_جت"
const idMode = (m) => `قنوات_و_${m}`
const idGroup = (g) => `قنوات_مج_${g}`
const idLive = () => "قنوات_مباشر"
const idLivePick = (i) => `قنوات_بث_${i}`
const idLiveLink = (i) => `قنوات_رابط_${i}`
const idLiveStop = (i) => `قنوات_ايقاف_${i}`
const idBack = () => "قنوات_رجوع"

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

const parseLiveStop = (name) => {
  const m = /^قنوات_ايقاف_(\d+)$/.exec(name)
  return m ? +m[1] : null
}

const parseLivePick = (name) => {
  const m = /^قنوات_بث_(\d+)$/.exec(name)
  return m ? +m[1] : null
}

const stripIcon = (s) => String(s).replace(/^[\p{Emoji}\uFE0F\s]+/u, "").trim()
const clip = (s, n) => {
  const v = String(s)
  return v.length > n ? `${v.slice(0, n - 1)}…` : v
}

// حجم الصفحة يتبع وضع العرض: الأزرار تعرض عنصرين، والمنسدلة تسعة.
// لو استخدم الاثنان حجماً واحداً لصارت صفحات الأزرار فارغة أو بلا «المزيد».
const pageSize = (mode) => (mode === "ز" ? SLOTS_BTN : SLOTS)

// صفحة من قائمة + رقم الصفحة ومجموعها
function paginate(items, p, size = SLOTS) {
  const pages = Math.max(1, Math.ceil(items.length / size))
  const cur = Math.min(Math.max(0, p | 0), pages - 1)
  return { slice: items.slice(cur * size, cur * size + size), cur, pages }
}

// كل قنوات تصنيف واحد عبر جميع الدول — لتصفّح التصنيف بلا تحديد دولة
function channelsOfCategory(title) {
  const out = []
  for (const c of COUNTRIES_TREE) {
    for (const k of c.categories) {
      if (k.title !== title) continue
      for (const ch of k.channels) out.push({ ...ch, country: c.title })
    }
  }
  return out
}

// تصنيفات العالم الفريدة مرتّبة بحسب عدد القنوات. `count` رقم للعرض،
// و`channels` مصفوفة فارغة كي يعمل الرسم الموحّد بلا معالجة خاصة.
function globalCategories() {
  const acc = new Map()
  for (const c of COUNTRIES_TREE) {
    for (const k of c.categories) {
      const e = acc.get(k.title) || { title: k.title, count: 0, channels: [] }
      e.count += k.channels.length
      acc.set(k.title, e)
    }
  }
  return [...acc.values()].sort((a, b) => b.count - a.count)
}

const totalChannels = () =>
  COUNTRIES_TREE.reduce((n, c) => n + c.categories.reduce((m, k) => m + k.channels.length, 0), 0)

// عناصر المستوى النشِط — لحساب عدد الصفحات عند التنقّل
function levelItems(f) {
  if (f.level === "د") return COUNTRIES_TREE
  if (f.level === "ص") return f.scope === "ص" ? globalCategories() : (f.country?.categories || [])
  return f.category?.channels || []
}

export default {
  name: [
    "قنوات",
    "القنوات",
    idBack(),
    idMode("ز"),
    idMode("ق"),
    idGroup("د"),
    idGroup("ص"),
    idLive(),
    ...Array.from({ length: MAX_LIVE }, (_, i) => idLivePick(i)),
    ...Array.from({ length: MAX_LIVE }, (_, i) => idLiveLink(i)),
    ...Array.from({ length: MAX_LIVE }, (_, i) => idLiveStop(i)),
    ...LEVELS.flatMap((lv) => [
      ...Array.from({ length: SLOTS }, (_, i) => idRow(lv, i)),
      idPrev(lv),
      idNext(lv)
    ]),
    idQPrev(),
    idQNext(),
    ...Array.from({ length: QUALITIES.length }, (_, i) => idQuality(i))
  ],
  description: "قنوات العالم: طريقة عرض ← تجميع (دولة/تصنيف) ← قناة ← جودة",
  category: "مكالمات",
  // متاح للجميع: التصفّح والبث في محادثتهم. إدارة بثوث الآخرين تبقى للمالك.
  ownerOnly: false,

  async run(ctx) {
    const { sock, from, msg, cmdName, react, usedPrefix = ".", text, isOwner } = ctx
    const name = String(cmdName || "").trim()
    const reply = (t) => ctx.reply(typeof t === "string" ? { text: t } : t)

    // غير المالك يرى بثوث محادثته فقط، فلا يطّلع على بثوث الآخرين ولا يوقفها.
    const liveFor = () => {
      const all = listLive()
      return isOwner ? all : all.filter((rec) => rec.chat === from)
    }

    const send = async (payload) => {
      if (typeof sock?.sendButtonMessage !== "function") return ctx.reply({ text: payload.text })
      try {
        const extra = {
          title: T.title,
          footer: T.footer,
          quoted: msg?.message ? msg : null,
          image: SOURCE_IMAGE
        }
        if (payload.sections?.length) {
          extra.selectLabel = payload.selectLabel || T.channel
          extra.sections = payload.sections
        }
        return await sock.sendButtonMessage(from, payload.text, payload.buttons || [], extra)
      } catch {
        // الأزرار قد تفشل على بعض الحسابات — لا نترك المستخدم بلا رد
        return ctx.reply({ text: payload.text })
      }
    }

    const draw = (f) => render({ f, send, reply, usedPrefix })

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

    // ═══ طريقة العرض ═══
    if (name === idMode("ز") || name === idMode("ق")) {
      const mode = name === idMode("ز") ? "ز" : "ق"
      return draw(setFlow(from, { level: "مج", mode, page: 0 }))
    }

    // ═══ التجميع: دولة أو تصنيف ═══
    if (name === idGroup("د")) {
      return draw(setFlow(from, { level: "د", scope: "د", mode: getFlow(from)?.mode || "ق", page: 0 }))
    }
    if (name === idGroup("ص")) {
      return draw(setFlow(from, { level: "ص", scope: "ص", mode: getFlow(from)?.mode || "ق", page: 0 }))
    }

    // ═══ الرجوع خطوة ═══
    if (name === idBack()) {
      const f = getFlow(from)
      if (!f) return reply(T.stale)
      if (f.level === "ق") return draw(setFlow(from, { ...f, level: "ص", page: 0 }))
      if (f.level === "ص") return draw(setFlow(from, { ...f, level: f.scope === "د" ? "د" : "مج", page: 0 }))
      if (f.level === "د") return draw(setFlow(from, { ...f, level: "مج", page: 0 }))
      return draw(setFlow(from, { ...f, level: "و", page: 0 }))
    }

    // ═══ المستويات 1-3 ═══
    const hit = parseLevel(name)
    if (hit) {
      const f = getFlow(from)
      if (!f) return reply(T.stale)

      // سهم التنقّل: نفس المستوى بصفحة مجاورة. الالتفاف يمنع أن يعلق
      // المستخدم في آخر صفحة بلا زر رجوع (واتساب يسمح بثلاثة أزرار فقط).
      if (hit.arg === PREV || hit.arg === NEXT) {
        const total = levelItems(f).length
        const pages = Math.max(1, Math.ceil(total / pageSize(f.mode)))
        const raw = (f.page || 0) + (hit.arg === NEXT ? 1 : -1)
        const page = raw < 0 ? pages - 1 : raw >= pages ? 0 : raw
        return draw(setFlow(from, { ...f, page }))
      }

      const i = +hit.arg

      if (hit.lv === "د") {
        const c = paginate(COUNTRIES_TREE, f.page || 0, pageSize(f.mode)).slice[i]
        if (!c) return reply(T.empty)
        return draw(setFlow(from, { ...f, level: "ص", scope: "د", page: 0, country: c }))
      }

      if (hit.lv === "ص") {
        if (f.scope === "ص") {
          const c = paginate(globalCategories(), f.page || 0, pageSize(f.mode)).slice[i]
          if (!c) return reply(T.empty)
          const channels = channelsOfCategory(c.title)
          if (!channels.length) return reply(T.empty)
          return draw(setFlow(from, { ...f, level: "ق", page: 0, country: null, category: { title: c.title, channels } }))
        }
        const c = paginate(f.country?.categories || [], f.page || 0, pageSize(f.mode)).slice[i]
        if (!c) return reply(T.empty)
        return draw(setFlow(from, { ...f, level: "ق", page: 0, category: c }))
      }

      // المستوى 3: اختيار قناة → اعرض الجودة
      const ch = paginate(f.category?.channels || [], f.page || 0, pageSize(f.mode)).slice[i]
      if (!ch) return reply(T.empty)

      await react("🎚️")
      return showQuality({ send, usedPrefix, channel: ch, qPage: 0, mode: f.mode }).then(() =>
        setFlow(from, { ...f, channel: ch, qPage: 0 })
      )
    }

    // ═══ تنقّل صفحات الجودة (وضع الأزرار) ═══
    if (name === idQPrev() || name === idQNext()) {
      const f = getFlow(from)
      if (!f?.channel) return reply(T.stale)
      const qPage = Math.max(0, (f.qPage || 0) + (name === idQNext() ? 1 : -1))
      await showQuality({ send, usedPrefix, channel: f.channel, qPage, mode: f.mode })
      return setFlow(from, { ...f, qPage })
    }

    // ═══ إيقاف بثّ جارٍ ═══
    const stopIdx = parseLiveStop(name)
    if (stopIdx !== null) {
      const rec = liveFor()[stopIdx]
      if (!rec) return reply("❌ *هذا البثّ لم يعد جارياً.*")

      const call = rec.call || null
      await react("⏹")
      try {
        if (typeof rec.stop === "function") rec.stop()
        if (call && typeof call.hangup === "function") await call.hangup()
      } catch (e) {
        removeLive(rec.id)
        if (call) removeCall(rec.chat || from, call)
        return reply(`⚠️ *أُوقف البثّ مع خطأ:* ${e?.message || e}`)
      }
      removeLive(rec.id)
      if (call) removeCall(rec.chat || from, call)
      return reply("⏹ *أُوقف البثّ بنجاح.*")
    }

    // ═══ إرسال رابط بثّ جارٍ ═══
    const linkIdx = parseLiveLink(name)
    if (linkIdx !== null) {
      const rec = liveFor()[linkIdx]
      if (!rec) return reply("❌ *هذا البثّ لم يعد جارياً.*")
      const link = rec.link || (() => { try { return rec.call?.link } catch { return null } })()
      if (!link) return reply("❌ *لم يُجهَّز رابط هذا البثّ بعد.*\n> انتظر ثوانٍ ثم أعد المحاولة.")
      await react("🔗")
      return reply(`🔗 *رابط البثّ:*\n${link}`)
    }

    // ═══ اختيار بثّ: إرسال الرابط أم إيقافه ═══
    const pickIdx = parseLivePick(name)
    if (pickIdx !== null) {
      const rec = liveFor()[pickIdx]
      if (!rec) return reply("❌ *هذا البثّ لم يعد جارياً.*")

      await react("📡")
      const text = `📡 *${stripIcon(rec.source || "بثّ")}*${rec.quality ? ` · ${rec.quality}` : ""}\n\n${T.liveActions}`
      const actions = [
        { title: T.liveSend, id: `${usedPrefix}${idLiveLink(pickIdx)}` },
        { title: T.liveStop, id: `${usedPrefix}${idLiveStop(pickIdx)}` },
        { title: T.back, id: `${usedPrefix}${idLive()}` }
      ]
      if ((getFlow(from)?.mode || "ق") === "ز") {
        return send({ text, buttons: actions.map((a) => ({ text: a.title, id: a.id })) })
      }
      return send({
        text,
        selectLabel: T.liveActions,
        sections: [{ title: T.liveActions, rows: actions }]
      })
    }

    // ═══ قائمة البثوث الجارية ═══
    if (name === idLive()) {
      const mode = getFlow(from)?.mode || "ق"
      const items = liveFor().slice(0, mode === "ز" ? MAX_LIVE : SLOTS)
      await react("📡")
      if (!items.length) {
        if (mode === "ز") {
          return send({ text: T.liveNone, buttons: [{ text: T.back, id: `${usedPrefix}${idBack()}` }] })
        }
        return send({
          text: T.liveNone,
          selectLabel: T.liveActions,
          sections: [{ title: T.liveActions, rows: [{ title: T.back, description: "العودة للخطوة السابقة", id: `${usedPrefix}${idBack()}` }] }]
        })
      }

      const rows = items.map((it, i) => {
        const state =
          it.status === "preparing"
            ? "⏳ جارٍ التجهيز..."
            : it.status === "opening"
              ? "⏳ جارٍ فتح الغرفة..."
              : "🟢 يعمل الآن"
        return {
          title: clip(`${stripIcon(it.source || "بثّ")}${it.quality ? ` · ${it.quality}` : ""}`, 60),
          description: `${state} — اضغط للرابط أو الإيقاف`,
          id: `${usedPrefix}${idLivePick(i)}`
        }
      })

      const text = `${T.liveTitle}\n> ${items.length} بثّ جارٍ`
      if (mode === "ز") {
        const buttons = rows.slice(0, 2).map((r) => ({ text: clip(r.title, 20), id: r.id }))
        buttons.push({ text: T.back, id: `${usedPrefix}${idBack()}` })
        return send({ text, buttons: buttons.slice(0, 3) })
      }
      return send({
        text,
        selectLabel: T.livePick,
        sections: [{
          title: T.livePick,
          rows: [...rows, { title: T.back, description: "العودة للخطوة السابقة", id: `${usedPrefix}${idBack()}` }]
        }]
      })
    }

    // ═══ البحث المباشر: .قنوات <اسم> ═══
    const query = String(text || "").trim()
    if (query) {
      const hits = channelNames().filter((n) => n.toLowerCase().includes(query.toLowerCase())).slice(0, SLOTS)
      if (!hits.length) return reply(`❌ لا توجد قناة تطابق «${query}»`)

      await react("🔍")
      const chans = hits.map((n) => ({ name: n, url: null, quality: null }))
      const f = setFlow(from, {
        level: "ق",
        mode: getFlow(from)?.mode || "ق",
        scope: "ص",
        page: 0,
        search: query,
        category: { title: `🔍 ${query}`, channels: chans }
      })
      const rows = chans.map((ch, i) => ({
        title: clip(ch.name, 60),
        description: "اضغط لعرض الجودات",
        id: `${usedPrefix}${idRow("ق", i)}`
      }))
      return page({
        f, send, rows, cur: 0,
        pages: Math.max(1, Math.ceil(chans.length / pageSize(f.mode))),
        P: (id) => `${usedPrefix}${id}`,
        text: `🔍 نتائج «${query}»`,
        selectLabel: T.channel
      })
    }

    // ═══ الجذر: طريقة العرض ═══
    await react("📺")
    return draw(setFlow(from, { level: "و", mode: "ق", page: 0 }))
  }
}

// يعرض الجودات: منسدلة كاملة، أو أزرار صفحتين (3+3) لأن واتساب يسمح بثلاثة
function showQuality({ send, usedPrefix, channel, qPage, mode }) {
  const QPAGE = 3
  const pages = Math.ceil(QUALITY_LABELS.length / QPAGE)
  const cur = Math.min(Math.max(0, qPage | 0), pages - 1)
  const head = `📺 *${channel.name}*\n${channel.quality ? `> الجودة الأصلية: ${channel.quality}\n` : ""}${T.quality}`

  const rows = QUALITY_LABELS.map((label, r) => ({
    title: label,
    description: r === QUALITIES.length - 1 ? "بدون تحديد — أعلى جودة متاحة" : `بثّ بجودة ${label}`,
    id: `${usedPrefix}${idQuality(r)}`
  }))

  // القائمة المنسدلة تحمل الستة كاملة، فلا حاجة لصفحات
  if (mode !== "ز") {
    return send({
      text: head,
      selectLabel: T.quality,
      sections: [{ title: T.quality, rows }]
    })
  }

  // الأزرار: ثلاثة فقط، والباقي في صفحة ثانية
  const start = cur * QPAGE
  const buttons = QUALITY_LABELS.slice(start, start + QPAGE).map((label, k) => ({
    text: label,
    id: `${usedPrefix}${idQuality(start + k)}`
  }))
  if (cur < pages - 1) buttons.push({ text: "المزيد ➡️", id: `${usedPrefix}${idQNext()}` })
  else if (cur > 0) buttons.push({ text: "⬅️ السابق", id: `${usedPrefix}${idQPrev()}` })

  return send({
    text: `${head}\n> صفحة ${cur + 1}/${pages}`,
    buttons: buttons.slice(0, 3)
  })
}

// يرسم المستوى النشِط من حالة التدفّق
async function render({ f, send, reply, usedPrefix }) {
  const P = (id) => `${usedPrefix}${id}`

  if (f.level === "و") {
    return send({
      text: `${T.title}\n\n${T.mode}`,
      buttons: [
        { text: T.btnButtons, id: P(idMode("ز")) },
        { text: T.btnList, id: P(idMode("ق")) }
      ]
    })
  }

  if (f.level === "مج") {
    const text = `${T.title}\n\n${T.group}\n> ${totalChannels()} قناة · ${COUNTRIES_TREE.length} دولة`
    if (f.mode === "ز") {
      return send({
        text,
        buttons: [
          { text: T.byCountry, id: P(idGroup("د")) },
          { text: T.byCategory, id: P(idGroup("ص")) },
          { text: T.btnLive, id: P(idLive()) }
        ]
      })
    }
    const rows = [
      { title: T.byCountry, description: "تصفّح القنوات حسب الدولة", id: P(idGroup("د")) },
      { title: T.byCategory, description: "تصفّح القنوات حسب التصنيف", id: P(idGroup("ص")) },
      { title: T.btnLive, description: "البثوث الجارية الآن", id: P(idLive()) }
    ]
    return page({ f, send, rows, cur: 0, pages: 1, P, text, selectLabel: T.group })
  }

  if (f.level === "د") {
    const { slice, cur, pages } = paginate(COUNTRIES_TREE, f.page || 0, pageSize(f.mode))
    const rows = slice.map((c, i) => {
      const n = c.categories.reduce((m, x) => m + x.channels.length, 0)
      return {
        title: clip(c.title, 60),
        description: `${n} قناة · ${c.categories.length} تصنيف`,
        id: P(idRow("د", i))
      }
    })
    return page({
      f, send, rows, cur, pages, P,
      text: `${T.country}\n> ${totalChannels()} قناة في ${COUNTRIES_TREE.length} دولة`,
      selectLabel: T.country
    })
  }

  if (f.level === "ص") {
    const source = f.scope === "ص" ? globalCategories() : (f.country?.categories || [])
    const { slice, cur, pages } = paginate(source, f.page || 0, pageSize(f.mode))
    if (!slice.length) return reply(T.empty)

    const rows = slice.map((c, i) => ({
      title: clip(stripIcon(c.title), 60),
      description: `${c.count ?? c.channels?.length ?? 0} قناة`,
      id: P(idRow("ص", i))
    }))

    const head = f.scope === "ص" ? T.category : `${f.country?.title || ""}\n${T.category}`
    return page({ f, send, rows, cur, pages, P, text: head, selectLabel: T.category })
  }

  const chans = f.category?.channels || []
  const { slice, cur, pages } = paginate(chans, f.page || 0, pageSize(f.mode))
  if (!slice.length) return reply(T.empty)

  const rows = slice.map((ch, i) => ({
    title: clip(ch.name, 60),
    description: ch.country
      ? `🌍 ${stripIcon(ch.country)}${ch.quality ? ` · ${ch.quality}` : ""}`
      : (ch.quality ? `جودة ${ch.quality}` : "بثّ مباشر"),
    id: P(idRow("ق", i))
  }))

  const head = [f.country?.title, `*${stripIcon(f.category.title)}*`, T.channel, `> ${chans.length} قناة`]
    .filter(Boolean)
    .join("\n")

  return page({ f, send, rows, cur, pages, P, text: head, selectLabel: T.channel })
}

// يرسم صفحة: أزرار عند الوضع «ز» وقائمة منسدلة عند الوضع «ق»
async function page({ f, send, rows, cur, pages, text, selectLabel, P }) {
  const canPrev = cur > 0
  const canNext = cur < pages - 1

  if (f.mode === "ز") {
    // واتساب يسمح بثلاثة أزرار: عنصران + «المزيد». الزر يلتفّ إلى البداية
    // بعد آخر صفحة، فتبقى الدورة مكتملة بلا أن يعلق المستخدم.
    const buttons = rows.slice(0, SLOTS_BTN).map((r) => ({ text: clip(r.title, 20), id: r.id }))
    buttons.push(
      pages > 1
        ? { text: "المزيد ➡️", id: P(idNext(f.level)) }
        : { text: T.back, id: P(idBack()) }
    )

    return send({ text: `${text}\n> صفحة ${cur + 1}/${pages}`, buttons: buttons.slice(0, 3) })
  }

  // في الوضع المنسدل يبقى التنقّل والرجوع صفوفاً داخل القائمة، لا أزراراً خارجها.
  const listRows = [...rows]
  if (canPrev) listRows.push({ title: "⬅️ السابق", description: `الصفحة ${cur}/${pages}`, id: P(idPrev(f.level)) })
  if (canNext) listRows.push({ title: "التالي ➡️", description: `الصفحة ${cur + 2}/${pages}`, id: P(idNext(f.level)) })
  listRows.push({ title: T.back, description: "العودة للخطوة السابقة", id: P(idBack()) })

  return send({
    text: `${text}\n> صفحة ${cur + 1}/${pages}`,
    selectLabel,
    sections: [{ title: selectLabel, rows: listRows }]
  })
}
