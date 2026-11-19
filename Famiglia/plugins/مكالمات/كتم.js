import { currentCall } from "../../Corleone/اضافات/مكالمات/ربط.js"

export default {
  name: ["كتم"],
  description: "يكتم الميكروفون ويوقف الفيديو مؤقتاً في المكالمة الجارية",
  category: "مكالمات",
  ownerOnly: true,

  async run({ from, reply, react }) {
    const call = currentCall(from)
    if (!call) return reply({ text: "❌ لا توجد مكالمة جارية في هذه المحادثة." })

    await react("🎙️")
    const nowSilenced = await call.silent()
    return reply({
      text: nowSilenced
        ? "🔇 *تم الكتم:* أُوقف الميكروفون والفيديو."
        : "🔊 *تم الإرجاع:* عاد الميكروفون والفيديو للعمل."
    })
  }
}
