// محرّكات مشتركة للإضافات — ملف واحد يجمع ما كانت تستورده الإضافات من أربعة ملفات.
//
//   1. متطلبات السيرفر  : hasFfmpeg · hasFfprobe · missingRequirements · mediaRequirementMessage
//   2. مصادر الوسائط    : يوتيوب (بحث + y2mate) وسبوتفاي (spotsaver)
//   3. رفع الحالات      : تطبيع الفيديو بـ ffmpeg ثم النشر إلى status@broadcast
//   4. جسر المكالمات    : واجهة محرّك VoIP (../index.js) + سجل المكالمات الجارية
//
// محرّك VoIP نفسه (55 ملفاً في Famiglia/) مقتبس من HIROBOT
// (github.com/HirooSy/HIROBOT) — رخصة غير تجارية.

import { execFile } from "node:child_process"
import axios from "axios"
import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { generateWAMessage, downloadMediaMessage } from "@whiskeysockets/baileys"
import Voip from "../index.js"
import os from "os"
import path from "path"
import fs from "fs"


/* ── متطلبات السيرفر — فحص ffmpeg/ffprobe ────────────────────────────────────── */

// يفحص توفّر ffmpeg/ffprobe على PATH مع تخزين النتيجة مؤقتاً.
const cache = new Map()

function probe(bin, timeout = 4000) {
  if (cache.has(bin)) return cache.get(bin)
  const p = new Promise((resolve) => {
    execFile(bin, ["-version"], { timeout }, (err) => resolve(!err))
  })
  cache.set(bin, p)
  return p
}

export function hasFfmpeg() {
  return probe("ffmpeg")
}

export function hasFfprobe() {
  return probe("ffprobe")
}

// يعيد قائمة بالنواقص؛ فارغة تعني أن كل المتطلبات متوفرة.
export async function missingRequirements({ media = false } = {}) {
  const missing = []
  if (!media) return missing
  if (!(await hasFfmpeg())) missing.push("ffmpeg")
  if (!(await hasFfprobe())) missing.push("ffprobe")
  return missing
}

export function mediaRequirementMessage(missing) {
  return (
    `❌ *متطلب ناقص على السيرفر:* ${missing.join(" · ")}\n\n` +
    `> المكالمات ذات الوسائط تحتاج *ffmpeg* و*ffprobe*.\n` +
    `> *Debian/Ubuntu:* \`apt-get install -y ffmpeg\`\n` +
    `> *Alpine:* \`apk add ffmpeg\`\n` +
    `> المكالمات الصامتة (*.مكالمة <رقم>*) تعمل بدونها.`
  )
}


/* ── مصادر الوسائط — يوتيوب (y2mate) وسبوتفاي (spotsaver) ────────────────────── */

// مصادر مشتركة لأوامر الصوت والسبوتفاي: بحث يوتيوب، استخراج الصوت عبر
// y2mate، وبحث سبوتفاي عبر spotsaver. الأوامر لا تكرّر هذا المنطق.

const FRAME_ORIGIN = "https://frame.y2meta-uk.com"
const Y2MATE_API = "https://cnv.cx/v2"
const SPOTIFY_BASE = "https://spotsaver.net"
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

export const ID_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/

export const LIMIT_MB = 80

export const MEDIA_OPTS = {
  options: {
    timeout: 0,
    maxRedirects: 10,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    headers: { "user-agent": UA }
  },
  mediaUploadTimeoutMs: 1000 * 60 * 60
}

// ── يوتيوب ────────────────────────────────────────────────────────────────

export async function searchYouTube(query, limit = 5) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=es`
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "es-ES,es;q=0.9",
      Cookie: "CONSENT=YES+1; SOCS=CAI"
    }
  })
  const html = await res.text()

  const match = html.match(/var ytInitialData\s*=\s*(\{.+?\});<\/script>/s)
  if (!match) throw new Error("تعذّرت قراءة صفحة يوتيوب")

  const data = JSON.parse(match[1])
  const sections =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || []

  const results = []
  for (const section of sections) {
    for (const item of section?.itemSectionRenderer?.contents || []) {
      const v = item.videoRenderer
      if (!v?.videoId || !v.lengthText) continue // يتخطّى البث والشورتس والإعلانات

      results.push({
        id: v.videoId,
        title: v.title?.runs?.[0]?.text || "بدون عنوان",
        channel: v.ownerText?.runs?.[0]?.text || "غير معروف",
        duration: v.lengthText?.simpleText || "--:--",
        views: v.viewCountText?.simpleText || "",
        url: `https://youtu.be/${v.videoId}`,
        thumb: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
      })
      if (results.length >= limit) return results
    }
  }
  return results
}

export async function videoInfo(query, id) {
  try {
    const results = await searchYouTube(id || query, 5)
    const v = id ? results.find((r) => r.id === id) : results[0]
    if (!v) return null
    return {
      id: v.id,
      url: v.url,
      title: v.title,
      duration: v.duration,
      views: v.views,
      thumbnail: v.thumb,
      channel: v.channel
    }
  } catch {
    return null
  }
}

export async function y2mateKey(videoId) {
  const res = await fetch(`${Y2MATE_API}/sanity/key?id=${encodeURIComponent(videoId)}`, {
    headers: {
      Origin: FRAME_ORIGIN,
      Referer: FRAME_ORIGIN + "/",
      Accept: "*/*",
      "Content-Type": "application/json",
      "User-Agent": UA
    }
  })
  if (!res.ok) throw new Error(`sanity/key ردّ بـ ${res.status}`)
  const data = await res.json()
  if (!data.key) throw new Error("sanity/key لم يُعِد مفتاحاً")
  return data.key
}

// يعيد رابط MP3 المؤقت من يوتيوب.
export async function youtubeAudioUrl(videoId, bitrate = "128") {
  const key = await y2mateKey(videoId)

  const body = new URLSearchParams({
    link: `https://youtu.be/${videoId}`,
    format: "mp3",
    audioBitrate: bitrate,
    videoQuality: "720",
    filenameStyle: "pretty",
    vCodec: "h264"
  })

  const res = await fetch(`${Y2MATE_API}/converter`, {
    method: "POST",
    headers: {
      Origin: FRAME_ORIGIN,
      Referer: FRAME_ORIGIN + "/",
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded",
      key,
      "User-Agent": UA
    },
    body
  })
  if (!res.ok) throw new Error(`المحوّل ردّ بـ ${res.status}`)

  const data = await res.json()
  if (!data.url) throw new Error("المحوّل لم يُعِد رابطاً")
  return { url: data.url, filename: data.filename || `${videoId}.mp3` }
}

export async function downloadBuffer(url, attempts = 3) {
  let lastError
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await axios.get(url, {
        responseType: "arraybuffer",
        // بلا مهلة يتعلّق النفق إلى الأبد عند انقطاع الاتصال.
        timeout: 120_000,
        maxRedirects: 10,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
          "User-Agent": UA,
          Origin: FRAME_ORIGIN,
          Referer: FRAME_ORIGIN + "/",
          Accept: "*/*"
        }
      })
      const buffer = Buffer.from(res.data)
      if (buffer.length) return buffer
      lastError = new Error("ملف فارغ")
    } catch (e) {
      lastError = e
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1200 * (i + 1)))
  }
  throw lastError
}

// ينزّل الصوت كاملاً في الذاكرة (للاستخدام في المكالمات أو الحفظ).
// نفق y2mate ينقطع أحياناً، فنعيد المحاولة بمفتاح ورابط جديدين.
export async function youtubeAudioBuffer(input, attempts = 3) {
  const id = ID_RE.exec(input)?.[1]
  if (!id) throw new Error("رابط يوتيوب غير صالح")

  let lastError
  for (let i = 0; i < attempts; i++) {
    try {
      const { url, filename } = await youtubeAudioUrl(id)
      const buffer = await downloadBuffer(url, 2)
      if (buffer?.length) return { buffer, filename, id }
      lastError = new Error("ملف الصوت فارغ")
    } catch (e) {
      lastError = e
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
  }
  throw lastError
}

// ── سبوتفاي ───────────────────────────────────────────────────────────────

function spotifyHeaders() {
  return {
    "User-Agent": UA,
    Accept: "application/json, text/plain, */*",
    Referer: SPOTIFY_BASE + "/id/",
    Origin: SPOTIFY_BASE
  }
}

function formatSeconds(total) {
  const n = Number(total)
  if (!Number.isFinite(n) || n <= 0) return "--:--"
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`
}

function pickSpotifyTrack(t) {
  if (!t) return null
  return {
    id: t.id ?? null,
    title: t.title ?? null,
    artist: t.artist ?? null,
    album: t.album ?? null,
    duration: formatSeconds(t.duration),
    thumbnail: t.thumbnail ?? null,
    spotifyUrl: t.id ? "https://open.spotify.com/track/" + t.id : null
  }
}

// spotsaver يعيد 308 على /api/spotify بلا شرطة أخيرة، لذا نستخدم الصيغة الصحيحة.
export async function spotifySearch(query) {
  const res = await fetch(`${SPOTIFY_BASE}/api/spotify/?q=${encodeURIComponent(query)}`, {
    headers: spotifyHeaders()
  })
  if (!res.ok) throw new Error(`بحث سبوتفاي ردّ بـ ${res.status}`)
  const data = await res.json()
  const items = Array.isArray(data?.items) ? data.items : []
  return items.map(pickSpotifyTrack).filter((t) => t?.title)
}

export async function spotifyTrackFromUrl(url) {
  const res = await fetch(`${SPOTIFY_BASE}/api/spotify/?url=${encodeURIComponent(url.split("?")[0])}`, {
    headers: spotifyHeaders()
  })
  if (!res.ok) throw new Error(`قراءة رابط سبوتفاي ردّت بـ ${res.status}`)
  const data = await res.json()
  const item = Array.isArray(data?.items) ? data.items[0] : null
  return pickSpotifyTrack(item)
}

// يحوّل مسار سبوتفاي إلى صوت: يبحث عنه في يوتيوب ثم ينزّله عبر y2mate.
export async function spotifyToAudio({ title, artist }) {
  const query = [title, artist].filter(Boolean).join(" ")
  const results = await searchYouTube(query, 5)
  if (!results.length) throw new Error("لم أجد الأغنية على يوتيوب")

  const { buffer } = await youtubeAudioBuffer(results[0].url)
  return { buffer, video: results[0] }
}

export function cleanFileName(name) {
  return (
    String(name)
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || "audio"
  )
}


/* ── رفع الحالات — تطبيع الفيديو ثم النشر إلى status@broadcast ───────────────── */

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


/* ── جسر المكالمات — واجهة محرّك VoIP لإضافات البوت ──────────────────────────── */

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

// يحلّل وسائط الأمر: روابط + ردّ على صوت/فيديو + دقة + auto/loop.
export async function parseMediaArgs(sock, msg, args, { skipIndexes = [] } = {}) {
  const rest = args.filter((_, i) => !skipIndexes.includes(i))
  const resolutionArg = rest.find((a) => RESOLUTION_RE.test(a))
  const urls = rest.filter((a) => /^https?:\/\//i.test(a) && !/call\.whatsapp\.com/i.test(a))
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
    autoEndCall: rest.some((a) => /^auto$/i.test(a)),
    loop: rest.some((a) => /^loop$/i.test(a)),
    isVideo,
    hasMedia: media.length > 0,
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
