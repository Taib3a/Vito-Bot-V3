import { db } from '../../database/db.js'

const COOLDOWN = 60 * 60 * 1000 // 1 hora en ms

const TRABAJOS = [
  { texto: tr('⚔️ Exterminaste una maldición de grado 2', '⚔️ أهلكت لعنة من الدرجة الثانية'), base: 150 },
  { texto: tr('🩸 Completaste una misión de grado 3', '🩸 أكملت مهمة من الدرجة الثالثة'), base: 100 },
  { texto: tr('📜 Entregaste un informe al Jujutsu Tech', '📜 سلّمت تقريراً إلى Jujutsu Tech'), base: 80 },
  { texto: tr('🗡️ Sobreviviste a un dominio expandido', '🗡️ نجوت من سيطرة موسّعة'), base: 200 },
  { texto: tr('🏯 Patrullaste el perímetro de la escuela', '🏯 حرسْت محيط المدرسة'), base: 70 },
  { texto: tr('💀 Sellaste una maldición especial de grado 1', '💀 ختمت لعنة خاصة من الدرجة الأولى'), base: 300 },
  { texto: tr('🔮 Recolectaste energía maldita del ambiente', '🔮 جمعت طاقة ملعونة من المحيط'), base: 120 },
  { texto: tr('📦 Transportaste objetos malditos con seguridad', '📦 نقلت أشياء ملعونة بأمان'), base: 90 },
]

const BONUS_ITEMS = {
  'pala':              50,
  'pico':             120,
  'katana_maldita':   300,
  'cristal_dominio':  600,
}

export default {
  name: ["work", "trabajar", "عمل", "اعمل"],
  description: { es: 'Trabaja para ganar Fragmentos', ar: 'اعمل لتكسب الشظايا' },
  category: "economy, الاقتصاد",
  ownerOnly: false,

  async run({ sender, reply, react, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const eco = db.getEco(sender)
    const ahora = Date.now()
    const tiempoRestante = COOLDOWN - (ahora - eco.lastWork)

    if (tiempoRestante > 0) {
      const mins = Math.floor(tiempoRestante / 60000)
      const segs = Math.floor((tiempoRestante % 60000) / 1000)
      return await reply({
        text: tr(`⏳ Ya trabajaste recientemente.\n\n> Podés volver a trabajar en *${mins}m ${segs}s*`, `⏳ عملت مؤخراً.\n\n> يمكنك العمل مجدداً بعد *${mins}د ${segs}ث*`)
      })
    }

    const trabajo = TRABAJOS[Math.floor(Math.random() * TRABAJOS.length)]

    // Calculamos bonus según items en inventario
    let bonus = 0
    for (const itemId of eco.inventario) {
      bonus += BONUS_ITEMS[itemId] ?? 0
    }

    // Ganancia aleatoria dentro de un rango del trabajo elegido
    const variacion = Math.floor(Math.random() * 50) - 25 // ±25
    const ganado = Math.max(10, trabajo.base + variacion + bonus)

    const nuevoBolsillo = eco.bolsillo + ganado

    db.setEco(sender, {
      bolsillo: nuevoBolsillo,
      lastWork: ahora
    })

    await react('💰')
    await reply({
      text: `${trabajo.texto}\n\n` +
        `💰 *Ganaste:* ${ganado} Fragmentos${bonus > 0 ? ` *(+${bonus} bonus de items)*` : ''}\n` +
        `👜 *Bolsillo actual:* ${nuevoBolsillo} Fragmentos\n\n` +
        tr(`> ⏳ Próximo trabajo en *1 hora*`, `> ⏳ العمل التالي بعد *ساعة واحدة*`)
    })
  }
}