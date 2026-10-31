import { db } from '../../database/db.js'

export default {
  name: ["modoadmin", "مشرفين-فقط"],
  description: 'Activa o desactiva el modo solo-admins en el grupo',
  category: "grupos, المجموعات",
  groupOnly: true,
  adminOnly: true,

  async run({ from, args, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const opcion = args[0]?.toLowerCase()

    if (opcion !== 'on' && opcion !== 'off') {
      return await reply({ text: tr('⚠️ Usa: *.modoadmin on* o *.modoadmin off*', '⚠️ استخدم: *.modoadmin on* أو *.modoadmin off*') })
    }

    const activar = opcion === 'on'
    db.setGroup(from, { adminMode: activar })

    await reply({
      text: activar
        ? '🔒 *Modo admin activado.* Solo admins, owner y coowners pueden usar comandos en este grupo.'
        : '🔓 *Modo admin desactivado.* Todos los usuarios pueden usar comandos de nuevo.'
    })
  }
}