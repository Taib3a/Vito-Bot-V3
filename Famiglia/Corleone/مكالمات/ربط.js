// محرّك VoIP مقتبس من مشروع HIROBOT (github.com/HirooSy/HIROBOT) — رخصة غير تجارية.
// هذا الجسر يوائم واجهة المحرّك مع إضافات هذا البوت.
import Voip from "./index.js"
import os from "os"
import path from "path"
import fs from "fs"

// سجل المكالمات الجارية لكل محادثة.
const activeCalls = new Map()

const VIDEO_EXT_RE = /\.(mp4|mov|webm|mkv|avi|m4v|3gp)(\?|#|$)/i
const RESOLUTION_RE = /^(240p|360p|480p|720p|1080p)$/i

export function getVoip(sock) {
  if (!sock.voipInstance) {
    sock.voipInstance = new Voip(sock, { voipLogLevel: "warn" })
  }
  return sock.voipInstance
}

// يحلّل وسائط الأمر: روابط + ردّ على صوت/فيديو + دقة.
export async function parseMediaArgs(sock, msg, args) {
  const resolutionArg = args.find((a) => RESOLUTION_RE.test(a))
  const urls = args.filter((a) => /^https?:\/\//i.test(a))
  const media = [...urls]
  const tempFiles = []

  const contextInfo = msg?.message?.extendedTextMessage?.contextInfo
  const quoted = contextInfo?.quotedMessage
  const mime = quoted?.audioMessage?.mimetype || quoted?.videoMessage?.mimetype || ""
  const kind = /^video/.test(mime) ? "video" : /^audio/.test(mime) ? "audio" : null

  if (kind) {
    try {
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
      if (buffer) {
        const file = path.join(os.tmpdir(), `voip_${kind}_${Date.now()}${kind === "video" ? ".mp4" : ".audio"}`)
        fs.writeFileSync(file, buffer)
        tempFiles.push(file)
        media.unshift(file)
      }
    } catch {}
  }

  const isVideo = media.some((src) => VIDEO_EXT_RE.test(src))
  const finalMedia = media.length === 0 ? "silence" : media.length === 1 ? media[0] : media

  return {
    media: finalMedia,
    resolution: resolutionArg ? resolutionArg.toLowerCase() : undefined,
    isVideo,
    tempFiles,
    cleanup: () => {
      for (const f of tempFiles) try { fs.existsSync(f) && fs.unlinkSync(f) } catch {}
    }
  }
}

// يربط أحداث المكالمة بتحديث رسالة واحدة، ويُنظّف عند الانتهاء.
export function wireCallEvents({ sock, from, call, key, tempFiles = [], title = "المكالمة" }) {
  const edit = (t) =>
    key ? sock.sendMessage(from, { text: t, edit: key }).catch(() => {}) : sock.sendMessage(from, { text: t }).catch(() => {})

  const cleanup = () => {
    removeCall(from, call)
    for (const f of tempFiles) try { fs.existsSync(f) && fs.unlinkSync(f) } catch {}
  }

  call.on("ringing", () => edit(`📞 *${title} ترنّ...*`))
  call.on("connected", () => edit(`✅ *${title} جارية*\n> *.إغلاق* للإنهاء · *.كتم* للكتم · *.رفع-يد* · *.مشاركة-شاشة*`))
  call.on("downgraded", () => sock.sendMessage(from, { text: "🎥 أُوقفت الكاميرات، تحوّلت المكالمة إلى صوتية." }).catch(() => {}))
  call.on("ended", (reason) => {
    cleanup()
    edit(reason === "declined" ? `📵 *رُفضت ${title}.*` : `📴 *انتهت ${title}:* ${reason}`)
  })
  call.on("error", (err) => {
    cleanup()
    sock.sendMessage(from, { text: `❌ *خطأ في ${title}:* ${err?.message || err}` }).catch(() => {})
  })

  return { edit, cleanup }
}


export function addCall(from, call) {
  if (!activeCalls.has(from)) activeCalls.set(from, new Set())
  activeCalls.get(from).add(call)
}

export function removeCall(from, call) {
  const calls = activeCalls.get(from)
  if (!calls) return
  calls.delete(call)
  if (calls.size === 0) activeCalls.delete(from)
}

export function currentCall(from) {
  const calls = activeCalls.get(from)
  if (!calls || calls.size === 0) return null
  return [...calls][calls.size - 1]
}

export function callsOf(from) {
  return [...(activeCalls.get(from) ?? [])]
}

// يستخرج أعضاء المجموعة كأرقام (يستثني البوت نفسه)، مع حلّ معرّفات @lid.
export async function groupMemberNumbers(ctx) {
  const { groupMeta, sock, resolveLid } = ctx
  const participants = groupMeta?.participants ?? []
  const selfNums = new Set(
    [sock?.user?.id, sock?.user?.lid]
      .filter(Boolean)
      .map((j) => String(j).split(/[:@]/)[0])
  )

  const numbers = []
  const seen = new Set()
  for (const p of participants) {
    // phoneNumber (PN) هو الأنسب للمكالمات؛ فإن غاب وكان المعرّف @lid نحلّه.
    let jid = p.phoneNumber || p.id || ""
    if (jid.endsWith("@lid") && resolveLid) {
      try { jid = (await resolveLid(jid)) || jid } catch {}
    }
    if (!jid) continue
    const num = String(jid).split(/[:@]/)[0].replace(/\D/g, "")
    if (!num || num.length < 6) continue
    if (selfNums.has(num) || seen.has(num)) continue
    seen.add(num)
    numbers.push(num)
  }
  return numbers
}

