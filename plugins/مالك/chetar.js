import { db } from '../../database/db.js'
import config from '../../config.js' // ajusta la ruta según dónde esté tu config.js

const MAX = 999_999_999_999

// Owners desde config (ownerNumber + coOwners)
const OWNERS = [...(config.ownerNumber || []), ...(config.coOwners || [])].map(String)

function cleanJid(jid = '') {
  if (!jid) return ''
  const atIndex = jid.lastIndexOf('@')
  if (atIndex === -1) return jid.split(':')[0]
  const userPart = jid.slice(0, atIndex).split(':')[0]
  const domainPart = jid.slice(atIndex + 1)
  return `${userPart}@${domainPart}`
}

export default {
  name: ["chetar", "فلوس"],
  description: 'Da Fragmentos a un usuario (solo owners)',
  category: "owner, المالك",
  ownerOnly: true,

  async run({ sock, from, sender, args, msg, groupMeta, resolveLid, reply, react, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    // ── Verificación de quién ejecuta ──
    let realSender = sender
    if (realSender.endsWith('@lid')) {
      const found = groupMeta?.participants?.find((p) => p.id === realSender || p.lid === realSender)
      realSender = found?.id || (await resolveLid(realSender))
    }
    const senderNum = cleanJid(realSender).split('@')[0]
    const botNum = cleanJid(sock.user?.id || '').split('@')[0]

    // El bot/subbot NO puede ejecutar el comando (evita que se autochete)
    if (msg.key?.fromMe || senderNum === botNum) {
      await react('🚫')
      return reply({ text: tr('⚠︎ El bot no puede usar este comando.', '⚠︎ لا يمكن للبوت استخدام هذا الأمر.') })
    }

    // Solo owners de la lista
    if (!OWNERS.includes(senderNum)) {
      await react('🚫')
      return reply({ text: tr('⚠︎ Solo los owners pueden usar este comando.', '⚠︎ المالك فقط يمكنه استخدام هذا الأمر.') })
    }

    const contextInfo = msg?.message?.extendedTextMessage?.contextInfo

    // Objetivo: mencionado > mensaje citado > tú
    let targetJid = contextInfo?.mentionedJid?.[0] || contextInfo?.participant || realSender

    // Resolución de LID
    if (targetJid.endsWith('@lid') || isNaN(targetJid.split('@')[0])) {
      const found = groupMeta?.participants?.find((p) => p.id === targetJid || p.lid === targetJid)
      if (found?.id) targetJid = found.id
    }
    if (targetJid.endsWith('@lid')) {
      targetJid = await resolveLid(targetJid)
    }

    const target = cleanJid(targetJid)

    const campo = args.some((a) => a.toLowerCase() === 'banco') ? 'banco' : 'bolsillo'
    const num = args.find((a) => /^\d+$/.test(a))
    const cantidad = Math.min(Number(num) || MAX, MAX)

    try {
      const eco = db.getEco(target)
      db.setEco(target, { [campo]: Math.min(eco[campo] + cantidad, MAX) })
      const after = db.getEco(target)

      await react('💰')
      await sock.sendMessage(from, {
        text:
          `💰 *Listo:* @${target.split('@')[0]} recibió *${cantidad.toLocaleString('es-ES')}* Fragmentos en el *${campo}*.\n\n` +
          `👜 Bolsillo: *${after.bolsillo.toLocaleString('es-ES')}*\n` +
          `🏦 Banco: *${after.banco.toLocaleString('es-ES')}*`,
        mentions: [target]
      }, { quoted: msg })
    } catch (e) {
      console.error('Error chetar:', e)
      await react('❌')
      await reply({ text: tr('⚠︎ No se pudo dar el dinero.', '⚠︎ تعذّر إعطاء المال.') })
    }
  }
}