import {
  getVoip,
  addCall,
  removeCall,
  callsOf,
  currentCall,
  parseMediaArgs,
  wireCallEvents,
  missingRequirements,
  mediaRequirementMessage
} from "../../اضافات/محركات.js"

const CALL_COMMANDS = /^(مكالمة-مباشرة|voipcall)$/i
const END_COMMANDS = /^(مكالمة-انهاء|voipend)$/i
const MUTE_COMMANDS = /^(مكالمة-كتم|voipsilent)$/i
const REACT_COMMANDS = /^(مكالمة-تفاعل|voipreact)$/i

const USAGE =
  "📞 *طريقة الاستخدام:*\n" +
  "> *.مكالمة-مباشرة <الرقم>* — مكالمة صامتة\n" +
  "> *.مكالمة-مباشرة <الرقم> <رابط>* — يبثّ الصوت أو الفيديو\n" +
  "> *.مكالمة-مباشرة <الرقم> 720* — بجودة محددة\n" +
  "> ردّ على مقطع صوت/فيديو ثم *.مكالمة-مباشرة <الرقم>*\n" +
  "> أضف *auto* لإنهاء المكالمة بعد انتهاء الوسائط\n" +
  "> أضف *loop* لإعادة تشغيلها بلا نهاية\n" +
  "> روابط متعددة = قائمة تشغيل بالترتيب\n\n" +
  "🔇 *.مكالمة-كتم* · 👍 *.مكالمة-تفاعل <إيموجي>* · 🔴 *.مكالمة-انهاء*"

export default {
  name: [
    "مكالمة-مباشرة",
    "voipcall",
    "مكالمة-انهاء",
    "voipend",
    "مكالمة-كتم",
    "voipsilent",
    "مكالمة-تفاعل",
    "voipreact"
  ],
  description: "مكالمة واتساب مباشرة برقم مع بثّ صوت/فيديو، وأوامر الإنهاء والكتم والتفاعل",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, from, msg, reply, react, args, cmdName }) {
    const voip = getVoip(sock)

    if (END_COMMANDS.test(cmdName)) {
      const calls = callsOf(from)
      const force = /^(force|قوة|قوه)$/i.test(String(args[0] || ""))

      if (force) {
        await voip.end(true)
        for (const call of calls) removeCall(from, call)
        return reply({ text: "🔴 *أُعيد ضبط حالة المكالمات بالكامل.*" })
      }

      if (!calls.length) return reply({ text: "❌ *لا مكالمة جارية في هذه المحادثة.*\n> استخدم *.مكالمة-انهاء force* لإعادة الضبط." })

      await Promise.all(calls.map((call) => call.hangup()))
      return reply({ text: "🔴 *جارٍ إنهاء المكالمة...*" })
    }

    if (MUTE_COMMANDS.test(cmdName)) {
      const call = currentCall(from)
      if (!call) return reply({ text: "❌ *لا مكالمة جارية.*" })
      const silenced = await call.silent()
      return reply({
        text: silenced ? "🔇 *كُتم الميكروفون وأُوقف الفيديو.*" : "🔊 *عاد الصوت والصورة.*"
      })
    }

    if (REACT_COMMANDS.test(cmdName)) {
      const call = currentCall(from)
      if (!call) return reply({ text: "❌ *لا مكالمة جارية.*" })
      const emoji = String(args[0] || "👍").slice(0, 8)
      const sent = call.react(emoji)
      return reply({
        text: sent ? `✅ *أُرسل التفاعل ${emoji}*` : "❌ *لم يُرسل التفاعل — المكالمة لم تتصل بعد.*"
      })
    }

    if (!CALL_COMMANDS.test(cmdName)) return reply({ text: USAGE })

    const number = String(args[0] || "").replace(/\D/g, "")
    if (number.length < 6) return reply({ text: USAGE })

    // parseMediaArgs يعرف 720p فقط، والمستخدم يكتب 720 عادةً
    const argv = args.map((a) => (/^\d{3,4}$/.test(a) ? `${a}p` : a))
    const parsed = await parseMediaArgs(sock, msg, argv, { skipIndexes: [0] })
    const { media, resolution, autoEndCall, loop, hasMedia, hasQuotedMedia, mediaError, tempFiles, cleanup } = parsed

    if (hasQuotedMedia && !hasMedia) {
      cleanup()
      const reason = mediaError?.message || mediaError?.toString?.() || ""
      return reply({
        text:
          "❌ *تعذّر تنزيل الوسائط المردود عليها.*\n" +
          (reason ? `> السبب: ${String(reason).slice(0, 160)}\n` : "") +
          "> أعد إرسال المقطع أو مرّر رابطاً مباشراً."
      })
    }

    if (hasMedia) {
      const missing = await missingRequirements({ media: true })
      if (missing.length) {
        cleanup()
        return reply({ text: mediaRequirementMessage(missing) })
      }
    }

    const willBeVideo = hasMedia && media !== "silence" && [].concat(media).some((src) => /\.(mp4|mov|webm|mkv|avi|m4v|3gp)(\?|#|$)/i.test(src))

    await react("📞")
    const sent = await reply({
      text: `📞 *جارٍ الاتصال بـ ${number}...*${willBeVideo ? " (فيديو)" : ""}`
    })

    let call
    try {
      call = await voip.call(number, media, resolution, { autoEndCall, loop })
    } catch (e) {
      cleanup()
      await react("❌")
      return reply({ text: `❌ *فشل بدء المكالمة:*\n> ${e?.message || e}` })
    }

    addCall(from, call)
    wireCallEvents({ sock, from, call, key: sent?.key, tempFiles, title: "المكالمة" })

    call.on("item", ({ index, kind }) => {
      if (index <= 0) return
      sock
        .sendMessage(from, {
          text: `▶️ *العنصر ${index + 1}* — ${kind === "video" ? "فيديو" : "صوت"}`
        })
        .catch(() => {})
    })
  }
}
