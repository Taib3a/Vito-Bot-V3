import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { generateWAMessage, downloadMediaMessage } from "@whiskeysockets/baileys"
import { hasFfmpeg, hasFfprobe } from "../مكالمات/المتطلبات.js"

// واتساب يقبل الحالة المرئية فقط بصيغة MP4/H.264/yuv420p.
// أي فيديو آخر يمرّ عبر ffmpeg قبل الإرسال.
const TIMEOUT_MS = 120_000
const VIDEO_EXT = /\.(mp4|mkv|mov|avi|webm|3gp|m4v)$/i
const IMAGE_EXT = /\.(jpg|jpeg|png|webp|bmp|gif|heic)$/i

const run = (bin, args, timeoutMs = TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] })
    const out = []
    const err = []
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs)

    proc.stdout.on("data", (c) => out.push(c))
    proc.stderr.on("data", (c) => err.push(c))
    proc.on("error", (e) => {
      clearTimeout(timer)
      reject(e)
    })
    proc.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) return resolve(Buffer.concat(out))
      reject(new Error(Buffer.concat(err).toString("utf8").trim() || `${bin} خرج بالرمز ${code}`))
    })
  })

async function probeStreams(file) {
  const out = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", file])
  return JSON.parse(out.toString("utf8")).streams || []
}

export async function normalizeVideo(buffer) {
  const dir = await mkdtemp(join(tmpdir(), "status-"))
  try {
    const input = join(dir, "input")
    const output = join(dir, "output.mp4")
    await writeFile(input, buffer)

    const streams = await probeStreams(input)
    const video = streams.find((s) => s.codec_type === "video")
    if (!video) throw new Error("الملف لا يحتوي مسار فيديو")

    // نسخ مباشر عندما يكون الترميز مقبولاً أصلاً، وإلا إعادة ترميز.
    const videoArgs =
      video.codec_name === "h264" && video.pix_fmt === "yuv420p"
        ? ["-c:v", "copy"]
        : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p"]

    await run("ffmpeg", [
      "-y", "-v", "error",
      "-i", input,
      "-map", "0:v:0",
      "-map", "0:a:0?",
      "-sn", "-dn",
      ...videoArgs,
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
      "-movflags", "+faststart",
      "-f", "mp4",
      output
    ])

    return await readFile(output)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** يستخرج بيانات الوسائط من الرسالة أو الردّ عليها. */
export function mediaSourceOf(msg, quoted) {
  const pick = (m) => {
    const inner = m?.message
    if (!inner) return null
    const node =
      inner.imageMessage ||
      inner.videoMessage ||
      inner.documentMessage ||
      inner.audioMessage ||
      null
    if (!node) return null
    return { message: inner, node, key: m.key }
  }
  return pick(quoted) || pick(msg)
}

export async function downloadSource(sock, source) {
  return downloadMediaMessage({ key: source.key, message: source.message }, "buffer", {}, { sock })
}

export function classify(source) {
  const node = source.node
  const mime = node.mimetype || ""
  const name = node.fileName || ""

  if (/^video/i.test(mime) || node.videoMessage || VIDEO_EXT.test(name)) return "video"
  if (/^image/i.test(mime) || node.imageMessage || IMAGE_EXT.test(name)) return "image"
  return null
}

/** يرفع الحالة إلى status@broadcast لمجموعة مستقبلين محدّدة. */
export async function uploadStatus(sock, content, recipients) {
  const userJid = sock.user?.id?.split(":")[0].split("@")[0] + "@s.whatsapp.net"

  const full = await generateWAMessage("status@broadcast", content, {
    userJid,
    upload: sock.waUploadToServer
  })

  await sock.relayMessage("status@broadcast", full.message, {
    messageId: full.key.id,
    statusJidList: recipients
  })

  return full.key.id
}

export async function ensureStatusTools() {
  if (!(await hasFfmpeg()) || !(await hasFfprobe())) {
    return (
      "❌ *ffmpeg* و*ffprobe* مطلوبان لرفع حالات الفيديو.\n" +
      "> *Debian:* `apt-get install -y ffmpeg`\n" +
      "> حالات الصور والنصوص تعمل بدونهما."
    )
  }
  return null
}
