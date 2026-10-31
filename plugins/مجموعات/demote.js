function cleanJid(jid = "") {
  if (!jid) return "";
  const atIndex = jid.lastIndexOf("@");
  if (atIndex === -1) return jid.split(":")[0];
  const userPart = jid.slice(0, atIndex).split(":")[0];
  const domainPart = jid.slice(atIndex + 1);
  return `${userPart}@${domainPart}`;
}

export default {
  name: ["demote", "quitaradmin", "خفض", "تنزيل"],
  description: 'Quita el administrador a un miembro del grupo',
  category: "grupos, المجموعات",
  groupOnly: true,
  botAdmin: true,
  adminOnly: true,

  async run({ sock, from, msg, groupMeta, clearGroupCache, reply, senderNum, sender, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const participants = groupMeta?.participants || []

    const contextInfo = msg.message?.extendedTextMessage?.contextInfo || msg.message?.imageMessage?.contextInfo || msg.message?.videoMessage?.contextInfo
    const mentioned = contextInfo?.mentionedJid || []

    let targetRaw = contextInfo?.participantAlt || contextInfo?.participant || mentioned[0]
    if (!targetRaw) return await reply({ text: tr(`❌ Menciona o responde al usuario para remover su admin.`, `❌ اذكر المستخدم لإزالة إشرافه أو ردّ عليه.`) })

    const cleanTarget = targetRaw.split(':')[0]
    let targetJid = cleanJid(cleanTarget)
    if (cleanTarget.endsWith('@lid')) {
      const match = participants.find(p => p.lid === cleanTarget)
      if (match) targetJid = cleanJid(match.id)
    }

    const targetParticipant = participants.find(p => cleanJid(p.id) === targetJid)

    if (targetParticipant?.admin === 'superadmin') {
      return await reply({ text: tr(`❌ No le puedes quitar el admin al creador del grupo.`, `❌ لا يمكنك إزالة إشراف منشئ المجموعة.`) })
    }
    if (targetParticipant?.admin !== 'admin') {
      return await reply({ text: tr(`❌ Este usuario no es administrador.`, `❌ هذا المستخدم ليس مشرفاً.`) })
    }

    await sock.groupParticipantsUpdate(from, [targetJid], "demote")
    clearGroupCache()

    const targetNum = targetJid.split('@')[0]
    let textoDemote = `│✐꒷★ @${targetNum} h⍺ sıdo ძᧉgꭇ⍺ძ⍺ძo ძᧉ ⍺dmını𝗌tꭇ⍺doꭇ.\n`
    textoDemote += `> acción hecha por @${senderNum}`

    await sock.sendMessage(from, {
      text: textoDemote,
      contextInfo: { mentionedJid: [targetJid, sender] }
    }, { quoted: msg })
  }
}