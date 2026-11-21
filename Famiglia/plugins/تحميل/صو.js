import axios from "axios"
import yts from "yt-search"

const LIMIT_MB = 80
const LONG_VIDEO_SECONDS = 1200
const ID_RE = /(?:youtu\.be\/|v=|shorts\/)([\w-]{11})/

// ytmp3 وحده: ytmp4v2 يُرجع فيديو (video/mp4)، فلا يصلح احتياطاً للصوت.
const API = {
  endpoint: "https://api.alyacore.xyz/dl/ytmp3",
  apikey: "Duarte-zz12",
  tries: 3,
  timeout: 60000
}

const fetchAudio = async (url) => {
  for (let i = 0; i < API.tries; i++) {
    try {
      const { data } = await axios.get(API.endpoint, {
        params: { url, apikey: API.apikey },
        timeout: API.timeout
      })
      const d = data?.data || data?.result || data
      const link = d?.dl || d?.download || d?.url || d?.link
      if (link) return { url: link, title: d?.title || data?.title, meta: d }
    } catch (e) {
      console.error(`[صو] ytmp3 فشل (${i + 1}/${API.tries}):`, e.message)
    }
  }
  return null
}

const getSize = async (url) => {
  try {
    const head = await axios.head(url, { timeout: 4000, maxRedirects: 5 })
    return Number(head.headers["content-length"]) || 0
  } catch {
    return 0
  }
}

const cleanFileName = (name) =>
  String(name).replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 100) || "audio"

const formatNum = (n) => {
  if (!n && n !== 0) return "غير معروف"
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M"
  if (n >= 1000) return (n / 1000).toFixed(1) + "K"
  return String(n)
}

const formatViews = (n) => {
  if (!n && n !== 0) return "غير معروف"
  return n.toLocaleString("en-US") + " مشاهدة"
}

export default {
  name: ["صو", "صوت", "اغنيه"],
  description: "ينزّل صوتاً من يوتيوب مع معلومات الأغنية",
  category: "التحميل",
  ownerOnly: false,

  async run({ sock, from, msg, react, reply, text }) {
    try {
      if (!text) return reply({ text: "✧ أدخل اسماً أو رابطاً" })

      await react("🔍")

      const id = text.match(ID_RE)?.[1]
      let info = null

      if (id) {
        try {
          const v = await yts({ videoId: id })
          if (v && v.url) info = v
        } catch {}
      }

      if (!info) {
        const search = await yts(text).catch(() => null)
        info = search?.videos?.[0] || null
      }

      const videoUrl = info?.url || (id ? `https://youtu.be/${id}` : text)
      if (!videoUrl) {
        await react("❌")
        return reply({ text: "❌ لا نتائج" })
      }

      const data = await fetchAudio(videoUrl)
      if (!data) {
        await react("❌")
        return reply({ text: "❌ فشلت كل المحاولات — الواجهة لا تستجيب" })
      }

      const mediaUrl = data.url
      const title = data.title || info?.title || "audio"

      // الحقول التي تغطّيها نتائج البحث تُقدَّم عليها: الواجهة تُرجع التاريخ
      // بلغة أخرى (hace 17 años)، و yt-search يعطي تاريخاً محايداً.
      const channel = info?.author?.name || data.meta?.author || "غير معروف"
      const views = formatViews(info?.views)
      const likes = formatNum(info?.likes)
      const duration = info?.timestamp || data.meta?.duration || "غير معروف"
      const uploaded = info?.uploadDate || info?.ago || data.meta?.date || "غير معروف"
      const thumb = data.meta?.thumbnail || info?.thumbnail || info?.image

      const size = await getSize(mediaUrl)
      const sizeMB = size / 1024 / 1024
      const sizeLabel = size ? ` ( ${sizeMB.toFixed(2)} MB )` : ""

      const infoText = `╭─── 🎵 *معلومات الاغنية* ───╮
│
│ 📌 *العنوان:*
│ ${title}
│
│ 👤 *القناة:* ${channel}
│ 👀 *المشاهدات:* ${views}
│ ❤️ *اللايكات:* ${likes}
│ ⏱️ *المدة:* ${duration}
│ 📅 *اتنشرت:* ${uploaded}
│ 💾 *الحجم:* ${size ? sizeMB.toFixed(2) + " MB" : "غير معروف"}
│ 🔗 *الرابط:* ${videoUrl}
│
╰──────────────────╯
> جاري تحميل الصوت... 🎧`

      if (thumb) {
        await sock.sendMessage(from, { image: { url: thumb }, caption: infoText }, { quoted: msg })
      } else {
        await reply({ text: infoText })
      }

      const caption = `> ${title}${sizeLabel}`
      // المستند لما يتجاوز الحدّ أو يطول بلا حجم معروف؛ وإلا صوت عادي.
      const asDocument = size ? sizeMB >= LIMIT_MB : (info?.seconds || 0) > LONG_VIDEO_SECONDS

      const fileName = `${cleanFileName(title)}.mp3`
      await sock.sendMessage(
        from,
        asDocument
          ? { document: { url: mediaUrl }, mimetype: "audio/mpeg", fileName, caption }
          : { audio: { url: mediaUrl }, mimetype: "audio/mpeg", fileName },
        { quoted: msg }
      )

      await react("✅")
    } catch (error) {
      console.error(error)
      await react("❌")
      await reply({ text: `❌ خطأ: ${error.message}` })
    }
  }
}
