import { db } from '../../database/db.js'

export default {
  name: ["depositar", "retirar", "ايداع"],
  description: 'Mueve Fragmentos entre bolsillo y banco',
  category: "economy, الاقتصاد",
  ownerOnly: false,

  async run({ sender, cmdName, args, reply, react }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const eco = db.getEco(sender)
    const disponible = cmdName === 'depositar' ? eco.bolsillo : eco.banco

    let cantidad
    const arg = (args[0] || '').toLowerCase()

    if (arg === 'all' || arg === 'todo') {
      cantidad = disponible
    } else {
      cantidad = parseInt(args[0])
    }

    if (!cantidad || isNaN(cantidad) || cantidad <= 0) {
      return await reply({ text: tr(`⚠️ Especifica una cantidad válida.\n\n*Ejemplo:* .${cmdName} 500\n*O:* .${cmdName} all`, `⚠️ حدّد مبلغاً صالحاً.\n\n*مثال:* .${cmdName} 500\n*أو:* .${cmdName} all`) })
    }

    if (cmdName === 'depositar') {
      if (cantidad > eco.bolsillo) {
        return await reply({ text: tr(`❌ No tenés suficientes Fragmentos en el bolsillo.\n\n*Bolsillo:* ${eco.bolsillo} Fragmentos`, `❌ ليس لديك شظايا كافية في جيبك.\n\n*الجيب:* ${eco.bolsillo} شظية`) })
      }

      db.setEco(sender, {
        bolsillo: eco.bolsillo - cantidad,
        banco: eco.banco + cantidad
      })

      await react('🏦')
      await reply({
        text: tr(`🏦 *Depósito exitoso*\n\n`, `🏦 *تم الإيداع بنجاح*\n\n`) +
          `*Depositado:* ${cantidad} Fragmentos\n` +
          `*Bolsillo:* ${eco.bolsillo - cantidad} Fragmentos\n` +
          `*Banco:* ${eco.banco + cantidad} Fragmentos`
      })

    } else if (cmdName === 'retirar') {
      if (cantidad > eco.banco) {
        return await reply({ text: tr(`❌ No tenés suficientes Fragmentos en el banco.\n\n*Banco:* ${eco.banco} Fragmentos`, `❌ ليس لديك شظايا كافية في البنك.\n\n*البنك:* ${eco.banco} شظية`) })
      }

      db.setEco(sender, {
        bolsillo: eco.bolsillo + cantidad,
        banco: eco.banco - cantidad
      })

      await react('👜')
      await reply({
        text: tr(`👜 *Retiro exitoso*\n\n`, `👜 *تم السحب بنجاح*\n\n`) +
          `*Retirado:* ${cantidad} Fragmentos\n` +
          `*Bolsillo:* ${eco.bolsillo + cantidad} Fragmentos\n` +
          `*Banco:* ${eco.banco - cantidad} Fragmentos`
      })
    }
  }
}