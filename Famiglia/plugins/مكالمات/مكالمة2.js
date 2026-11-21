import { getVoip, addCall, removeCall, wireCallEvents } from "../../اضافات/محركات.js"
import { missingRequirements, mediaRequirementMessage } from "../../اضافات/محركات.js"
import { resolveStreamUrl } from "../../Corleone/بث/بث.js"
import { addLive, removeLive, updateLive, getLive } from "../../Corleone/بث/مباشر.js"
import { log } from "../../Corleone/logger.js"

// يقبل "240" و"240p" — المستخدم يكتب الجودة بلا حرف p عادةً
const RESOLUTIONS = /^(240|360|480|720|1080)p?$/i
const REFRESH_DELAY_MS = 8_000

// الغرفة تُغلق حين يخرج آخر مشارك، فتُعاد بناؤها بدل أن يموت البث.
// الفاصل يتضاعف مع كل فشل متتالٍ حتى لا ندور في حلقة محمومة.
const RESTART_BASE_MS = 3_000
const RESTART_MAX_MS = 60_000
const MAX_RESTART_FAILS = 8

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))


// رابط المكالمة لا يكون جاهزاً فور createRoom — ننتظره قليلاً
async function waitForLink(call, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const link = call?.link
    if (link) return link
    await new Promise((r) => setTimeout(r, 400))
  }
  return null
}

export default {
  name: ["مكالمة2", "بث-قناة"],
  description: "يبثّ قناة عربية أو رابط بث مباشر بالصوت والفيديو داخل غرفة مكالمة برابط دائم",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, from, reply, react, args }) {
    const resolutionArg = args.find((a) => RESOLUTIONS.test(a))
    const resolution = resolutionArg ? `${resolutionArg.toLowerCase().replace(/p$/, "")}p` : null
    const target = args.filter((a) => !RESOLUTIONS.test(a)).join(" ").trim()

    if (!target) {
      return reply({
        text:
          "📡 *طريقة الاستخدام:*\n" +
          "> *.مكالمة2 <اسم القناة>* — مثال: *.مكالمة2 الجزيرة*\n" +
          "> *.مكالمة2 <رابط بث>* — يوتيوب أو m3u8 أو صفحة بث\n" +
          "> *.مكالمة2 الجزيرة 720* — بجودة محددة\n" +
          "> *.قنوات* لعرض القنوات المتاحة\n" +
          "> *.مكالمة-اغلاق <الرابط>* لإغلاق البث"
      })
    }

    await react("📡")
    const sent = await reply({ text: "📡 *جارٍ تجهيز البث...*" })

    // نسجّل البث فوراً بحالة "تجهيز" ليظهر في «البث المباشر الآن» حتى قبل
    // اكتمال فتح الغرفة، ثم نحدّث حالته بعد كل خطوة.
    const liveId = addLive({
      chat: from,
      source: target,
      quality: resolution,
      call: null,
      status: "preparing"
    })

    let resolved
    try {
      resolved = await resolveStreamUrl(target)
      updateLive(liveId, { source: resolved.channel || target, status: "opening" })
      log.info(`[بث] الرابط: ${resolved.url} (${resolved.via})`, "مكالمة2")
    } catch (e) {
      removeLive(liveId)
      log.error(`[بث] فشل تجهيز الرابط: ${e?.message || e}`, "مكالمة2")
      await react("❌")
      return reply({ text: `❌ ${e?.message || e}` })
    }

    const missing = await missingRequirements({ media: true })
    if (missing.length) {
      removeLive(liveId)
      log.error(`[بث] متطلبات ناقصة: ${missing.join(", ")}`, "مكالمة2")
      return reply({ text: mediaRequirementMessage(missing) })
    }

    const voip = getVoip(sock)
    const state = { stopped: false, restarting: false }

    // ينشئ غرفة ويربطها بالسجل. يُستدعى أول مرة وعند كل إعادة تشغيل.
    const open = async () => {
      // فيديو + صوت: القناة بلا صورة مجرد راديو
      const call = await voip.createRoom(resolved.url, resolution, {
        isVideo: true,
        loop: true,
        autoEndCall: false,
        requireApproval: false
      })
      addCall(from, call)
      updateLive(liveId, { call })
      log.info(`[بث] غرفة أُنشئت: ${call.callId || "?"}`, "مكالمة2")

      // requireApproval=false يطفئ الغرفة بعد الاتصال فقط؛ ومن يضغط الرابط
      // قبل ذلك قد يعلق منتظراً — فنُدخله فوراً عند أي تحديث لغرفة الانتظار.
      const admitAll = () => {
        const room = call.waitingRoom
        if (!room?.users?.length) return
        for (const user of room.users) {
          if (!user.jid) continue
          Promise.resolve(call.admit(user.jid)).catch(() => {})
        }
      }
      call.on("waiting_room", admitAll)
      call.once("connected", () => {
        Promise.resolve(call.setApprovalRequired(false)).catch(() => {})
        admitAll()
      })

      wireCallEvents({
        sock,
        from,
        call,
        key: sent?.key,
        tempFiles: [],
        title: "البث المباشر"
      })

      // تجديد تلقائي: روابط البث تنتهي صلاحيتها أو تنقطع
      let refreshing = false
      const refresh = async () => {
        if (refreshing || call.ended) return
        refreshing = true
        try {
          const next = await resolveStreamUrl(target)
          if (next.url !== resolved.url || resolved.via === "page" || resolved.via === "yt-dlp") {
            await voip.coordinator?.loadVideo(call.callId, next.url)
            resolved = next
          }
        } catch {
          // فشل التجديد — المحرّك يعيد المحاولة عبر reconnect
        } finally {
          refreshing = false
        }
      }
      call.on("reconnecting", () => {
        if (!state.stopped) setTimeout(refresh, REFRESH_DELAY_MS)
      })

      // الرابط لا يُرسل تلقائياً: كان يُرسل عند كل إعادة تشغيل فتتحوّل
      // المحادثة إلى سيل روابط. صار يُحفظ في السجل ويُطلب من زر البث.
      const link = await waitForLink(call)
      if (link) {
        updateLive(liveId, { link })
        log.info(`[بث] رابط الغرفة جاهز: ${link}`, "مكالمة2")
      } else {
        log.warn("[بث] لم يظهر رابط الغرفة بعد 10 ثوانٍ", "مكالمة2")
      }

      // كل غرفة تُربط هنا، وإلا توقّفت إعادة التشغيل بعد الدورة الأولى
      call.once("ended", () => {
        removeCall(from, call)
        restart().catch(() => {})
      })
      return call
    }

    // الغرفة تنتهي حين يخرج آخر مشارك. حذف السجل هناك هو ما كان يجعل
    // البث يختفي من القائمة ويصير رابطه ميتاً؛ فبدله نعيد بناء الغرفة.
    const restart = async () => {
      if (state.stopped || state.restarting) return
      state.restarting = true
      for (let fails = 0; fails < MAX_RESTART_FAILS && !state.stopped; fails++) {
        await sleep(Math.min(RESTART_BASE_MS * 2 ** fails, RESTART_MAX_MS))
        if (state.stopped) break
        try {
          resolved = await resolveStreamUrl(target)
          updateLive(liveId, { status: "opening" })
          await open()
          updateLive(liveId, { status: "live" })
          log.info(`[بث] أُعيد تشغيل الغرفة live=${liveId}`, "مكالمة2")
          state.restarting = false
          return
        } catch (e) {
          log.warn(`[بث] فشل إعادة التشغيل (${fails + 1}/${MAX_RESTART_FAILS}): ${e?.message || e}`, "مكالمة2")
        }
      }
      state.restarting = false
      if (state.stopped) return
      removeLive(liveId)
      await sock
        .sendMessage(from, { text: "📴 *توقّف البث بعد تعذّر إعادة تشغيله.*\n> أرسل *.مكالمة2* من جديد." })
        .catch(() => {})
    }

    try {
      await open()
    } catch (e) {
      removeLive(liveId)
      log.error(`[بث] فشل فتح الغرفة: ${e?.message || e}`, "مكالمة2", e?.stack)
      await react("❌")
      return reply({ text: `❌ فشل بث القناة: ${e?.message || e}` })
    }

    // .مكالمة-اغلاق ينادي stop() قبل الإنهاء، فلا يُعاد بناء الغرفة
    updateLive(liveId, { status: "live" })
    const record = getLive(liveId)
    if (record) record.stop = () => { state.stopped = true }

    const readyText =
      `✅ *البث جاهز.*\n` +
      `> عد إلى: *📡 البث المباشر الآن* ← *البثوث الجارية الآن*`
    log.info(`[بث] جاهز live=${liveId}`, "مكالمة2")

    // نعدّل رسالة «جارٍ تجهيز البث...» نفسها بدل إرسال رسالة جديدة بزر.
    if (sent?.key) {
      await sock
        .sendMessage(from, { text: readyText, edit: sent.key })
        .catch(() => reply({ text: readyText }))
    } else {
      await reply({ text: readyText })
    }
  }
}
