import { db } from '../../database/db.js'

export default {
  name: ["setmeta", "اسم-الملصق"],
  description: { es: 'Cambia tu marca de agua para stickers', ar: 'يغيّر علامتك المائية للملصقات' },
  category: "stickers, الملصقات",
  ownerOnly: false,

  async run({ senderNum, text, react, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    await react('⚙️')

    if (!text) {
      return await reply({
        text:
          tr(`❌ Uso:\n`, `❌ الاستخدام:\n`) +
          `*.setmeta Autor*\n` +
          `*.setmeta Pack | Autor*\n\n` +
          `Ejemplo:\n` +
          `*.setmeta DuarteXV•404*\n` +
          `*.setmeta Yuta MD | DuarteXV*`
      })
    }

    const user = db.getUser(senderNum)

    // En SQLite, si no tiene configuración, text1 y text2 vienen como null
    if (user.text1 || user.text2) {
      return await reply({
        text: tr(`⚠️ Ya tienes una marca establecida.\nUsa *.delmeta* para eliminarla primero.`, `⚠️ لديك علامة معيّنة بالفعل.\nاستخدم *.delmeta* لحذفها أولاً.`)
      })
    }

    const texto = text.trim()
    let packName = ''
    let authorName = ''

    if (texto.includes('|')) {
      const [pack, author] = texto.split('|').map(v => v.trim())
      packName = pack || texto
      authorName = author || texto
    } else {
      packName = texto
      authorName = texto
    }

    // 🌟 AQUÍ ESTÁ EL CAMBIO: Guardar directamente en SQLite
    db.setUser(senderNum, { text1: packName, text2: authorName });

    await reply({
      text:
        tr(`✅ *Marca actualizada*\n\n`, `✅ *تم تحديث العلامة*\n\n`) +
        `📦 *Pack:* ${packName}\n` +
        `✍️ *Autor:* ${authorName}`
    })
    await react('✅')
  }
}