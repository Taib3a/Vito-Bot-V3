import { getVoip } from "../../اضافات/محركات.js"

export default {
  name: ["مكالمات-واردة"],
  description: "يعرض المكالمات الواردة الرنّانة",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, reply, react }) {
    await react("📥")
    try {
      const voip = getVoip(sock)
      await voip.listen()
      const list = voip.incoming()

      if (!list.length) {
        return reply({ text: "📥 *لا توجد مكالمات واردة الآن.*" })
      }

      const lines = ["📥 *المكالمات الواردة:*", ""]
      list.forEach((c, i) => {
        lines.push(
          `*${i + 1}.* من: ${c.from || "غير معروف"}` +
            `\n> النوع: ${c.isVideo ? "مرئية 🎥" : "صوتية 🎙️"}` +
            (c.isGroup ? "\n> مكالمة جماعية 👥" : "") +
            (c.canAccept ? "" : "\n> ⚠️ لا يمكن قبولها حالياً") +
            `\n> المعرّف: \`${c.id}\``
        )
      })
      lines.push("", "> للقبول: *.قبول-مكالمة <المعرّف>* · للرفض: *.رفض-مكالمة <المعرّف>*")

      return reply({ text: lines.join("\n") })
    } catch (e) {
      await react("❌")
      return reply({ text: `❌ تعذّر جلب المكالمات الواردة: ${e?.message || e}` })
    }
  }
}
