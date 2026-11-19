import {
  getVoip,
  addCall,
  removeCall,
  callsOf,
  parseMediaArgs,
  wireCallEvents,
  missingRequirements,
  mediaRequirementMessage
} from "../../اضافات/محركات.js"

const RESOLUTIONS = /^(240|360|480|720|1080)p?$/i

function lastCall(from) {
  const calls = callsOf(from)
  return calls.length ? calls[calls.length - 1] : null
}

function usage(usedPrefix, cmdName) {
  const call = `${usedPrefix}${cmdName}`
  return (
    `📞 *طريقة الاستخدام:*\n` +
    `> *${call} <رقم> [رابط/ردّ على صوت أو فيديو] [الجودة] [auto] [loop]*\n` +
    `> الجودات: 240 · 360 · 480 · 720 · 1080\n` +
    `> *auto* — يُغلق المكالمة بعد نهاية المقطع\n` +
    `> *loop* — يُعيد المقطع من البداية\n\n` +
    `أثناء المكالمة:\n` +
    `> *${usedPrefix}voipend* — إنهاء المكالمة (أضف *force* لإعادة الضبط)\n` +
    `> *${usedPrefix}voipsilent* — كتم الميكروفون وإيقاف الكاميرا مؤقتاً\n` +
    `> *${usedPrefix}voipreact <إيموجي>* — إرسال تفاعل داخل المكالمة`
  )
}

export default {
  name: [
    "voipcall",
    "voipend",
    "voipsilent",
    "voipreact",
    "اتصال",
    "انهاء-المكالمة",
    "كتم-المكالمة",
    "تفاعل-المكالمة"
  ],
  description: "يُجري مكالمة واتساب حقيقية (صوت/فيديو) ويبثّ خلالها وسائط أو قناة",
  category: "مكالمات",
  ownerOnly: true,

  async run(ctx) {
    const { sock, from, msg, args, reply, react, cmdName, usedPrefix } = ctx
    const name = String(cmdName || "").toLowerCase()
    const voip = getVoip(sock)

    const isEnd = name === "voipend" || name === "انهاء-المكالمة"
    const isSilent = name === "voipsilent" || name === "كتم-المكالمة"
    const isReact = name === "voipreact" || name === "تفاعل-المكالمة"

    if (isEnd) {
      if (/^force$/i.test(args[0] || "")) {
        await voip.end(true)
        for (const call of callsOf(from)) removeCall(from, call)
        return reply({ text: "♻️ *أُعيد ضبط حالة المكالمات.*" })
      }
      const calls = callsOf(from)
      if (calls.length === 0) {
        return reply({ text: "❌ *لا توجد مكالمة جارية في هذه المحادثة.*" })
      }
      await react("📴")
      const results = await Promise.allSettled(calls.map((call) => call.hangup()))
      for (const call of calls) removeCall(from, call)
      const failed = results.filter((r) => r.status === "rejected").length
      return reply({
        text: failed
          ? `⚠️ *طُلب إنهاء ${calls.length} مكالمة، وتعذّر ${failed} منها.*`
          : "📴 *أُنهيت المكالمة.*"
      })
    }

    if (isSilent) {
      const call = lastCall(from)
      if (!call) return reply({ text: "❌ *لا توجد مكالمة جارية في هذه المحادثة.*" })
      const silenced = await call.silent()
      return reply({
        text: silenced
          ? "🔇 *كُتم الميكروفون وأُوقفت الكاميرا مؤقتاً.*"
          : "🔊 *عاد الصوت والصورة إلى المكالمة.*"
      })
    }

    if (isReact) {
      const call = lastCall(from)
      if (!call) return reply({ text: "❌ *لا توجد مكالمة جارية في هذه المحادثة.*" })
      const emoji = args[0] || "👍"
      const ok = await call.react(emoji)
      return reply({
        text: ok
          ? `✨ *أُرسل التفاعل ${emoji} داخل المكالمة.*`
          : "⚠️ *تعذّر إرسال التفاعل — قد لا تكون المكالمة متصلة بعد.*"
      })
    }

    // ── بدء مكالمة جديدة ─────────────────────────────────────────────
    const phoneNumber = String(args[0] || "").replace(/\D/g, "")
    if (!phoneNumber) return reply({ text: usage(usedPrefix, cmdName) })

    const rest = args.slice(1).map((a) => (RESOLUTIONS.test(a) ? `${a.toLowerCase().replace(/p$/, "")}p` : a))

    const parsed = await parseMediaArgs(sock, msg, rest)
    const { media, resolution, isVideo, hasMedia, hasQuotedMedia, mediaError, tempFiles } = parsed
    const cleanupMedia = parsed.cleanup

    if (hasQuotedMedia && !hasMedia) {
      cleanupMedia()
      const reason = mediaError?.message || String(mediaError || "")
      return reply({
        text:
          "❌ *تعذّر تنزيل الوسائط المردود عليها.*\n" +
          (reason ? `> السبب: ${reason.slice(0, 160)}\n` : "") +
          "> أعد إرسال المقطع أو أرسل رابطاً مباشراً بدلاً منه."
      })
    }

    if (hasMedia) {
      const missing = await missingRequirements({ media: true })
      if (missing.length) {
        cleanupMedia()
        return reply({ text: mediaRequirementMessage(missing) })
      }
    }

    await react("📞")
    const sent = await reply({
      text: `📞 *جارٍ الاتصال بـ ${phoneNumber}*${isVideo ? " (فيديو)" : ""}...\n> *${usedPrefix}voipend* للإنهاء · *${usedPrefix}voipsilent* للكتم`
    })

    let call
    try {
      call = await voip.call(phoneNumber, media, resolution, {
        autoEndCall: parsed.autoEndCall,
        loop: parsed.loop
      })
    } catch (e) {
      cleanupMedia()
      await react("❌")
      return reply({ text: `❌ *فشل بدء المكالمة:* ${e?.message || e}` })
    }

    addCall(from, call)
    wireCallEvents({ sock, from, call, key: sent?.key, tempFiles, title: "المكالمة" })

    call.on("item", ({ index, kind }) => {
      if (index === 0) return
      sock
        .sendMessage(from, { text: `🎵 *الآن يُبثّ المقطع ${index + 1} (${kind}).*` })
        .catch(() => {})
    })
  }
}
