import axios from "axios"

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
