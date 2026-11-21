import { execFile } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import axios from "axios"
import { findChannel, channelNames, GROUPS, COUNTRIES_TREE } from "./قنوات.js"

export { channelNames, findChannel, GROUPS, COUNTRIES_TREE }

// ── أدوات مساعدة ────────────────────────────────────────────────

const PAGE_TIMEOUT = 15_000
const YTDLP_TIMEOUT = 60_000

const AUDIO_MIME_RE = /^(audio\/|application\/(ogg|x-mpegurl|vnd\.apple\.mpegurl))|mpegurl/i
const VIDEO_MIME_RE = /^(video\/)/i
const PLAYLIST_RE = /#EXTM3U/i

const DIRECT_EXT_RE = /\.(mp3|aac|m4a|ogg|opus|flac|wav|m3u8|mpd|mp4|webm|mov|mkv|m4v|3gp|ts)(\?|#|$)/i
const PAGE_EXT_RE = /\.(php|html?|aspx?|jsp|do|cgi)(\?|#|$)/i

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0"

function isHttp(value) {
  return /^https?:\/\//i.test(String(value || ""))
}

function isYouTube(value) {
  return /(youtube\.com|youtu\.be)/i.test(String(value || ""))
}

// yt-dlp قد يكون خارج PATH (مثل ~/.local/bin)
export function resolveYtDlp() {
  const candidates = [
    process.env.YTDLP_PATH,
    path.join(os.homedir(), ".local", "bin", "yt-dlp"),
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
    "/opt/homebrew/bin/yt-dlp"
  ].filter(Boolean)
  const found = candidates.find((c) => {
    try {
      return fs.existsSync(c)
    } catch {
      return false
    }
  })
  return found || "yt-dlp"
}

function headRequest(url) {
  return axios({
    method: "head",
    url,
    timeout: PAGE_TIMEOUT,
    maxRedirects: 5,
    validateStatus: (s) => s >= 200 && s < 400,
    headers: { "User-Agent": UA, Accept: "*/*" }
  })
}

function getPage(url) {
  return axios({
    method: "get",
    url,
    timeout: PAGE_TIMEOUT,
    maxRedirects: 5,
    responseType: "text",
    validateStatus: (s) => s >= 200 && s < 400,
    maxContentLength: 6 * 1024 * 1024,
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" }
  })
}

// يستخرج مرشّحي البث من صفحة HTML: src/href/data-* ثم أي رابط مباشر
function candidatesFromHtml(html, baseUrl) {
  const text = String(html || "")
  const out = []
  const push = (value) => {
    if (!value) return
    let abs
    try {
      abs = new URL(value, baseUrl).href
    } catch {
      return
    }
    if (!isHttp(abs)) return
    if (!out.includes(abs)) out.push(abs)
  }

  const attrRe = /(?:src|href|data-[a-z-]+)\s*=\s*["']([^"']+)["']/gi
  let m
  while ((m = attrRe.exec(text))) {
    const v = m[1].trim()
    if (DIRECT_EXT_RE.test(v) || /\/(stream|live|radio|hls|playlist)\b/i.test(v)) push(v)
  }

  const bareRe = /https?:\/\/[^\s"'<>\\]+/gi
  while ((m = bareRe.exec(text))) {
    const v = m[0]
    if (DIRECT_EXT_RE.test(v)) push(v)
  }
  return out
}

// يفحص نوع المحتوى فعلياً عبر HEAD (أو GET جزئي عند رفض HEAD)
async function probeContentType(url) {
  try {
    const res = await headRequest(url)
    const ct = String(res.headers?.["content-type"] || "")
    return { contentType: ct, ok: true }
  } catch {
    try {
      const res = await axios({
        method: "get",
        url,
        timeout: PAGE_TIMEOUT,
        maxRedirects: 5,
        responseType: "stream",
        headers: { "User-Agent": UA, Range: "bytes=0-1023" },
        validateStatus: (s) => s >= 200 && s < 400
      })
      const ct = String(res.headers?.["content-type"] || "")
      res.data?.destroy?.()
      return { contentType: ct, ok: true }
    } catch {
      return { contentType: "", ok: false }
    }
  }
}

function looksLikeStream(contentType, url) {
  if (PLAYLIST_RE.test(contentType)) return true
  if (AUDIO_MIME_RE.test(contentType) || VIDEO_MIME_RE.test(contentType)) return true
  if (/mpegurl|m3u8|dash\+xml/i.test(contentType)) return true
  return /\.(m3u8|mpd)(\?|#|$)/i.test(url)
}

// يقرأ أول بايتات الرابط فقط ثم يُغلق الاتصال — البثّ الحيّ لا ينتهي أبداً
function fetchHead(url) {
  return new Promise((resolve, reject) => {
    let settled = false
    let timer = null
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(value)
    }
    timer = setTimeout(() => finish(reject, new Error("مهلة قراءة البث")), PAGE_TIMEOUT)

    axios({
      method: "get",
      url,
      timeout: PAGE_TIMEOUT,
      maxRedirects: 5,
      responseType: "stream",
      headers: { "User-Agent": UA, Range: "bytes=0-2047" },
      validateStatus: (s) => s >= 200 && s < 400
    })
      .then((res) => {
        const contentType = String(res.headers?.["content-type"] || "")
        const stream = res.data
        let body = ""
        const done = () => finish(resolve, { body: body.slice(0, 2048), contentType })
        stream.on("data", (chunk) => {
          body += chunk.toString("utf8")
          if (body.length >= 2048 || PLAYLIST_RE.test(body)) {
            stream.destroy()
            done()
          }
        })
        stream.on("end", done)
        stream.on("error", (err) => finish(reject, err))
      })
      .catch((err) => finish(reject, err))
  })
}

function extractYouTube(ytDlp, url) {
  return new Promise((resolve, reject) => {
    execFile(
      ytDlp,
      ["-f", "bestaudio/best", "-g", "--no-warnings", "--no-playlist", url],
      { timeout: YTDLP_TIMEOUT, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(new Error(`تعذّر استخراج رابط البث: ${String(err.message).split("\n")[0]}`))
        const found = String(stdout)
          .split("\n")
          .map((l) => l.trim())
          .find((l) => isHttp(l))
        if (!found) return reject(new Error("لم يُعِد yt-dlp رابط بث صالحاً"))
        resolve(found)
      }
    )
  })
}

/**
 * يحلّ أي رابط إلى رابط بث قابل للتشغيل.
 * - يوتيوب → yt-dlp
 * - رابط بث مباشر → كما هو
 * - صفحة HTML → يستخرج روابط البث منها ويفحصها
 * يُعيد { url, isLive, via, candidates }
 */
export async function resolveStreamUrl(input) {
  const raw = String(input || "").trim()
  if (!raw) throw new Error("رابط أو اسم قناة مطلوب")

  // اسم قناة عربية معروفة
  if (!isHttp(raw)) {
    const channel = findChannel(raw)
    if (!channel) {
      throw new Error(`قناة غير معروفة: ${raw}\n> استخدم *.قنوات* لعرض القائمة`)
    }
    return { url: channel.url, isLive: true, via: "channel", channel: channel.name, candidates: [channel.url] }
  }

  const url = raw

  if (isYouTube(url)) {
    const resolved = await extractYouTube(resolveYtDlp(), url)
    return { url: resolved, isLive: false, via: "yt-dlp", candidates: [resolved] }
  }

  // رابط امتداده صريح للبث → نفحصه فقط
  if (/\.(m3u8|mpd|mp3|aac|m4a|ogg|opus|flac|wav|mp4|webm)(\?|#|$)/i.test(url)) {
    return { url, isLive: /\.(m3u8|mpd)(\?|#|$)/i.test(url), via: "direct", candidates: [url] }
  }

  const { contentType } = await probeContentType(url)
  if (looksLikeStream(contentType, url)) {
    return { url, isLive: PLAYLIST_RE.test(contentType), via: "direct", candidates: [url] }
  }

  // ليست بثاً → صفحة HTML، نستخرج منها
  if (!PAGE_EXT_RE.test(url) && contentType && !/text\/html/i.test(contentType)) {
    // نوع غير معروف لكن ليس صفحة → نجرّبه كما هو
    return { url, isLive: false, via: "direct", candidates: [url] }
  }

  const page = await getPage(url)
  const candidates = candidatesFromHtml(page.data, url)
  if (candidates.length === 0) {
    throw new Error("لم يُعثر على رابط بث داخل الصفحة")
  }

  // روابط "الصيانة"/"قريباً" ليست بثاً حقيقياً
  const isMaintenance = (u) => /(maintenance|soon|offline|test\.m3u8)/i.test(u)
  const ordered = [...candidates.filter((c) => !isMaintenance(c)), ...candidates.filter(isMaintenance)]

  const working = []
  for (const candidate of ordered) {
    try {
      const head = await fetchHead(candidate)
      const playlist = PLAYLIST_RE.test(head.body)
      const media = AUDIO_MIME_RE.test(head.contentType) || VIDEO_MIME_RE.test(head.contentType)
      if (!playlist && !media) continue
      if (playlist && /maintenance\d*\.ts/i.test(head.body)) continue
      working.push({ candidate, playlist, body: head.body, contentType: head.contentType })
    } catch {
      continue
    }
  }

  if (!working.length) {
    throw new Error(`فُحصت ${candidates.length} روابط ولم يعمل أيّها كبث`)
  }

  // مانيفست الفيديو وحده يخلو من الصوت (الصوت في مسار منفصل يربطه المانيفست
  // الرئيسي). نفضّل الرئيسي، وإلا خرج البثّ صامتاً.
  const isMaster = (w) => /#EXT-X-STREAM-INF/i.test(w.body)
  const best = working.find(isMaster) || working[0]

  return {
    url: best.candidate,
    isLive: best.playlist || /mpegurl/i.test(best.contentType),
    via: "page",
    candidates,
    // مانيفست فيديو مجرّد: الصوت في مسار منفصل، فيُدمج بـ ffmpeg
    videoOnly: best.playlist && !isMaster(best)
  }
}
