import { jidNormalizedUser } from "@whiskeysockets/baileys";

export default {
  name: ["del", "delete", "eliminar", "حذف"],
  description: { es: "Elimina un mensaje respondiendo a él", ar: "يحذف رسالة بالردّ عليها" },
  category: "grupos, المجموعات",
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,

  async run({ sock, from, msg, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const quoted = msg.message?.extendedTextMessage?.contextInfo;

    if (!quoted?.stanzaId) {
      return await reply({
        text: tr("『✖️』Rᥱs⍴onძᧉ ⍺Ɩ ᴍᧉn𝗌⍺jᧉ qᥙᧉ qᥙіᧉꭇᧉ𝗌 ᧉƖіmіn⍺ꭇ.", "『✖️』ردّ على الرسالة التي تريد حذفها.")
      });
    }

    try {
      await sock.sendMessage(from, {
        delete: {
          remoteJid: from,
          id: quoted.stanzaId,
          participant: jidNormalizedUser(quoted.participant),
          fromMe: false
        }
      });
    } catch (e) {
      await reply({
        text: tr(`❌ No se pudo eliminar:\n${e.message}`, `❌ تعذّر الحذف:\n${e.message}`)
      });
    }
  }
}