import { downloadMediaMessage, jidNormalizedUser } from '@whiskeysockets/baileys'
import axios from 'axios'
import { FormData, Blob } from 'formdata-node'
import { fileTypeFromBuffer } from 'file-type'
import { db } from '../../database/db.js'

const API_URL = 'https://cdn.dix.lat'

const norm = (j) => (j ? jidNormalizedUser(j) : '')

function botMatchesJid(b, targetJid) {
  const targetNum = targetJid.split('@')[0]
  if (b.jid && norm(b.jid) === targetJid) return true
  if (b.id?.startsWith('sub_') && b.id.slice(4) === targetNum) return true
  return false
}

function getContextInfo(rawMessage) {
  if (!rawMessage) return undefined
  const type = Object.keys(rawMessage)[0]
  return rawMessage[type]?.contextInfo
}

async function subirDix(buffer, filename, mimetype) {
  const form = new FormData()
  const blob = new Blob([buffer], { type: mimetype })
  form.append('file', blob, filename)

  const { data } = await axios.post(`${API_URL}/upload`, form, {
    timeout: 120000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    headers: { 'User-Agent': 'Drive-Client' }
  })

  return data
}

export default {
  name: ["setbanner", "cambiarbanner", "بانر-البوت"],
  description: { es: 'Cambia el banner de un subbot o del bot principal', ar: 'يغيّر بانر بوت فرعي أو البوت الرئيسي' },
  category: "sockets, البوتات الفرعية",
  ownerOnly: false,

  async run({ sock, from, msg, reply, sender, resolveLid, cmdName }) {
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

      const quotedContext = getContextInfo(rawMessage)
      let quotedMessage = quotedContext?.quotedMessage
      if (quotedMessage?.ephemeralMessage) quotedMessage = quotedMessage.ephemeralMessage.message

      let targetBotJid = null

      if (esOwnerGlobal) {
        const mentioned = quotedContext?.mentionedJid || []
        const targetRaw = mentioned[0] || quotedContext?.participant

        if (targetRaw) {
          const resolved = await resolveLid(targetRaw)
          targetBotJid = norm(resolved)
        } else {
          targetBotJid = currentBotJid
        }
      } else {
        targetBotJid = currentBotJid
      }

      const esBotRegistrado = db.getAllBots().some(b => botMatchesJid(b, targetBotJid))

      if (esOwnerGlobal && !esBotRegistrado && targetBotJid !== currentBotJid) {
        return await reply({ text: tr('❌ El usuario seleccionado no está registrado como un bot (principal o subbot) en la base de datos.', '❌ المستخدم المحدّد غير مسجّل كبوت (رئيسي أو فرعي) في قاعدة البيانات.') })
      }

      const msgType = rawMessage?.imageMessage ? 'imageMessage' : null
      const quotedType = quotedMessage?.imageMessage ? 'imageMessage' : null

      let targetMsg = null

      if (msgType) {
        targetMsg = msg
      } else if (quotedMessage && quotedType) {
        targetMsg = {
          key: {
            remoteJid: from,
            id: quotedContext.stanzaId,
            participant: quotedContext.participant || quotedContext.remoteJid
          },
          message: quotedMessage
        }
      }

      if (!targetMsg) {
        return await reply({ text: tr('❌ Responde a una imagen o envía una junto al comando para establecer el banner.', '❌ ردّ على صورة أو أرسل واحدة مع الأمر لتعيين البانر.') })
      }

      const buffer = await downloadMediaMessage(targetMsg, 'buffer', {}, { sock })
      if (!buffer || buffer.length === 0) throw new Error('Buffer vacío')

      const detected = await fileTypeFromBuffer(buffer)
      const ext = detected?.ext || 'jpg'
      const mime = detected?.mime || 'image/jpeg'
      const filename = `banner_${Date.now()}.${ext}`

      const uploadResult = await subirDix(buffer, filename, mime)

      if (!uploadResult || !uploadResult.status || !uploadResult.data?.url) {
        throw new Error(tr('El servidor de Dix rechazó la subida.', 'رفض خادم Dix الرفع.'))
      }

      const bannerUrl = uploadResult.data.url

      db.setBot(targetBotJid, { banner: bannerUrl })

      await reply({ text: tr(`✅ *Banner actualizado con éxito*\n\n🤖 *Bot:* @${targetBotJid.split('@')[0]}\n🔗 *URL del Banner:* \n${bannerUrl}`, `✅ *تم تحديث البانر بنجاح*\n\n🤖 *البوت:* @${targetBotJid.split('@')[0]}\n🔗 *رابط البانر:* \n${bannerUrl}`), mentions: [targetBotJid] })
    } catch (err) {
      console.error(err)
      await reply({ text: tr(`❌ *Error:* ${err.message}`, `❌ *خطأ:* ${err.message}`) })
    }
  }
}