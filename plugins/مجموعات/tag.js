export default {
  name: ["tag", "تاج", "منشن-فردي"],
  description: { es: "Repite el mensaje de forma nativa con mención invisible a todo el grupo", ar: "يكرّر الرسالة أصلياً مع إشارة خفية لكل المجموعة" },
  category: "grupos, المجموعات",
  groupOnly: true,
  adminOnly: true,

  async run({ sock, from, msg, groupMeta, text, reply, react, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);
    await react('📢');

    const members = groupMeta?.participants || [];
    const mentions = members.map(m => m.id);

    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || 
                      msg.message?.ephemeralMessage?.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    try {
      if (quotedMsg) {
        const messageContent = JSON.parse(JSON.stringify(quotedMsg));
        const messageType = Object.keys(messageContent)[0];

        if (text) {
          if (messageType === 'conversation') {
            messageContent.conversation = text;
          } else if (messageType === 'extendedTextMessage') {
            messageContent.extendedTextMessage.text = text;
          } else if (messageContent[messageType]?.caption !== undefined) {
            messageContent[messageType].caption = text;
          }
        }

        const limpioContextInfo = {
          mentions,
          mentionedJid: mentions,
          isForwarded: false
        };

        if (messageContent[messageType] && typeof messageContent[messageType] === 'object') {
          messageContent[messageType].contextInfo = {
            ...messageContent[messageType].contextInfo,
            ...limpioContextInfo
          };
        }

        await sock.sendMessage(from, {
          forward: {
            key: msg.key,
            message: messageContent
          },
          contextInfo: limpioContextInfo
        }, { quoted: msg });

      } else {
        const textoEnviar = text || tr("📢 ¡Atención a todos!", "📢 انتباه للجميع!");

        await sock.sendMessage(from, {  
          text: textoEnviar,  
          contextInfo: { mentions, mentionedJid: mentions }
        });
      }

      await react('✅');
    } catch (error) {
      console.error("Error en el comando tag:", error);
      await react('❌');
    }
  }
};
