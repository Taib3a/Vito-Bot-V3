import { db } from '../../database/db.js'
import { claimOnce } from '../../core/subbotManager.js'

export default {
  name: ["delprimary", "quitarprincipal", "حذف-الرئيسي"],
  description: { es: 'Quita el bot primario del grupo', ar: 'يزيل البوت الرئيسي من المجموعة' },
  category: "grupos, المجموعات",
  groupOnly: true,
  adminOnly: true,

  async run({ from, msg, react, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    if (!claimOnce(msg.key.id)) return

    const primary = db.getPrimary(from)
    if (!primary) {
      return await reply({
        text:
          tr(`⚠️ *Este grupo no tiene bot primario establecido.*\n\n`, `⚠️ *لا يوجد بوت رئيسي معيّن لهذه المجموعة.*\n\n`) +
          tr(`💡 Usa *.setprimary* para establecer uno.`, `💡 استخدم *.setprimary* لتعيين واحد.`)
      })
    }

    db.delPrimary(from)

    await react('🗑️')
    await reply({
      text:
        tr(`✅ *Bot primario eliminado*\n\n`, `✅ *أُزيل البوت الرئيسي*\n\n`) +
        tr(`Todos los bots y sub-bots responderán en este grupo ahora.`, `ستستجيب جميع البوتات والفرعية في هذه المجموعة الآن.`)
    })
  }
}