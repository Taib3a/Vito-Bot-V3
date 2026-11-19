import { getVoip, addCall, removeCall, parseMediaArgs } from "../../اضافات/محركات.js"
import { missingRequirements, mediaRequirementMessage } from "../../اضافات/محركات.js"

export default {
  name: ["مكالمة"],
  description: "يبدأ مكالمة واتساب صوتية أو مرئية ويشغّل وسائط داخلها",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, from, msg, reply, react, args }) {
    const phone = String(args[0] || "").replace(/\D/g, "")
    if (!phone) {
      return reply({
        text:
          "📞 *طريقة الاستخدام:*\n" +
          "> *.مكالمة <الرقم>* — مكالمة صامتة\n" +
          "> *.مكالمة <الرقم> <رابط أو ردّ على صوت/فيديو>* — مكالمة مع تشغيل وسائط\n" +
          "> *.مكالمة <الرقم> <رابط> auto* — تُغلق تلقائياً بعد الانتهاء\n" +
          "> *.مكالمة <الرقم> <رابط> loop* — تُكرّر الوسائط بلا توقف\n" +
          "> الدقات: 240p · 360p · 480p · 720p · 1080p\n" +
          "أثناء المكالمة: *.كتم* · *.تفاعل-مكالمة <إيموجي>* · *.رفع-يد* · *.إغلاق*"
      })
    }

    const { media, resolution, autoEndCall, loop, isVideo, hasMedia, cleanup: cleanupMedia } =
      await parseMediaArgs(sock, msg, args, { skipIndexes: [0] })

    // الوسائط تتطلب ffmpeg/ffprobe؛ المكالمة الصامتة لا تحتاجها.
    if (hasMedia) {
      const missing = await missingRequirements({ media: true })
      if (missing.length) {
        cleanupMedia()
        return reply({ text: mediaRequirementMessage(missing) })
      }
    }

    try {
      await react("📞")
      const sent = await reply({
        text: `📞 *جارٍ الاتصال بـ ${phone}...*${isVideo ? " (مرئي)" : ""}\n> استخدم *.إغلاق* لإنهاء المكالمة`
      })
      const key = sent?.key

      const voip = getVoip(sock)
      const call = await voip.call(phone, media, resolution, { autoEndCall, loop })
      addCall(from, call)

      const edit = (t) => (key ? sock.sendMessage(from, { text: t, edit: key }) : sock.sendMessage(from, { text: t }))
      const cleanup = () => {
        removeCall(from, call)
        cleanupMedia()
      }

      call.on("ringing", () => edit(`📞 *يرنّ الآن:* ${phone}...`))
      call.on("connected", () => edit(`✅ *تم الاتصال بـ ${phone}*\n> *.إغلاق* للإنهاء · *.كتم* للكتم · *.رفع-يد* · *.مشاركة-شاشة*`))
      call.on("item", ({ index, kind }) => {
        if (index === 0) return
        sock.sendMessage(from, { text: `🎵 *العنصر ${index + 1}* (${kind})` }).catch(() => {})
      })
      call.on("downgraded", () => sock.sendMessage(from, { text: "🎥 أُوقفت الكاميرات، تحوّلت المكالمة إلى صوتية." }).catch(() => {}))
      call.on("ended", (reason) => {
        cleanup()
        edit(reason === "declined" ? `📵 *رُفضت المكالمة مع ${phone}.*` : `📴 *انتهت المكالمة مع ${phone}:* ${reason}`)
      })
      call.on("error", (err) => {
        cleanup()
        sock.sendMessage(from, { text: `❌ *خطأ في المكالمة:* ${err?.message || err}` }).catch(() => {})
      })
    } catch (e) {
      cleanupMedia()
      await react("❌")
      return reply({ text: `❌ فشل بدء المكالمة: ${e?.message || e}` })
    }
  }
}
