import { searchYouTube, youtubeAudioBuffer, cleanFileName, LIMIT_MB, MEDIA_OPTS } from "../../المصادر.js"

export default {
  name: ["اغنية"],
  description: "يبحث عن أغنية وينزّلها صوتاً من يوتيوب",
  category: "التحميل",

  async run({ sock, from, msg, reply, react, text, args }) {
    const query = (text || args.join(" ")).trim()
    if (!query) {
      return reply({
        text:
          "🎵 *طريقة الاستخدام:*\n" +
          "> *.اغنية <اسم الأغنية أو الفنان>*\n" +
          "> *.اغنية <رابط يوتيوب>*\n\n" +
          "*مثال:* `.اغنية Adele Hello`"
      })
    }

    await react("🎧")

    try {
      const results = await searchYouTube(query, 1)
      if (!results.length) {
        await react("❌")
        return reply({ text: "❌ لم أجد نتائج." })
      }

      const video = results[0]
      const { buffer } = await youtubeAudioBuffer(video.url)

      const sizeMB = buffer.length / 1024 / 1024
      const fileName = `${cleanFileName(video.title)}.mp3`

      if (sizeMB >= LIMIT_MB) {
        await sock.sendMessage(
          from,
          {
            document: buffer,
            mimetype: "audio/mpeg",
            fileName,
            caption: `🎵 *${video.title}*\n> أُرسل كمستند بسبب الحجم (${sizeMB.toFixed(1)} م.ب)`
          },
          { quoted: msg, ...MEDIA_OPTS }
        )
      } else {
        await sock.sendMessage(
          from,
          {
            audio: buffer,
            mimetype: "audio/mpeg",
            fileName,
            ptt: false
          },
          { quoted: msg, ...MEDIA_OPTS }
        )
        await reply({
          text: `🎵 *${video.title}*\n> القناة: ${video.channel}\n> المدة: ${video.duration}\n> الحجم: ${sizeMB.toFixed(1)} م.ب`
        })
      }

      await react("✅")
    } catch (e) {
      await react("❌")
      await reply({ text: `❌ تعذّر التنزيل: ${e.message}` })
    }
  }
}
