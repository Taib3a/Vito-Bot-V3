import { downloadMediaMessage } from '@whiskeysockets/baileys'

export default {
  name: ['pvt', 'خاص'],
  description: { es: 'Convierte un video respondido en nota de video', ar: 'يحوّل فيديو مردوداً عليه إلى ملاحظة فيديو' },
  category: "misc, متنوع",
  ownerOnly: false,

  async run({ sock, from, msg, react, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const msgType = Object.keys(msg.message || {})[0]
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo
    const quoted = contextInfo?.quotedMessage
    const quotedType = quoted ? Object.keys(quoted)[0] : null

    const isVideo = msgType === 'videoMessage'
    const isQuotedVideo = quotedType === 'videoMessage'

    if (!isVideo && !isQuotedVideo) {
      return reply({ text: tr('❌ Responde a un video para convertirlo en nota de video (pvt).', '❌ ردّ على فيديو لتحويله إلى رسالة فيديو (pvt).') })
    }

    await react('⏳')

    const targetMsg = isVideo
      ? msg
      : {
          key: {
            remoteJid: from,
            id: contextInfo?.stanzaId,
            participant: contextInfo?.participant
          },
          message: quoted
        }

    let videoBuffer
    try {
      videoBuffer = await downloadMediaMessage(targetMsg, 'buffer', {}, { sock })
    } catch (e) {
      await react('❌')
      return reply({ text: tr('❌ No se pudo descargar el video.', '❌ تعذّر تحميل الفيديو.') })
    }

    await sock.sendMessage(from, {
      video: videoBuffer,
      mimetype: 'video/mp4',
      ptv: true,
      contextInfo: {
        mentionedJid: [msg.key?.participant || from],
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363420979328566@newsletter',
          newsletterName: '⏤͟͟͞͞★꙲⃝͟𝐘𝐔𝐓𝐀 𝐎𝐊𝐊𝐎𝐓𝐒𝐔 │  𝐂𝐇𝐀𝐍𝐍𝐄𝐋 ◌Ⳋ𝅄',
          serverMessageId: -1
        }
      }
    }, { quoted: msg })

    await react('✅')
  }
}