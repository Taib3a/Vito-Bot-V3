import axios from "axios"


export default {
  name: ["بوت", "gpt", "ia", "chatgpt", "اسأل", "ذكاء"],
  description: "Conversa con ChatGPT | تحدّث مع ChatGPT",
  category: "ia, ذكاء",
  ownerOnly: false,


  async run({ sock, from, msg, senderNum, text, cmdName, reply, react }) {
    // اللغة من اسم الأمر الذي كتبه المستخدم: ".بوت" عربي، ".gpt" إسباني
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";


    const T = {
      es: {
        noText: `❓ ¿Qué querés preguntarle a ChatGPT?\n\n💡 Ej: .chatgpt hola, cómo estás`,
        noResult: `❌ No pude obtener respuesta de ChatGPT, intentá de nuevo.`,
        error: `❌ Ocurrió un error al conectar con la API de ChatGPT.`,
      },
      ar: {
        noText: `❓ ماذا تريد أن تسأل ChatGPT؟\n\n💡 مثال: .بوت مرحبا، كيف حالك`,
        noResult: `❌ لم أستطع الحصول على رد من ChatGPT، حاول مرة أخرى.`,
        error: `❌ حدث خطأ أثناء الاتصال بـ ChatGPT API.`,
      },
    }[lang];


    const senderJid = msg?.sender || `${senderNum}@s.whatsapp.net`;


    const buildContextInfo = () => ({
      mentionedJid: [senderJid],
      isForwarded: true,
      forwardingScore: 1,
      forwardedNewsletterMessageInfo: {
        newsletterJid: global.my?.canal1,
        newsletterName: global.botNames?.[Math.floor(Math.random() * (global.botNames?.length || 1))],
        serverMessageId: -1,
      },
    });


    const sendWithChannel = async (texto) => {
      return await sock.sendMessage(from, {
        text: texto,
        mentions: [senderJid],
        contextInfo: buildContextInfo()
      }, { quoted: msg });
    };


    if (!text) {
      return await sendWithChannel(T.noText);
    }


    try {
      await react("🤖")


      const { data } = await axios.get("https://api.alyacore.xyz/ai/chatgpt", {
        params: {
          text,
          key: "Duarte-zz12"
        }
      })


      if (!data.status || !data.result) {
        await react("❌")
        return await sendWithChannel(T.noResult)
      }


      await sendWithChannel(data.result)
      await react("✅")
    } catch (err) {
      console.error(err)
      await react("❌")
      await sendWithChannel(T.error)
    }
  }
}
