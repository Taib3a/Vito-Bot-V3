import { db } from '../../database/db.js'

export default {
  name: ["مشرفين-فقط"],
  description: 'يشغّل أو يطفئ وضع المشرفين فقط في المجموعة',
  category: "المجموعات",
  groupOnly: true,
  adminOnly: true,

  async run({ from, args, reply }) {

    const opcion = args[0]?.toLowerCase()

    if (opcion !== 'on' && opcion !== 'off') {
      return await reply({ text: ( '⚠️ استخدم: *.مشرفين-فقط on* أو *.مشرفين-فقط off*') })
    }

    const activar = opcion === 'on'
    db.setGroup(from, { adminMode: activar })

    await reply({
      text: activar
        ? ( '🔒 *تم تفعيل وضع المشرفين.* فقط المشرفون والمالك يمكنهم استخدام الأوامر في هذه المجموعة.')
        : ( '🔓 *تم إطفاء وضع المشرفين.* يمكن لجميع المستخدمين استخدام الأوامر مجدداً.')
    })
  }
}