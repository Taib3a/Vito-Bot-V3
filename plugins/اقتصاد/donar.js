import { db } from '../../database/db.js'

function cleanJid(jid = '') {
  if (!jid) return ''
  const atIndex = jid.lastIndexOf('@')
  if (atIndex === -1) return jid.split(':')[0]
  const userPart = jid.slice(0, atIndex).split(':')[0]
  const domainPart = jid.slice(atIndex + 1)
  return `${userPart}@${domainPart}`
}

export default {
  name: ["donar", "تحويل", "تبرع"],
  description: { es: 'Dona Fragmentos de tu bolsillo a otra persona', ar: 'يتبرّع بالشظايا من محفظتك لشخص آخر' },
  category: "economy, الاقتصاد",
  ownerOnly: false,

  async run({ sender, args, msg, groupMeta, resolveLid, reply, react, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const contextInfo = msg?.message?.extendedTextMessage?.contextInfo

    let targetJid = null
    if (contextInfo?.mentionedJid?.length > 0) {
      targetJid = contextInfo.mentionedJid[0]
    } else if (contextInfo?.participant) {
      targetJid = contextInfo.participant
    }

    if (!targetJid) {
      return await reply({ text: tr(`⚠️ Menciona a alguien o responde su mensaje.\n\n*Ejemplo:* .donar @user 500`, `⚠️ اذكر شخصاً أو ردّ على رسالته.\n\n*مثال:* .donar @user 500`) })
    }

    if (targetJid.endsWith('@lid') || isNaN(targetJid.split('@')[0])) {
      const found = groupMeta?.participants?.find((p) => p.id === targetJid || p.lid === targetJid)
      if (found?.id) targetJid = found.id
    }

    if (targetJid.endsWith('@lid')) {
      targetJid = await resolveLid(targetJid)
    }

    const target = cleanJid(targetJid)

    if (target === sender) {
      return await reply({ text: tr(`❌ No puedes donarte Fragmentos a ti mismo.`, `❌ لا يمكنك التبرع بالشظايا لنفسك.`) })
    }

    // El monto es el primer argumento que sea número/all, sin importar si @mención va antes
    const rawArg = args.find((a) => a.toLowerCase() === 'all' || a.toLowerCase() === 'todo' || !isNaN(parseInt(a)))
    const senderEco = db.getEco(sender)

    let cantidad
    if (rawArg?.toLowerCase() === 'all' || rawArg?.toLowerCase() === 'todo') {
      cantidad = senderEco.bolsillo
    } else {
      cantidad = parseInt(rawArg)
    }

    if (!cantidad || isNaN(cantidad) || cantidad <= 0) {
      return await reply({ text: tr(`⚠️ Especifica una cantidad válida.\n\n*Ejemplo:* .donar @user 500\n*O:* .donar @user all`, `⚠️ حدّد مبلغاً صالحاً.\n\n*مثال:* .donar @user 500\n*أو:* .donar @user all`) })
    }

    if (cantidad > senderEco.bolsillo) {
      return await reply({ text: tr(`❌ No tenés suficientes Fragmentos en el bolsillo.\n\n*Bolsillo:* ${senderEco.bolsillo} Fragmentos`, `❌ ليس لديك شظايا كافية في جيبك.\n\n*الجيب:* ${senderEco.bolsillo} شظية`) })
    }

    const targetEco = db.getEco(target)

    db.setEco(sender, { bolsillo: senderEco.bolsillo - cantidad })
    db.setEco(target, { bolsillo: targetEco.bolsillo + cantidad })

    await react('🎁')
    await reply({
      text: tr(`🎁 *Donación exitosa*\n\n`, `🎁 *تم التبرع بنجاح*\n\n`) +
        `*De:* @${sender.split('@')[0]}\n` +
        `*Para:* @${target.split('@')[0]}\n` +
        `*Cantidad:* ${cantidad} Fragmentos\n\n` +
        `*Tu bolsillo:* ${senderEco.bolsillo - cantidad} Fragmentos`,
      mentions: [sender, target]
    })
  }
}