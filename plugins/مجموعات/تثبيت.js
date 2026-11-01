import { jidNormalizedUser } from "@whiskeysockets/baileys";

export default {
  name: ["fijar", "تثبيت"],
  description: { es: "Fija un mensaje respondiendo a él", ar: "يثبّت رسالة بالردّ عليها" },
  category: "grupos, المجموعات",
  groupOnly: true,
  adminOnly: true,

  async run({ sock, from, msg, reply, resolveLid, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const quoted = msg.message?.extendedTextMessage?.contextInfo;

    if (!quoted?.stanzaId) {
      return await reply({
        text: tr("『📌』Rᥱs⍴onძᧉ ⍺Ɩ ᴍᧉn𝗌⍺jᧉ qᥙᧉ qᥙіᧉꭇᧉ𝗌 fіj⍺ꭇ.", "『📌』ردّ على الرسالة التي تريد تثبيتها.")
      });
    }

    const isFromMe = !quoted.participant || quoted.participant === sock.user?.id;
    let participant = quoted.participant;

    if (!isFromMe && participant) {
      participant = await resolveLid(participant);
    }

    const pinKey = {
      remoteJid: from,
      id: quoted.stanzaId,
      participant: isFromMe ? undefined : participant,
      fromMe: isFromMe
    };

    try {
      await sock.sendMessage(from, {
        pin: pinKey,
        type: 1
      });

      await reply({ text: tr("『📌』Mensaje fijado.", "『📌』ثُبّتت الرسالة.") });
    } catch (e) {
      await reply({ text: tr(`❌ No se pudo fijar:\n${e.message}`, `❌ تعذّر التثبيت:\n${e.message}`) });
    }
  }
};