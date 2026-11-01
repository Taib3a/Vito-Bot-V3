import axios from 'axios';

const API_URL = 'https://api.lempi.lat/tools/wabancheck';
const API_KEY = 'Duarte-1311-2026';

function limpiarNumero(input) {
  return input.replace(/\D/g, '');
}

export default {
  name: ["checkban", "banwa", "تحقق"],
  description: { es: "Verifica si un número de WhatsApp está baneado", ar: "يتحقق مما إذا كان رقم واتساب محظوراً" },
  category: "utils, الأدوات",
  ownerOnly: false,

  async run({ text, reply, usedPrefix, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    if (!text) {
      return await reply({
        text: tr(`⚠️ Por favor, ingresa un número.\n\n📝 *Ejemplo:* ${usedPrefix}${cmdName} 573131111111`, `⚠️ من فضلك، أدخل رقماً.\n\n📝 *مثال:* ${usedPrefix}${cmdName} 573131111111`)
      });
    }

    const numero = limpiarNumero(text);
    if (numero.length < 8) {
      return await reply({ text: tr(`❌ Número inválido.`, `❌ رقم غير صالح.`) });
    }

    await reply({ text: tr(`🌾 Consultando estado del número, espere un momento...`, `🌾 جارٍ الاستعلام عن حالة الرقم، انتظر لحظة...`) });

    try {
      const { data } = await axios.get(API_URL, {
        params: {
          lang: 'es',
          apikey: API_KEY,
          number: numero
        },
        timeout: 15000
      });

      if (!data?.status || !data?.resultado?.status) {
        return await reply({ text: tr(`❌ No se pudo verificar el número. Intenta de nuevo más tarde.`, `❌ تعذّر التحقق من الرقم. حاول مرة أخرى لاحقاً.`) });
      }

      const d = data.resultado.data;
      const info = d.violation_info || {};

      let texto = `乂 *B A N W A*\n\n`;
      texto += `乂 *D E T A L L E*\n\n`;
      texto += `┌  ◦  *ɴᴜᴍᴇʀᴏ:* ${data.resultado.number}\n`;
      texto += `│  ◦  *ʙᴀɴᴇᴀᴅᴏ:* ${d.isBanned ? '✅ sí' : '❌ no'}\n`;
      texto += `│  ◦  *ᴘᴇʀᴍᴀɴᴇɴᴛᴇ:* ${d.isPermanent ? '✅ sí' : '❌ no'}\n`;
      texto += `│  ◦  *ɴᴇᴄᴇѕɪᴛᴀ ᴡᴀ ᴏꜰɪᴄɪᴀʟ:* ${d.isNeedOfficialWa ? '✅ sí' : '❌ no'}\n`;
      texto += `│  ◦  *ᴛɪᴘᴏ ᴅᴇ ᴠɪᴏʟᴀᴄɪᴏɴ:* ${d.violation_type ?? '-'}\n`;
      texto += `│  ◦  *ᴍᴏᴛɪᴠᴏ:* ${d.status_message ?? '-'}\n`;
      texto += `│  ◦  *ᴅᴇѕᴄʀɪᴘᴄɪᴏɴ:* ${info.description ?? '-'}\n`;
      texto += `│  ◦  *ᴅᴜʀᴀᴄɪᴏɴ:* ${info.duration ?? '-'}\n`;
      texto += `│  ◦  *ʀɪᴇѕɢᴏ:* ${info.risk ?? '-'}\n`;
      texto += `└  ◦  *ᴀᴘᴇʟᴀʙʟᴇ ᴇɴ ᴀᴘᴘ:* ${d.in_app_ban_appeal ? '✅ sí' : '❌ no'}`;

      await reply({ text: texto });

    } catch (e) {
      await reply({ text: tr(`❌ Error al consultar: ${e.message}`, `❌ خطأ في الاستعلام: ${e.message}`) });
    }
  }
};