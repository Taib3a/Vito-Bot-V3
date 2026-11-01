import { db } from "../../database/db.js";

const VALIDOS = ["hombre", "mujer"];

export default {
  name: ["setgenero", "setgenre", "جنسي", "جنس"],
  description: { es: "Configura tu género (hombre/mujer) para tu perfil", ar: "يضبط جنسك (ذكر/أنثى) لملفك الشخصي" },
  category: "info, المعلومات",
  ownerOnly: false,

  async run({ sender, text, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const genero = (text || "").trim().toLowerCase();

    if (!VALIDOS.includes(genero)) {
      return await reply({ text: tr(`⚠️ Solo puedes elegir *hombre* o *mujer*.\n\n*Ejemplo:* .setgenero hombre`, `⚠️ يمكنك اختيار *hombre* أو *mujer* فقط.\n\n*مثال:* .setgenero hombre`) });
    }

    db.setGenero(sender, genero);

    return await reply({ text: tr(`✅ Listo, ahora te identificas como: *${genero}*`, `✅ تم، أنت الآن تُعرّف نفسك كـ: *${genero}*`) });
  }
};