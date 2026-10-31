import { db } from '../../database/db.js'

const ITEMS_INFO = {
  pala: { nombre: '🪏 Pala', bonus: 50 },
  pico: { nombre: '⛏️ Pico', bonus: 120 },
  katana_maldita: { nombre: '🗡️ Katana maldita', bonus: 300 },
  cristal_dominio: { nombre: '💎 Cristal de dominio', bonus: 600 },
}

export default {
  name: ["inventario", "inv", "حقيبة", "المخزون"],
  description: 'Muestra tu inventario de items',
  category: "economy, الاقتصاد",
  ownerOnly: false,

  async run({ sender, reply, react, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const eco = db.getEco(sender)

    if (!eco.inventario.length) {
      return await reply({
        text: tr(`🎒 Tu inventario está vacío.\n\n> Usá *.tienda* para ver los items disponibles`, `🎒 حقيبتك فارغة.\n\n> استخدم *.tienda* لعرض العناصر المتاحة`)
      })
    }

    let bonusTotal = 0
    let texto = `🎒 *Tu inventario*\n` +
      `╰━━━━━━(☆)━━━━━━─╮\n\n`

    for (const itemId of eco.inventario) {
      const info = ITEMS_INFO[itemId]
      if (info) {
        bonusTotal += info.bonus
        texto += `*${info.nombre}*\n`
        texto += `   ⚡ Bonus: +${info.bonus} Fragmentos/trabajo\n\n`
      }
    }

    texto += `*📊 Bonus total por trabajo:* +${bonusTotal} Fragmentos`

    await react('🎒')
    await reply({ text: texto })
  }
}