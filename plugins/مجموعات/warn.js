import { db } from "../../database/db.js";

function cleanJid(jid = "") {
  if (!jid) return "";
  const atIndex = jid.lastIndexOf("@");
  if (atIndex === -1) return jid.split(":")[0];
  const userPart = jid.slice(0, atIndex).split(":")[0];
  const domainPart = jid.slice(atIndex + 1);
  return `${userPart}@${domainPart}`;
}

export default {
  name: ["warn", "advertir", "تحذير", "انذار"],
  description: { es: 'Advierte a un miembro del grupo', ar: 'ينبّه عضواً في المجموعة' },
  category: "grupos, المجموعات",
  groupOnly: true,
  adminOnly: true,

  async run({ sock, from, msg, groupMeta, args, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    try {
      const participants = groupMeta?.participants || []

      const contextInfo = msg.message?.extendedTextMessage?.contextInfo || msg.message?.imageMessage?.contextInfo || msg.message?.videoMessage?.contextInfo
      const mentioned = contextInfo?.mentionedJid || []

      let targetRaw = contextInfo?.participantAlt || contextInfo?.participant || mentioned[0]
      if (!targetRaw) return await reply({ text: tr(`⚠️ Menciona o responde al usuario que deseas advertir.`, `⚠️ اذكر المستخدم الذي تريد تحذيره أو ردّ عليه.`) })

      const cleanTarget = targetRaw.split(':')[0]
      let targetJid = cleanJid(cleanTarget)
      if (cleanTarget.endsWith('@lid')) {
        const match = participants.find(p => p.lid === cleanTarget)
        if (match) targetJid = cleanJid(match.id)
      }

      const targetParticipant = participants.find(p => cleanJid(p.id) === targetJid)
      if (targetParticipant?.admin === 'admin' || targetParticipant?.admin === 'superadmin') {
        return await reply({ text: tr(`❌ No puedes advertir a otro administrador.`, `❌ لا يمكنك تحذير مشرف آخر.`) })
      }

      const groupData = db.getGroup(from) || {}
      const currentWarns = groupData.warns || {}
      if (!currentWarns[targetJid]) currentWarns[targetJid] = []

      const adminName = msg.pushName || "Admin"
      const razon = args.join(" ") || tr("No se especificó una razón.", "لم يُحدَّد سبب.")
      const targetNum = targetJid.split('@')[0]

      currentWarns[targetJid].push({
        razon,
        fecha: new Date().toLocaleDateString("es-CO"),
        by: adminName,
        targetNum: targetNum
      })

      db.setGroup(from, { ...groupData, warns: currentWarns })

      const totalWarns = currentWarns[targetJid].length
      const willKick = totalWarns >= 3

      let texto = tr(`⚠️ *¡USUARIO ADVERTIDO!* ⚠️\n\n`, `⚠️ *تم تحذير المستخدم!* ⚠️\n\n`)
      texto += tr(`👤 *Usuario:* @${targetNum}\n`, `👤 *المستخدم:* @${targetNum}\n`)
      texto += `👮‍♂️ *Por:* ${adminName}\n`
      texto += `📝 *Razón:* ${razon}\n`
      texto += `📊 *Advertencias:* ${totalWarns}/3\n\n`

      if (willKick) {
        texto += tr(`❗ *Este usuario alcanzó el límite de 3 advertencias y será expulsado del grupo.*`, `❗ *وصل هذا المستخدم إلى حد 3 تحذيرات وسيُطرد من المجموعة.*`)
      }

      await sock.sendMessage(from, {
        text: texto,
        mentions: [targetJid]
      }, { quoted: msg })

      if (willKick) {
        try {
          const botJid = cleanJid(sock.user?.id || "")
          const botLid = sock.user?.lid ? cleanJid(sock.user.lid) : null
          const botParticipant = participants.find(p =>
            cleanJid(p.id) === botJid ||
            (botLid && cleanJid(p.id) === botLid) ||
            (p.lid && cleanJid(p.lid) === botJid) ||
            (p.lid && botLid && cleanJid(p.lid) === botLid)
          )
          const botIsAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin'

          if (!botIsAdmin) {
            await reply({ text: tr(`⚠️ No pude expulsar a @${targetNum} porque no tengo permisos de administrador.`, `⚠️ لم أستطع طرد @${targetNum} لأنني لا أملك صلاحيات المشرف.`), mentions: [targetJid] })
          } else {
            await sock.groupParticipantsUpdate(from, [targetJid], 'remove')
            currentWarns[targetJid] = []
            db.setGroup(from, { ...groupData, warns: currentWarns })
            await reply({ text: tr(`👢 @${targetNum} fue expulsado del grupo por acumular 3 advertencias.`, `👢 طُرد @${targetNum} من المجموعة بعد 3 تحذيرات.`), mentions: [targetJid] })
          }
        } catch (kickErr) {
          console.error(tr("Error al expulsar tras 3 warns:", "خطأ أثناء الطرد بعد 3 تحذيرات:"), kickErr)
          await reply({ text: tr(`⚠️ No pude expulsar a @${targetNum} (revisa mis permisos de admin).`, `⚠️ لم أستطع طرد @${targetNum} (تحقق من صلاحياتي كمشرف).`), mentions: [targetJid] })
        }
      }

    } catch (err) {
      console.error(tr("Error en comando warn:", "خطأ في أمر warn:"), err)
      await reply({ text: tr("❌ Ocurrió un error interno al ejecutar el comando.", "❌ حدث خطأ داخلي أثناء تنفيذ الأمر.") })
    }
  }
}
