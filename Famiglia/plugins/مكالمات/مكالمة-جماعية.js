import os from "os"
import path from "path"
import fs from "fs"
import { getVoip, addCall, removeCall, groupMemberNumbers } from "../../Corleone/مكالمات/ربط.js"

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
  const file = path.join(os.tmpdir(), `gvoip_${kind}_${Date.now()}${kind === "video" ? ".mp4" : ".audio"}`)
  fs.writeFileSync(file, buffer)
  return file
}

export default {
  name: ["مكالمة-جماعية"],
  description: "يبدأ مكالمة جماعية لأعضاء المجموعة (يعمل داخل المجموعات فقط)",
  category: "مكالمات",
  groupOnly: true,
  ownerOnly: true,

  async run(ctx) {
    const { sock, from, msg, reply, react, args, groupMeta } = ctx

    const members = await groupMemberNumbers(ctx)
    if (members.length < 2) {
      return reply({ text: "❌ *لا يمكن بدء مكالمة جماعية:* يحتاج المحرّك عضوين على الأقل غير البوت في المجموعة." })
    }

    const resolutionArg = args.find((a) => RESOLUTION_RE.test(a))
    const resolution = resolutionArg ? resolutionArg.toLowerCase() : undefined

    const urls = args.filter((a) => /^https?:\/\//i.test(a))
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
        text:
          `📞 *جارٍ بدء مكالمة جماعية...*\n` +
          `> المشاركون: *${members.length}*${willBeVideo ? " (مرئية)" : ""}\n` +
          `> استخدم *.إغلاق* لإنهاء المكالمة`
      })
      const key = sent?.key

      const voip = getVoip(sock)
      const call = await voip.groupCall(members, media, resolution, { groupJid: from })
      addCall(from, call)

      const edit = (t) => (key ? sock.sendMessage(from, { text: t, edit: key }) : sock.sendMessage(from, { text: t }))
      const cleanup = () => {
        removeCall(from, call)
        for (const f of tempFiles) try { fs.existsSync(f) && fs.unlinkSync(f) } catch {}
      }

      call.on("ringing", () => edit(`📞 *ترنّ المكالمة الجماعية...* (${members.length} مشارك)`))
      call.on("connected", () => edit(`✅ *المكالمة الجماعية جارية* (${members.length} مشارك)\n> *.إغلاق* للإنهاء · *.كتم* للكتم`))
      call.on("group_state", (state) => {
        const joined = state?.participants?.length ?? 0
        if (joined > 0) edit(`✅ *المكالمة الجماعية جارية*\n> المنضمّون: *${joined}* · الإجمالي: ${members.length}`)
      })
      call.on("downgraded", () => sock.sendMessage(from, { text: "🎥 أُوقفت الكاميرات، تحوّلت المكالمة إلى صوتية." }))
      call.on("ended", (reason) => {
        cleanup()
        edit(reason === "declined" ? "📵 *رُفضت المكالمة الجماعية.*" : `📴 *انتهت المكالمة الجماعية:* ${reason}`)
      })
      call.on("error", (err) => {
        cleanup()
        sock.sendMessage(from, { text: `❌ *خطأ في المكالمة الجماعية:* ${err?.message || err}` })
      })
    } catch (e) {
      for (const f of tempFiles) try { fs.existsSync(f) && fs.unlinkSync(f) } catch {}
      await react("❌")
      return reply({ text: `❌ فشل بدء المكالمة الجماعية: ${e?.message || e}` })
    }
  }
}
