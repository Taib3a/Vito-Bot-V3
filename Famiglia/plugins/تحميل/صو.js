import axios from 'axios'
import yts from 'yt-search'

const ID_RE = /(?:youtu\.be\/|v=|shorts\/)([\w-]{11})/

const APIS = [
  {
    // الأسرع والأثبت: يردّ في ~1 ثانية ويُرجع صوتاً فعلاً.
    // ينجح في فيديوهات يفشل فيها ytmp3 (بلا رابط) ويُبطئه ytmp4v2 (مهلة).
    name: 'alyacore-fast',
    endpoint: 'https://api.alyacore.xyz/dl/fastytmp3',
    apikey: 'Duarte-zz12',
    timeout: 20000,
    parse: data => {
      const d = data?.data || data?.result || data
      const url = d?.dl || d?.download || d?.url || d?.link
      const title = d?.title || data?.title
      return url ? { url, title } : null
    }
  },
  {
    name: 'alyacore-mp3',
    endpoint: 'https://api.alyacore.xyz/dl/ytmp3',
    apikey: 'Duarte-zz12',
    timeout: 30000, // قللت المهلة من 60 لـ 30 ثانية
    parse: data => {
      const d = data?.data || data?.result || data
      const url = d?.dl || d?.download || d?.url || d?.link
      const title = d?.title || data?.title
      return url ? { url, title } : null
    }
  },
  {
    name: 'alyacore-mp4v2',
    endpoint: 'https://api.alyacore.xyz/dl/ytmp4v2',
    apikey: 'Duarte-zz12',
    timeout: 30000,
    parse: data => {
      const d = data?.data || data?.result || data
      const url = d?.dl || d?.download || d?.url || d?.link
      const title = d?.title || data?.title
      return url ? { url, title } : null
    }
  }
]

const fetchData = async url => {
  for (const api of APIS) {
    try {
      const { data } = await axios.get(api.endpoint, {
        params: { url, apikey: api.apikey },
        timeout: api.timeout
      })
      const media = api.parse(data)
      if (media?.url) return media
    } catch (e) {
      console.error(`[play] ${api.name} فشل:`, e.message)
    }
  }
  return null
}

const cleanFileName = name =>
  String(name).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'audio'

export default {
  name: ["صو", "صوت", "اغنيه"],
  description: 'ينزّل صوت من يوتيوب - نسخة سريعة',
  category: "التحميل",
  ownerOnly: false,

  async run({ sock, from, msg, react, reply, text }) {
    try {
      if (!text) return reply({ text: '✧ أدخل اسماً أو رابطاً' })
      await react('🔍')

      const id = text.match(ID_RE)?.[1]
      let info = null

      // لو رابط، متدورش، هات المعلومات على طول
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
      if (!videoUrl) return reply({ text: '❌ لا نتائج' })

      const data = await fetchData(videoUrl)
      if (!data) {
        await react('❌')
        return reply({ text: '❌ خطأ في الواجهة' })
      }

      const mediaUrl = data.url
      const title = data.title || info?.title || 'audio'
      const channel = info?.author?.name || 'YouTube'
      const views = info?.views ? info.views.toLocaleString('en-US') : ''
      const duration = info?.timestamp || 'غير معروفة'
      const thumb = info?.thumbnail || info?.image

      const infoText =
`【 🕴🏻 】 _تحميل الصوت_ ───── *${title}*_

> _📢 القناة ── ${channel}_
> _⏱️ المدة ── ${duration}_
${views ? `> _👁️ المشاهدات ── ${views}_\n` : ''}> _📦 الصيغة ── MP3_

> _── جاري إرسال الصوت، يرجى الانتظار..._`

      // ⚡ السرعة هنا: ابعت الصورة والصوت مع بعض مش ورا بعض
      // لو الفيديو اكتر من 20 دقيقة ابعته مستند
      const isLong = (info?.seconds || 0) > 1200

      const audioMsg = isLong
        ? { document: { url: mediaUrl }, mimetype: 'audio/mpeg', fileName: `${cleanFileName(title)}.mp3`, caption: `> ${title}` }
        : { audio: { url: mediaUrl }, mimetype: 'audio/mpeg', fileName: `${cleanFileName(title)}.mp3` }

      if (thumb) {
        await Promise.all([
          sock.sendMessage(from, { image: { url: thumb }, caption: infoText }, { quoted: msg }),
          sock.sendMessage(from, audioMsg, { quoted: msg })
        ])
      } else {
        await sock.sendMessage(from, { ...audioMsg, caption: infoText }, { quoted: msg })
      }

      await react('✅')
    } catch (error) {
      console.error(error)
      await react('❌')
      await reply({ text: `❌ خطأ: ${error.message}` })
    }
  }
}
