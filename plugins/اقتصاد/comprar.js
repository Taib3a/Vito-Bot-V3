import { db } from '../../database/db.js'
import { ITEMS } from '../../core/gamedata.js'

export default {
  name: ["comprar", "buy", "شراء", "اشتري"],
  description: 'Compra un item de la tienda',
  category: "economy, الاقتصاد",
  ownerOnly: false,

  async run({ sender, args, reply, react, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const itemId = args[0]?.toLowerCase()

    if (!itemId) {
      return await reply({ text: tr(`⚠️ Especifica el ID del item.\n\n*Ejemplo:* .comprar pala\n\n> Usá *.tienda* para ver los items disponibles`, `⚠️ حدّد معرّف العنصر.\n\n*مثال:* .comprar pala\n\n> استخدم *.tienda* لعرض العناصر المتاحة`) })
    }

    const item = ITEMS[itemId]
    if (!item) {
      return await reply({ text: tr(`❌ Item no encontrado.\n\n> Usá *.tienda* para ver los items disponibles`, `❌ العنصر غير موجود.\n\n> استخدم *.tienda* لعرض العناصر المتاحة`) })
    }

    const eco = db.getEco(sender)

    if (eco.inventario.includes(itemId)) {
      return await reply({ text: tr(`❌ Ya tenés *${item.nombre}* en tu inventario.`, `❌ لديك *${item.nombre}* بالفعل في حقيبتك.`) })
    }

    if (eco.bolsillo < item.precio) {
      const faltante = item.precio - eco.bolsillo
      return await reply({
        text: tr(`❌ No tenés suficientes Fragmentos.\n\n`, `❌ ليس لديك شظايا كافية.\n\n`) +
          `*Precio:* ${item.precio.toLocaleString()} Fragmentos\n` +
          `*Bolsillo:* ${eco.bolsillo.toLocaleString()} Fragmentos\n` +
          `*Te faltan:* ${faltante.toLocaleString()} Fragmentos`
      })
    }

    const nuevoInventario = [...eco.inventario, itemId]
    db.setEco(sender, {
      bolsillo: eco.bolsillo - item.precio,
      inventario: nuevoInventario
    })

    await react('✅')
    await reply({
      text: tr(`✅ *Compra exitosa*\n\n`, `✅ *تم الشراء بنجاح*\n\n`) +
        `*Item:* ${item.nombre}\n` +
        `*Precio pagado:* ${item.precio.toLocaleString()} Fragmentos\n` +
        `*Bolsillo restante:* ${(eco.bolsillo - item.precio).toLocaleString()} Fragmentos\n\n` +
        `> Usá *.equipar ${itemId} <personaje>* para dárselo a un personaje`
    })
  }
}