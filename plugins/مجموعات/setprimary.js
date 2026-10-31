import { db } from '../../database/db.js'
import { activeBots, claimOnce } from '../../core/subbotManager.js'

function cleanJid(jid = "") {
  if (!jid) return "";
  const atIndex = jid.lastIndexOf("@");
  if (atIndex === -1) return jid.split(":")[0];
  const userPart = jid.slice(0, atIndex).split(":")[0];
  const domainPart = jid.slice(atIndex + 1);
  return `${userPart}@${domainPart}`;
}

export default {
  name: ["setprimary", "botprincipal", "البوت-الرئيسي"],
  description: 'Establece un bot como primario del grupo',
  category: "grupos, المجموعات",
  groupOnly: true,
  adminOnly: true,

  async run({ from, msg, react, reply, resolveLid, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    if (!claimOnce(msg.key.id)) return

    const parseNum = (jid) => jid ? jid.split('@')[0] : null
    const primary = db.getPrimary(from)

    // Mención directa en el propio mensaje del comando: .setprimary @numero
    const ownMentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []

    // Cita a un mensaje del bot (comportamiento anterior, lo dejamos como fallback)
    const quoted = msg.message?.extendedTextMessage?.contextInfo || msg.message?.imageMessage?.contextInfo || msg.message?.videoMessage?.contextInfo
    const quotedMentions = quoted?.mentionedJid || []
    const targetRaw = ownMentions[0]
      ? cleanJid(ownMentions[0])
      : (quotedMentions[0] ? cleanJid(quotedMentions[0]) : (quoted?.participant ? cleanJid(quoted.participant) : null))

    let quotedSender = null
    if (targetRaw) {
      const resolved = await resolveLid(targetRaw)
      quotedSender = parseNum(cleanJid(resolved))
    }

    const botsActivos = [...activeBots.entries()].filter(([, bot]) => bot.status === 'online')

    if (!quotedSender) {
      let texto = `¿A qué bot quieres como primario?\n\n`
      for (const [, bot] of botsActivos) {
        const num = parseNum(cleanJid(bot.jid)) || 'N/A'
        texto += `  ✦ *${bot.label || 'Sub-Bot'}* → @${num}\n`
      }
      texto += `\nMenciona a ese bot (@número) y ejecuta *.setprimary* de nuevo.`

      const mentionJids = botsActivos.map(([, bot]) => cleanJid(bot.jid)).filter(Boolean)
      return await reply({ text: texto, mentions: mentionJids })
    }

    const esBotValido = botsActivos.some(([, bot]) => parseNum(cleanJid(bot.jid)) === quotedSender)

    if (!esBotValido) {
      return await reply({
        text: tr(`Ese número no es un socket de este bot. Solo puedes poner como primario a un bot o sub-bot activo de esta sesión.`, `هذا الرقم ليس بوتاً فرعياً لهذا البوت. يمكنك تعيين بوت رئيسي أو فرعي نشط من هذه الجلسة فقط.`)
      })
    }

    const whoNum = quotedSender
    const whoJid = cleanJid(`${whoNum}@s.whatsapp.net`)

    if (primary === whoNum) {
      return await reply({ text: tr(`@${whoNum} ya es el bot primario de este grupo.`, `@${whoNum} هو بالفعل البوت الرئيسي لهذه المجموعة.`), mentions: [whoJid] })
    }

    db.setPrimary(from, whoNum)

    await react('✅')
    await reply({
      text:
        tr(`Bot primario establecido\n\n`, `تم تعيين البوت الرئيسي\n\n`) +
        `@${whoNum} es ahora el bot principal.\n` +
        `Los demás bots no responderán en este grupo.`,
      mentions: [whoJid]
    })
  }
}