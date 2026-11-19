import { getVoip } from "../_محرّكات/مكالمات/ربط.js"

export default {
  name: ["معاينة-مكالمة"],
  description: "يعرض معلومات رابط مكالمة قبل الانضمام إليه",
  category: "مكالمات",
  ownerOnly: true,

  async run({ sock, reply, react, args }) {
    const link = args.find((a) => /^https?:\/\//i.test(a))
    if (!link) {
      return reply({ text: "❌ *طريقة الاستخدام:* *.معاينة-مكالمة <رابط>*" })
    }

    await react("🔍")
    try {
      const voip = getVoip(sock)
      const info = await voip.previewLink(link)

      const lines = ["🔍 *معاينة المكالمة:*"]
      if (info?.isVideo !== undefined) lines.push(`> النوع: ${info.isVideo ? "مرئية 🎥" : "صوتية 🎙️"}`)
      if (info?.callId) lines.push(`> المعرّف: ${info.callId}`)
      if (info?.creator) lines.push(`> المنشئ: ${info.creator}`)
      if (info?.participants !== undefined) {
        const count = Array.isArray(info.participants) ? info.participants.length : info.participants
        lines.push(`> المشاركون: ${count}`)
      }
      if (info?.requireApproval !== undefined) {
        lines.push(`> موافقة مطلوبة: ${info.requireApproval ? "نعم 🔐" : "لا"}`)
      }
      if (lines.length === 1) lines.push(`> \`\`\`${JSON.stringify(info, null, 2).slice(0, 800)}\`\`\``)
      lines.push("", "> للانضمام: *.انضمام-مكالمة <الرابط>*")

      return reply({ text: lines.join("\n") })
    } catch (e) {
      await react("❌")
      return reply({ text: `❌ فشل قراءة الرابط: ${e?.message || e}` })
    }
  }
}
