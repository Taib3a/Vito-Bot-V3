import { channelNames } from "../../Corleone/بث/بث.js"

export default {
  name: ["قنوات", "القنوات"],
  description: "يعرض القنوات العربية المتاحة للبثّ في المكالمات",
  category: "مكالمات",
  ownerOnly: true,

  async run({ reply }) {
    const names = channelNames()
    const lines = names.map((n, i) => `> ${i + 1}. ${n}`)
    const chunks = []
    for (let i = 0; i < lines.length; i += 20) {
      chunks.push(lines.slice(i, i + 20).join("\n"))
    }

    await reply({
      text:
        `📺 *القنوات المتاحة (${names.length})*\n\n` +
        chunks[0] +
        (chunks[1] ? `\n\n${chunks[1]}` : "") +
        `\n\n💡 *للبثّ:*\n> *.مكالمة2 <اسم القناة>*\n` +
        `> *.مكالمة2 الجزيرة 720*`
    })
  }
}
