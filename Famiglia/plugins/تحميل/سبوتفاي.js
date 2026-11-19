import { spotifySearch, spotifyTrackFromUrl, spotifyToAudio, cleanFileName, MEDIA_OPTS } from "../../Corleone/الوسائط/المصادر.js"

const SPOTIFY_URL_RE = /open\.spotify\.com/i
const MAX_RESULTS = 5
const MAX_CHATS = 200

// آخر نتائج بحث لكل دردشة، ليختار المستخدم برقم.
const recentSearches = new Map()

function rememberSearch(from, results) {
  recentSearches.set(from, results)
  while (recentSearches.size > MAX_CHATS) {
    recentSearches.delete(recentSearches.keys().next().value)
  }
}

async function sendTrack({ sock, from, msg, reply, react, track }) {
  try {
    await react("⬇️")
    const { buffer, video } = await spotifyToAudio(track)
    const fileName = `${cleanFileName(track.title)}.mp3`
    const sizeMB = buffer.length / 1024 / 1024

    await sock.sendMessage(
      from,
      { audio: buffer, mimetype: "audio/mpeg", fileName, ptt: false },
      { quoted: msg, ...MEDIA_OPTS }
    )

    await reply({
      text:
        `🎧 *${track.title}*\n` +
        `> الفنان: ${track.artist}\n` +
        `> المدة: ${track.duration}\n` +
        `> الحجم: ${sizeMB.toFixed(1)} م.ب\n` +
        `> المصدر: ${video.title}`
    })
    await react("✅")
  } catch (e) {
    await react("❌")
    await reply({ text: `❌ تعذّر التنزيل: ${e.message}` })
  }
}

export default {
  name: ["سبوتفاي"],
  description: "يبحث في سبوتفاي أو ينزّل أغنية من رابط سبوتفاي",
  category: "التحميل",

  async run({ sock, from, msg, reply, react, text, args }) {
    const input = (text || args.join(" ")).trim()
    if (!input) {
      return reply({
        text:
          "🎧 *طريقة الاستخدام:*\n" +
          "> *.سبوتفاي <اسم الأغنية>* — بحث\n" +
          "> *.سبوتفاي <رقم> — تنزيل نتيجة من آخر بحث*\n" +
          "> *.سبوتفاي <رابط سبوتفاي>* — تنزيل مباشر\n\n" +
          "*مثال:* `.سبوتفاي Shape of You`"
      })
    }

    // اختيار نتيجة بالرقم من قائمة عرضها بحث سابق.
    const pick = /^\d+$/.test(input) ? Number(input) : null
    if (pick !== null) {
      const cached = recentSearches.get(from)
      if (!cached?.length) {
        return reply({ text: "❌ لا توجد نتائج محفوظة. ابحث أولاً بالأمر: `.سبوتفاي <اسم>`" })
      }
      const track = cached[pick - 1]
      if (!track) {
        return reply({ text: `❌ اختر رقماً بين 1 و ${cached.length}.` })
      }
      return sendTrack({ sock, from, msg, reply, react, track })
    }

    await react("🎧")

    try {
      // رابط سبوتفاي: نقرأ المسار مباشرة.
      if (SPOTIFY_URL_RE.test(input)) {
        const track = await spotifyTrackFromUrl(input)
        if (!track) {
          await react("❌")
          return reply({ text: "❌ تعذّرت قراءة الرابط. تأكد أنه رابط مسار عام (Track) وليس خاصاً." })
        }
        return sendTrack({ sock, from, msg, reply, react, track })
      }

      // بحث بالاسم.
      const results = await spotifySearch(input)
      if (!results.length) {
        await react("❌")
        return reply({ text: "❌ لم أجد نتائج في سبوتفاي." })
      }

      const top = results.slice(0, MAX_RESULTS)
      rememberSearch(from, top)

      await react("✅")
      const lines = top.map(
        (t, i) => `*${i + 1}.* ${t.title}\n> ${t.artist}${t.album ? ` · ${t.album}` : ""} · ${t.duration}`
      )

      return reply({
        text:
          `🎧 *نتائج سبوتفاي:* ${input}\n\n` +
          lines.join("\n\n") +
          `\n\n> للتنزيل: \`.سبوتفاي <رقم>\``
      })
    } catch (e) {
      await react("❌")
      await reply({ text: `❌ خطأ: ${e.message}` })
    }
  }
}
