import { db } from '../../database/db.js'
import fs from 'fs'
import path from 'path'

export default {
  name: ['saveplugin', 'حفظ-اضافة'], // Nombre plano para evitar fallos en el handler
  description: { es: 'Guarda un archivo de plugin de forma dinámica respondiendo a su código.', ar: 'يحفظ ملف إضافة ديناميكياً بالردّ على كودها.' },
  category: "owner, المالك",

  async run({ sock, from, msg, senderNum, args, usedPrefix, react, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    try {
      const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net'

      // Verificar permisos usando tu db.js
      const isOwner = db.hasRole(senderNum, 'owner') || db.hasRole(senderNum, 'coowner')
      const isSelf = senderNum === botJid

      if (!isOwner && !isSelf) {
        await react('❌')
        return await reply({ text: tr('❌ Este comando solo puede ser usado por el Owner o Co-Owner.', '❌ هذا الأمر للمالك أو المالك المشارك فقط.') })
      }

      // Verificar si responde a un mensaje
      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
      if (!quotedMsg) {
        await react('❌')
        return await reply({ text: tr(`⚠️ Debes *responder al mensaje que contiene el código* del plugin.`, `⚠️ يجب *الرد على الرسالة التي تحتوي على كود* الإضافة.`) })
      }

      // Extraer texto
      const codigo = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text
      if (!codigo) {
        await react('❌')
        return await reply({ text: tr(`❌ El mensaje respondido no contiene texto válido.`, `❌ الرسالة المُردود عليها لا تحتوي على نص صالح.`) })
      }

      // Validar argumentos
      if (!args[0]) {
        await react('💡')
        return await reply({ 
          text: tr(`💡 *Uso correcto:* 💡\n`, `💡 *الاستخدام الصحيح:* 💡\n`) +
                tr(`Responde al código y usa: *${usedPrefix}saveplugin [carpeta]/[nombre].js*\n\n`, `ردّ على الكود واستخدم: *${usedPrefix}saveplugin [مجلد]/[اسم].js*\n\n`) +
                `*Ejemplos:*\n` +
                `• ${usedPrefix}saveplugin owner/prueba.js\n` +
                `• ${usedPrefix}saveplugin herramientas/calculadora.js\n` +
                `• ${usedPrefix}saveplugin miplugin.js`
        })
      }

      await react('🕒')

      const baseDir = process.cwd()
      let inputPath = args[0].replace(/\.\.\//g, '')
      if (!inputPath.endsWith('.js')) inputPath += '.js'

      const targetPath = path.join(baseDir, 'plugins', inputPath)
      const targetDir = path.dirname(targetPath)

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }

      fs.writeFileSync(targetPath, codigo, 'utf8')
      await react('✅')
      
      return await reply({
        text: tr(`✅ *¡Plugin guardado con éxito!*\n\n`, `✅ *تم حفظ الإضافة بنجاح!*\n\n`) +
              `📂 *Carpeta:* \`plugins/${path.relative(path.join(baseDir, 'plugins'), targetDir) || 'Raíz'}\`\n` +
              tr(`📄 *Archivo:* \`${path.basename(targetPath)}\``, `📄 *الملف:* \`${path.basename(targetPath)}\``)
      })

    } catch (error) {
      await react('❌')
      await reply({ text: tr(`❌ Error en saveplugin: ${error.message}`, `❌ خطأ في saveplugin: ${error.message}`) })
      console.error(error)
    }
  }
}
