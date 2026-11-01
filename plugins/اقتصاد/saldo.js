import { db } from '../../database/db.js'

export default {
  name: ["saldo", "balance", "bal", "رصيدي", "الرصيد"],
  description: { es: 'Muestra tu balance de Fragmentos', ar: 'يعرض رصيد الشظايا' },
  category: "economy, الاقتصاد",
  ownerOnly: false,

  async run({ sender, senderNum, reply, react, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const eco = db.getEco(sender)
    const total = eco.bolsillo + eco.banco

    await react('💎')
    await reply({
      text: tr(`💎 *Balance de Fragmentos*\n` +
        `╰━━━━━━(☆)━━━━━━─╮\n\n` +
        `*👜 Bolsillo:* ${eco.bolsillo} Fragmentos\n` +
        `*🏦 Banco:* ${eco.banco} Fragmentos\n` +
        `*📊 Total:* ${total} Fragmentos`,
        `💎 *رصيد الشظايا*\n` +
        `╰━━━━━━(☆)━━━━━━─╮\n\n` +
        `*👜 المحفظة:* ${eco.bolsillo} شظية\n` +
        `*🏦 البنك:* ${eco.banco} شظية\n` +
        `*📊 الإجمالي:* ${total} شظية`)
    })
  }
}