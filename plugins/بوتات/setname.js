import { jidNormalizedUser } from '@whiskeysockets/baileys'
import { db } from '../../database/db.js'

const norm = (j) => (j ? jidNormalizedUser(j) : '')

function botMatchesJid(b, targetJid) {
  const targetNum = targetJid.split('@')[0]
  if (b.jid && norm(b.jid) === targetJid) return true
  if (b.id?.startsWith('sub_') && b.id.slice(4) === targetNum) return true
  return false
}

export default {
  name: ["setname", "cambiarnombre", "اسم-البوت"],
  description: { es: 'Cambia el nombre/label de un bot (principal o subbot)', ar: 'يغيّر اسم/تسمية بوت (رئيسي أو فرعي)' },
  category: "sockets, البوتات الفرعية",
  ownerOnly: false,

  async run({ sock, from, msg, args, reply, sender, resolveLid, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    try {
      const senderJid = norm(sender)
      const currentBotJid = norm(sock.user?.id)

      const esOwnerGlobal = db.hasRole(senderJid, 'owner')
      const esMismoSubbot = senderJid === currentBotJid

      if (!esOwnerGlobal && !esMismoSubbot) {
        return await reply({ text: tr('❌ No tienes permisos para usar este comando.', '❌ ليس لديك صلاحية لاستخدام هذا الأمر.') })
      }

      let rawMessage = msg.message
      if (rawMessage?.ephemeralMessage) rawMessage = rawMessage.ephemeralMessage.message

      const quotedContext = rawMessage?.extendedTextMessage?.contextInfo

      let targetBotJid = null
      let textoBruto = args.join(" ")

      if (esOwnerGlobal) {
        const mentioned = quotedContext?.mentionedJid || []
        const targetRaw = quotedContext?.participant || mentioned[0]

        if (targetRaw) {
          const resolved = await resolveLid(targetRaw)
          targetBotJid = norm(resolved)
        } else {
          targetBotJid = currentBotJid
        }
      } else {
        targetBotJid = currentBotJid
      }

      let nuevoNombre = textoBruto.replace(/@\d+/g, '').trim()

      if (!nuevoNombre || nuevoNombre === '') {
        return await reply({ text: tr('⚠️ Especifica el nuevo nombre para el bot (solo texto limpio).', '⚠️ حدّد الاسم الجديد للبوت (نص فقط).') })
      }

      const esBotRegistrado = db.getAllBots().some(b => botMatchesJid(b, targetBotJid))

      if (esOwnerGlobal && !esBotRegistrado && targetBotJid !== currentBotJid) {
        return await reply({ text: tr('❌ El usuario seleccionado no está registrado como un bot (principal o subbot) en la base de datos.', '❌ المستخدم المحدّد غير مسجّل كبوت (رئيسي أو فرعي) في قاعدة البيانات.') })
      }

      db.setBot(targetBotJid, { label: nuevoNombre })

      const targetNum = targetBotJid.split('@')[0]
      let textoConfirmacion = tr(`✅ *Nombre actualizado con éxito*\n\n🤖 *Bot:* @${targetNum}\n📝 *Nuevo Nombre:* ${nuevoNombre}`, `✅ *تم تحديث الاسم بنجاح*\n\n🤖 *البوت:* @${targetNum}\n📝 *الاسم الجديد:* ${nuevoNombre}`)

      await sock.sendMessage(from, {
        text: textoConfirmacion,
        mentions: [targetBotJid]
      }, { quoted: msg })

    } catch (err) {
      console.error(err)
      await reply({ text: tr(`❌ *Error:* ${err.message}`, `❌ *خطأ:* ${err.message}`) })
    }
  }
}