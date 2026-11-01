import { ITEMS } from '../../core/gamedata.js'

export default {
  name: ["tienda", "shop", "المتجر", "متجر"],
  description: { es: 'Muestra los items disponibles para comprar', ar: 'يعرض العناصر المتاحة للشراء' },
  category: "economy, الاقتصاد",
  ownerOnly: false,

  async run({ reply, react, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    await react('🛒')

    const genericos = Object.entries(ITEMS).filter(([, i]) => !i.restriccion)
    const exclusivos = Object.entries(ITEMS).filter(([, i]) => i.restriccion)

    let texto = tr(`🛒 *Tienda de Fragmentos*\n╰━━━━━━(☆)━━━━━━─╮\n\n`, `🛒 *متجر الشظايا*\n╰━━━━━━(☆)━━━━━━─╮\n\n`)
    texto += `*── Objetos generales (cualquier personaje) ──*\n\n`

    for (const [id, item] of genericos) {
      texto += `*${item.nombre}*\n`
      texto += `   💰 ${item.precio.toLocaleString()} Fragmentos | ⚡ Poder: ${item.poder}\n`
      texto += `   🆔 \`${id}\`\n\n`
    }

    texto += `*── Objetos exclusivos por personaje ──*\n\n`

    for (const [id, item] of exclusivos) {
      texto += `*${item.nombre}*\n`
      texto += `   💰 ${item.precio.toLocaleString()} Fragmentos | ⚡ Poder: ${item.poder}\n`
      texto += `   🔒 Solo: *${item.restriccion}*\n`
      texto += `   🆔 \`${id}\`\n\n`
    }

    texto += tr(`> Usá *.comprar <ID>* para comprar\n> Usá *.equipar <ID> <personaje>* para equiparlo`, `> استخدم *.comprar <ID>* للشراء\n> استخدم *.equipar <ID> <شخصية>* لتجهيزه`)

    await reply({ text: texto })
  }
}