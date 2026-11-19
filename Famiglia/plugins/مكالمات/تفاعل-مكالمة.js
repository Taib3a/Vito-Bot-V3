import { currentCall } from "../_محرّكات/مكالمات/ربط.js"

export default {
  name: ["تفاعل-مكالمة"],
  description: "يرسل تفاعلاً بإيموجي داخل المكالمة الجارية",
  category: "مكالمات",
  ownerOnly: true,

  async run({ from, reply, react, args }) {
    const call = currentCall(from)
    if (!call) return reply({ text: "❌ لا توجد مكالمة جارية في هذه المحادثة." })

    const emoji = args[0] || "👍"
    await react("✨")
    const sent = call.react(emoji)
    return reply({
      text: sent
        ? `✨ *أُرسل التفاعل ${emoji}.*`
        : "⚠️ *تعذّر إرسال التفاعل* (قد تكون المكالمة لم تتصل بعد)."
    })
  }
}
