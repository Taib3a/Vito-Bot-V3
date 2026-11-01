import { removeSubbot, activeBots } from '../../core/subbotManager.js'

export default {
  name: ["delbot", "desconectar", "حذف-بوت"],
  description: { es: 'Desvincula tu número como subbot', ar: 'يفصل رقمك عن البوت الفرعي' },
  category: "sockets, البوتات الفرعية",
  ownerOnly: false,

  async run({ senderNum, react, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    await react('🗑️')

    const id = `sub_${senderNum}`

    if (!activeBots.has(id)) {
      return await reply({ text: tr(`❌ No tienes ningún subbot vinculado.`, `❌ ليس لديك أي بوت فرعي مرتبط.`) })
    }

    removeSubbot(id)
    await reply({ text: tr(`✅ Tu subbot fue desvinculado y la sesión eliminada.`, `✅ فُصل بوتك الفرعي وحُذفت الجلسة.`) })
  }
}