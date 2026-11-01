export default {
  name: ["join", "unirse", "انضمام"],
  description: { es: 'El bot se une a un grupo por link', ar: 'ينضم البوت إلى مجموعة عبر رابط' },
  category: "grupos, المجموعات",
  ownerOnly: true,

  async run({ sock, text, usedPrefix, react, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    await react('⏳')

    if (!text) return await reply({
      text:
        tr(`❌ Pega el link del grupo.\n\n`, `❌ الصق رابط المجموعة.\n\n`) +
        `💡 *${usedPrefix}join https://chat.whatsapp.com/XXXXXX*`
    })

    const match = text.trim().match(/chat\.whatsapp\.com\/([A-Za-z0-9]{20,24})/)

    if (!match) return await reply({
      text: tr(`❌ El link no es válido.\n\nDebe ser: *https://chat.whatsapp.com/XXXXXX*`, `❌ الرابط غير صالح.\n\nيجب أن يكون: *https://chat.whatsapp.com/XXXXXX*`)
    })

    const code = match[1]

    try {
      await sock.groupAcceptInvite(code)
      await react('✅')
      await reply({
        text:
          tr(`✅ *Bot unido al grupo*\n\n`, `✅ *انضم البوت إلى المجموعة*\n\n`) +
          `🔗 *Link:* ${text.trim()}\n\n` +
          `⚔️ _Yuta Okotsu MD | DuarteXV_`
      })
    } catch (e) {
      await react('❌')
      console.log(e)
      await reply({ text: tr(`❌ No se pudo unir: ${e.message}`, `❌ تعذّر الانضمام: ${e.message}`) })
    }
  }
}