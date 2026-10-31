import { broadcastReaccionCanal } from '../../core/subbotManager.js'

export default {
  name: ["reactcanal", "تفاعل-قناة"],
  description: 'Hace que todos los bots reaccionen a un mensaje de canal',
  category: "utils, الأدوات",
  ownerOnly: false,

  async run({ sock, args, reply, react, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const [link, emoji] = args

    if (!link || !emoji) {
      return await reply({ text: tr('⚠️ Usa: *.reactcanal <link del mensaje> <emoji>*', '⚠️ استخدم: *.reactcanal <رابط الرسالة> <إيموجي>*') })
    }

    const match = link.match(/channel\/([A-Za-z0-9]+)\/(\d+)/)
    if (!match) {
      return await reply({ text: tr('❌ Ese no es un link válido de mensaje de canal.', '❌ هذا ليس رابط رسالة قناة صالحاً.') })
    }

    const [, invite, serverId] = match

    await react('🐢')
    await reply({ text: tr(`🐢 *Procesando...* Reaccionando con ${emoji} en todos los bots (~5 segundos).`, `🐢 *جارٍ المعالجة...* التفاعل بـ ${emoji} في كل البوتات (~5 ثوانٍ).`) })

    // El JID real del canal (xxxx@newsletter), no el código de invitación
    let canalJid
    try {
      const meta = await sock.newsletterMetadata('invite', invite)
      canalJid = meta.id
    } catch (e) {
      console.error('No se pudo obtener el canal:', e)
      await react('❌')
      return await reply({ text: tr('❌ No se pudo encontrar el canal. Verifica el link.', '❌ تعذّر العثور على القناة. تحقق من الرابط.') })
    }

    let res
    try {
      res = await broadcastReaccionCanal({ canalJid, serverId, emoji, ventanaMs: 5000 })
    } catch (e) {
      console.error('Error en broadcast:', e)
      await react('❌')
      return await reply({ text: tr('❌ Ocurrió un error al reaccionar.', '❌ حدث خطأ أثناء التفاعل.') })
    }

    if (res.ok > 0) {
      await react('✅')
      await reply({
        text: tr(`✅ Listo: ${res.ok}/${res.total} bot(s) reaccionaron con ${emoji}${res.fail ? ` (${res.fail} fallaron)` : ''}`, `✅ تم: ${res.ok}/${res.total} بوت تفاعل مع ${emoji}${res.fail ? ` (${res.fail} فشلوا)` : ''}`)
      })
    } else {
      await react('❌')
      await reply({ text: tr('❌ Ningún bot pudo reaccionar. Verifica el link.', '❌ لم يستطع أي بوت التفاعل. تحقق من الرابط.') })
    }
  }
}