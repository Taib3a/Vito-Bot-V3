import os from "os"
import path from "path"
import fs from "fs"
import { getVoip, addCall, removeCall } from "../../Corleone/مكالمات/ربط.js"

const VIDEO_EXT_RE = /\.(mp4|mov|webm|mkv|avi|m4v|3gp)(\?|#|$)/i
const RESOLUTION_RE = /^(240p|360p|480p|720p|1080p)$/i

// يحمّل الوسائط المرفقة (ردّ على صوت/فيديو) إلى ملف مؤقت ويعيد مساره.
async function downloadQuoted(sock, msg) {
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo
  const quoted = contextInfo?.quotedMessage
  if (!quoted) return null
  const mime = quoted.audioMessage?.mimetype || quoted.videoMessage?.mimetype || ""
  const kind = /^video/.test(mime) ? "video" : /^audio/.test(mime) ? "audio" : null
  if (!kind) return null

  const { downloadMediaMessage } = await import("@whiskeysockets/baileys")
  const buffer = await downloadMediaMessage(
    {
      key: {
        remoteJid: contextInfo.remoteJid || msg.key.remoteJid,
        id: contextInfo.stanzaId,
        participant: contextInfo.participant
      },
      message: quoted
    },
    "buffer",
    {},
    { sock }
  )
  if (!buffer) return null
  const file = path.join(os.tmpdir(), `voip_${kind}_${Date.now()}${kind === "video" ? ".mp4" : ".audio"}`)
  fs.writeFileSync(file, buffer)
  return file
}

export default {
  name: ["مكالمة"],
  description: "يبدأ مكالمة واتساب صوتية أو مرئية ويشغّل وسائط داخلها",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, from, msg, reply, react, args }) {
    if (!args[0]) {
      return reply({
        text:
          "📞 *طريقة الاستخدام:*\n" +
          "> *.مكالمة <الرقم>* — مكالمة صامتة\n" +
          "> *.مكالمة <الرقم> <رابط أو ردّ على صوت/فيديو>* — مكالمة مع تشغيل وسائط\n" +
          "> *.مكالمة <الرقم> <رابط> auto* — تُغلق تلقائياً بعد الانتهاء\n" +
          "> *.مكالمة <الرقم> <رابط> loop* — تُكرّر الوسائط بلا توقف\n" +
          "> الدقات: 240p · 360p · 480p · 720p · 1080p\n" +
          "أثناء المكالمة: *.كتم* · *.تفاعل-مكالمة <إيموجي>* · *.إغلاق*"
      })
    }

    const phone = String(args[0]).replace(/\D/g, "")
    if (!phone) return reply({ text: "❌ رقم غير صالح." })

    const resolutionArg = args.find((a, i) => i > 0 && RESOLUTION_RE.test(a))
    const resolution = resolutionArg ? resolutionArg.toLowerCase() : undefined
    const autoEndCall = args.some((a, i) => i > 0 && /^auto$/i.test(a))
    const loop = args.some((a, i) => i > 0 && /^loop$/i.test(a))

    const urls = args.filter((a, i) => i > 0 && /^https?:\/\//i.test(a))
    let media = [...urls]
    const tempFiles = []

    try {
      const quotedPath = await downloadQuoted(sock, msg)
      if (quotedPath) {
        tempFiles.push(quotedPath)
        media.unshift(quotedPath)
      }

      const willBeVideo = media.some((src) => VIDEO_EXT_RE.test(src))
      if (media.length === 0) media = "silence"
      else if (media.length === 1) media = media[0]

      await react("📞")
      const sent = await reply({
        text: `📞 *جارٍ الاتصال بـ ${phone}...*${willBeVideo ? " (مرئي)" : ""}\n> استخدم *.إغلاق* لإنهاء المكالمة`
      })
      const key = sent?.key

      const voip = getVoip(sock)
      const call = await voip.call(phone, media, resolution, { autoEndCall, loop })
      addCall(from, call)

      const edit = (t) => {
        if (!key) return sock.sendMessage(from, { text: t })
        return sock.sendMessage(from, { text: t, edit: key })
      }

      const cleanup = () => {
        removeCall(from, call)
        for (const f of tempFiles) try { fs.existsSync(f) && fs.unlinkSync(f) } catch {}
      }

      call.on("ringing", () => edit(`📞 *يرنّ الآن:* ${phone}...`))
      call.on("connected", () => edit(`✅ *تم الاتصال بـ ${phone}*\n> *.إغلاق* لإنهاء المكالمة · *.كتم* للكتم`))
      call.on("downgraded", () => sock.sendMessage(from, { text: "🎥 أُوقفت الكاميرات، تحوّلت المكالمة إلى صوتية." }))
      call.on("ended", (reason) => {
        cleanup()
        edit(reason === "declined" ? `📵 *رُفضت المكالمة مع ${phone}.*` : `📴 *انتهت المكالمة مع ${phone}:* ${reason}`)
      })
      call.on("error", (err) => {
        cleanup()
        sock.sendMessage(from, { text: `❌ *خطأ في المكالمة:* ${err?.message || err}` })
      })
    } catch (e) {
      for (const f of tempFiles) try { fs.existsSync(f) && fs.unlinkSync(f) } catch {}
      await react("❌")
      return reply({ text: `❌ فشل بدء المكالمة: ${e?.message || e}` })
    }
  }
}
