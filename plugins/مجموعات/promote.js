function cleanJid(jid = "") {
  if (!jid) return "";
  const atIndex = jid.lastIndexOf("@");
  if (atIndex === -1) return jid.split(":")[0];
  const userPart = jid.slice(0, atIndex).split(":")[0];
  const domainPart = jid.slice(atIndex + 1);
  return `${userPart}@${domainPart}`;
}

export default {
  name: ["promote", "daradmin", "ترقية", "رفع"],
  description: { es: 'Promueve a un miembro a administrador', ar: 'يرقّي عضواً إلى مشرف' },
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
    if (!targetRaw) return await reply({ text: tr(`❌ Menciona o responde al usuario para darle admin.`, `❌ اذكر المستخدم لمنحه الإشراف أو ردّ عليه.`) })

    const cleanTarget = targetRaw.split(':')[0]
    let targetJid = cleanJid(cleanTarget)
    if (cleanTarget.endsWith('@lid')) {
      const match = participants.find(p => p.lid === cleanTarget)
      if (match) targetJid = cleanJid(match.id)
    }

    const targetParticipant = participants.find(p => cleanJid(p.id) === targetJid)
    if (targetParticipant?.admin === 'admin' || targetParticipant?.admin === 'superadmin') {
      return await reply({ text: tr(`❌ Este usuario ya es administrador.`, `❌ هذا المستخدم مشرف بالفعل.`) })
    }

    await sock.groupParticipantsUpdate(from, [targetJid], "promote")
    clearGroupCache()

    const targetNum = targetJid.split('@')[0]
    let textoPromote = `│✐꒷★ @${targetNum} h⍺ sıdo pꭇomovıdo ⍺ ⍺dmını𝗌tꭇ⍺doꭇ.\n`
    textoPromote += `> acción hecha por @${senderNum}`

    await sock.sendMessage(from, {
      text: textoPromote,
      contextInfo: { mentionedJid: [targetJid, sender] }
    }, { quoted: msg })
  }
}