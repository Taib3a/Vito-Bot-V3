import { db } from '../../database/db.js'
import config from '../../config.js'

export default {
  name: ["delmeta", "حذف-اسم-الملصق"],
  description: 'Resetea tu marca de agua a la del bot',
  category: "stickers, الملصقات",
  ownerOnly: false,

  async run({ senderNum, react, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    await react('🗑️')

    const user = db.getUser(senderNum)

    if (!user.text1 && !user.text2) {
      return await reply({
        text: tr(`⚠️ No tienes ninguna marca establecida.`, `⚠️ ليس لديك أي علامة معيّنة.`)
      })
    }

    db.setUser(senderNum, {
      text1: null,
      text2: null
    })

    await reply({
      text: tr(`✅ *Marca reseteada* a la del bot\n\n📦 *Pack:* ${config.botname}\n✍️ *Autor:* ${config.author}`, `✅ *أُعيدت العلامة* إلى علامة البوت\n\n📦 *الحزمة:* ${config.botname}\n✍️ *المؤلف:* ${config.author}`)
    })

    await react('✅')
  }
}