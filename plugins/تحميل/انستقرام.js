import axios from "axios";

const API_KEY = "Duarte-zz12";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withRetry = async (fn, attempt = 1) => {
  try {
    return await fn();
  } catch (e) {
    if (e.response?.status === 429 && attempt <= 3) {
      await delay((e.response.headers["retry-after"] || 5) * 1000);
      return withRetry(fn, attempt + 1);
    }
    throw e;
  }
};

const fetchInstagram = (url) =>
  withRetry(async () => {
    const { data } = await axios.get("https://api.alyacore.xyz/dl/instagram", {
      params: { url, key: API_KEY },
    });
    return data;
  });

function inferirTipoReal(dlUrl) {
  try {
    const u = new URL(dlUrl);
    const token = u.searchParams.get("token");
    if (!token) return null;

    const payload = token.split(".")[1];
    if (!payload) return null;

    const json = JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
    const filename = json.filename || "";

    if (/\.(mp4|mov|webm|mkv)$/i.test(filename)) return "video";
    if (/\.(jpe?g|png|webp)$/i.test(filename)) return "image";
    return null;
  } catch {
    return null;
  }
}

export default {
  name: ["instagram", "ig", "igdl", "انستقرام", "انستغرام"],
  description: { es: "Descarga videos/fotos de Instagram (reels, posts)", ar: "ينزّل فيديوهات/صور من إنستغرام (ريلز، منشورات)" },
  category: "dl, التحميل",
  groupOnly: false,

  async run({ sock, from, msg, text, usedPrefix, reply, react, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    try {
      if (!text) {
        return await reply({
          text: tr(`⚠️ Manda el link de Instagram.\n\n💡 *Uso:* ${usedPrefix || "."}ig <link>`, `⚠️ أرسل رابط إنستغرام.\n\n💡 *الاستخدام:* ${usedPrefix || "."}ig <link>`),
        });
      }

      if (!/instagram\.com/.test(text)) {
        return await reply({ text: tr("❌ Ese no parece un link de Instagram válido.", "❌ هذا لا يبدو رابط إنستغرام صالحاً.") });
      }

      await react("⏳");

      const result = await fetchInstagram(text);

      if (!result.status || !result.data?.dl) {
        await react("❌");
        return await reply({ text: tr("❌ No se pudo descargar ese contenido. Puede ser privado o el link no es válido.", "❌ تعذّر تحميل هذا المحتوى. قد يكون خاصاً أو الرابط غير صالح.") });
      }

      const { data } = result;
      const caption = data.title ? tr(`Aquí tienes :D\n\n${data.title}`, `تفضل :D\n\n${data.title}`) : tr("Aquí tienes :D", "تفضل :D");

      const tipoReal = inferirTipoReal(data.dl) || data.type;

      if (tipoReal === "video") {
        await sock.sendMessage(
          from,
          { video: { url: data.dl }, caption, mimetype: "video/mp4" },
          { quoted: msg }
        );
      } else {
        await sock.sendMessage(
          from,
          { image: { url: data.dl }, caption },
          { quoted: msg }
        );
      }

      await react("✅");
    } catch (e) {
      console.error("[instagram]", e);
      await react("❌");
      await reply({ text: tr(`❌ Error al descargar: ${e.message}`, `❌ خطأ في التحميل: ${e.message}`) });
    }
  },
};