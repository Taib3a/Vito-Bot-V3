import { hasFfmpeg, hasFfprobe } from "../../اضافات/محركات.js"

export default {
  name: ["مكالمات-متطلبات"],
  description: "يفحص متطلبات تشغيل المكالمات على السيرفر",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, reply, react }) {
    await react("🔧")
    const ffmpeg = await hasFfmpeg()
    const ffprobe = await hasFfprobe()

    // واجهات بايلز اللازمة لبروتوكول المكالمات.
    const apis = {
      ws: !!sock?.ws,
      signalRepository: !!sock?.signalRepository,
      getUSyncDevices: typeof sock?.getUSyncDevices === "function",
      query: typeof sock?.query === "function",
      sendNode: typeof sock?.sendNode === "function"
    }
    const apisMissing = Object.entries(apis).filter(([, ok]) => !ok).map(([k]) => k)

    const mark = (ok) => (ok ? "✅" : "❌")
    const lines = [
      "🔧 *متطلبات المكالمات:*",
      "",
      `> ${mark(ffmpeg)} *ffmpeg* — للمكالمات ذات الوسائط`,
      `> ${mark(ffprobe)} *ffprobe* — لقراءة مدة/أبعاد الوسائط`,
      "",
      "*واجهات بايلز:*",
      ...Object.entries(apis).map(([k, ok]) => `> ${mark(ok)} ${k}`),
      "",
      `> نواة Node: ${process.version}`
    ]

    if (!ffmpeg || !ffprobe) {
      lines.push("", "⚠️ *ناقص:* ثبّت ffmpeg على السيرفر:", "> `apt-get install -y ffmpeg`")
      lines.push("> المكالمات الصامتة تعمل بدونه.")
    }
    if (apisMissing.length) {
      lines.push("", `⚠️ *واجهات ناقصة:* ${apisMissing.join(", ")}`, "> تحقّق من نسخة بايلز (يجب أن تدعم ws/signalRepository).")
    }
    if (ffmpeg && ffprobe && !apisMissing.length) {
      lines.push("", "✅ *كل المتطلبات متوفرة — المكالمات جاهزة.*")
    }

    return reply({ text: lines.join("\n") })
  }
}
